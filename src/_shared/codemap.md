# src/_shared/

## Responsibility

Central service layer providing cross-cutting infrastructure capabilities consumed by all four workflow sub-agents and the orchestrator. Encapsulates LLM communication, text-to-speech synthesis, CSV file I/O, run-level and live-event logging, human-in-the-loop prompting, email confirmation generation, and organization-context file discovery. Every module in this directory is a **facade over I/O-bound or third-party resources** — no module stores mutable application state or owns business logic specific to any single workflow.

## Design

### Patterns

- **Facade / Service Object** — each module exposes a small number of async functions or a single class that isolates a concern (e.g., `chatCompletion()` in `llm.ts`, `synthesizeSpeech()` in `tts.ts`, `LiveRunLogger` in `liveLog.ts`).
- **Idempotent Resource Management** — `LiveRunLogger` registers itself in a module-level `Set` on construction and removes itself on `complete()`/`fail()`. A single `process.on('exit')` hook (installed once via `installExitHookOnce()`) synchronously closes leaked file descriptors, preventing fd leaks in long-running or test-heavy environments.
- **Strategy (mode dispatch)** — `askUser()` in `hitl.ts` dispatches to `askViaCli()` or `askViaWeb()` based on the `HITL.mode` config value; the web variant lazy-imports `../server/promptQueue` to avoid server-only dependencies in CLI runs.
- **Time-boxed Execution** — `withDeadline()` in `llm.ts` races a promise against a `setTimeout`-based timer and throws `LLMTimeoutError` on expiry. The caller also wires an `AbortController` to cancel the underlying HTTP request so sockets are freed promptly.

### Key Interfaces

| Interface / Type | Module | Purpose |
|---|---|---|
| `OrgContextRow` | `context.ts` | Row shape for organisation-context CSV files |
| `LLMResult` | `llm.ts` | Structured LLM response: content, model, token counts, cost |
| `LLMTimeoutError` | `llm.ts` | Custom error for deadline-expired LLM calls |
| `TtsResult` | `tts.ts` | Output of TTS: file path, model, cost |
| `LiveLogEvent` | `liveLog.ts` | Schema for each JSONL line in the live run log |
| `LLMCallResult` | `liveLog.ts` | Subset of LLMResult consumed by the logger (content preview + costs) |
| `RunLog` | `runLog.ts` | Run summary record written as JSON + indexed in CSV |
| `CostRow` | `runLog.ts` | Per-model cost entry appended to the metrics cost CSV |
| `HitlPrompt` / `HitlResponse` | `hitl.ts` | Contract for human-in-the-loop interactions |
| `LiveRunLogger` | `liveLog.ts` | Class encapsulating a JSONL log file with init/event/llmCall/complete/fail lifecycle |

### Error Handling Philosophy

- `llm.ts` surfaces timeouts immediately via `LLMTimeoutError` (no retries internally); retry logic is a workflow-level concern.
- `liveLog.ts` uses best-effort synchronous fd cleanup on `process('exit')` — catches and swallows errors from already-closed descriptors.
- `csv.ts` exposes both high-level (`readAll`, `parseCsv`, `appendRow`) and low-level (`parseLine`, `escapeCell`) primitives so callers can handle parsing errors at the appropriate layer.

## Flow

### LLM Call Flow (`llm.ts`)
```
caller → chatCompletion(model, messages, opts)
           ↓
         client() → creates OpenAI SDK instance (no keepalive, 0 retries, 2m timeout)
           ↓
         OpenAI SDK: chat.completions.create(…, { signal: controller.signal })
           ↓
         withDeadline(callPromise, deadlineMs)  ← Promise.race against setTimeout
           ↓
         On success       → compute tokensIn, tokensOut (incl. reasoning tokens), costUsd
         On timeout       → controller.abort()  → re-throw LLMTimeoutError
           ↓
         Returns LLMResult { content, model, tokensIn, tokensOut, costUsd }
```

### Live Logging Flow (`liveLog.ts` + `runLog.ts`)
```
orchestrator/workflow
    ↓
  newRunId() → uuidv4()
  createLiveLogger(runId, workflow) → LiveRunLogger instance
    ↓
  logger.open()       → mkdir + truncate file + write init event
  logger.event()      → append step event as JSONL
  logger.llmCall()    → append llm-call event with token/cost preview
  logger.complete()   → append complete event → close file
  logger.fail(err)    → append failed event with stack → close file
    ↓
  writeRunLog()       → write { runId, workflow, status, tokens, cost } JSON
  appendRunIndex()    → append one row to outbox/runs/index.csv
  appendCost()        → append one row to metrics/cost.csv
```

### HITL Dispatch (`hitl.ts`)
```
askUser(prompt)
    ↓
  HITL.mode === 'web'?
    ├─ yes → lazy-import server/promptQueue → promptQueue.waitForAnswer(prompt)
    └─ no  → readline.createInterface → stdin question → return { answer, mode: 'cli' }
```

### CSV Utilities Flow (`csv.ts`)
```
readAll(filePath)     → fs.readFile → parseCsv(text) → Record<string, string>[]
parseCsv(text)        → parseCsvRaw → extract header, map cells to records
appendRow(path, row)  → ensureFileWithHeader → escapeCell → fs.appendFile
escapeCell(value)     → null→'', quote/commas→quoted, returns safe CSV cell
```

### Context Discovery Flow (`context.ts`)
```
loadOrgContext(csvPath)         → read → split lines → parse header → map rows
findOrgContextByEmail(csvPath)  → scan for email column → find matching line → parse row
findClientFile(rootDir, company, inviteeName)
    ↓
  slugify(company) → readdir → fuzzy-match company dir
    ↓
  readdir(companyDir) → slugify(inviteeName) + 'saas-performance-assessment' → fuzzy-match file
    ↓
  return full path or null
```

### Email Confirmation Flow (`email.ts`)
```
writeConfirmation(event)
    ↓
  generateBriefingSlug(event name) → build .txt file path under outbox/confirmations
    ↓
  mkdir + write formatted confirmation email body
    ↓
  return file path
```

### TTS Synthesis Flow (`tts.ts`)
```
synthesizeSpeech(text, outPath, opts)
    ↓
  resolve model from opts → env → default
  resolve voice from opts → env → 'alloy'
    ↓
  OpenAI SDK: audio.speech.create({ model, voice, input, response_format: 'mp3' })
    ↓
  Buffer.from(arrayBuffer) → mkdir → writeFile
    ↓
  return TtsResult { audioPath, model, costUsd: 0 }
```

## Integration

### Dependency Graph (internal)
```
  llm.ts          → openai (npm), node:https
  tts.ts          → openai (npm), node:https, node:fs, node:path
  liveLog.ts      → @config/paths, node:fs
  runLog.ts       → uuid (npm), ../../config/paths, ./csv, ./liveLog
  csv.ts          → node:fs
  context.ts      → node:fs, node:path, ../../agents/_shared/strings
  email.ts        → node:fs, node:path, ../../config/paths, ../../agents/_shared/strings
  hitl.ts         → node:readline, ../../config/workflows
                  → (lazy) ../server/promptQueue
```

### Configuration Dependencies

| Module | Config Source | Keys Used |
|---|---|---|
| `llm.ts` | Env (runtime) | `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` |
| `tts.ts` | Env + `@config/workflows` | `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `WF1_TTS_MODEL`, `TTS_VOICE` |
| `liveLog.ts` | `@config/paths` | `paths.logs` |
| `runLog.ts` | `@config/paths` | `paths.outbox.runs`, `paths.metrics.root`, `paths.metrics.cost` |
| `hitl.ts` | `@config/workflows` | `HITL.mode` |
| `email.ts` | `@config/paths` | `paths.outbox.confirmations` |
| `context.ts` | (none directly) | (reads CSV files at paths supplied by callers) |

### Consumer Map

| Consumer Module | Modules Used |
|---|---|
| `src/orchestrator/orchestrator.ts` | `llm` (chatCompletion), `runLog` (createLiveLogger, newRunId), `liveLog` (type: LiveRunLogger) |
| `src/workflows/briefing-prep/steps.ts` | `llm`, `tts`, `context`, `email`, `runLog`, `liveLog`, `hitl` |
| `src/workflows/curation/steps.ts` | `csv` (appendRow), `runLog`, `liveLog` |
| `src/workflows/curation/score.ts` | `llm`, `liveLog` |
| `src/workflows/meeting-followup/steps.ts` | `csv` (appendRow), `runLog`, `liveLog` |
| `src/workflows/meeting-followup/prompts.ts` | `llm`, `liveLog` |
| `src/workflows/weekly-digest/steps.ts` | `llm`, `runLog`, `liveLog` |
| `src/server/routes/api.ts` | `runLog` (appendRunIndex, newRunId, writeRunLog), `csv` (readAll) |

### Environment Variables

| Variable | Default | Consumed By | Purpose |
|---|---|---|---|
| `OPENROUTER_API_KEY` | — | `llm.ts`, `tts.ts` | API key for OpenRouter gateway |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | `llm.ts`, `tts.ts` | Base URL for OpenRouter API |
| `HITL_MODE` | `cli` | `hitl.ts` | Human-in-the-loop channel (`cli` \| `web`) |
| `TTS_VOICE` | `alloy` | `tts.ts` | TTS voice selection |
| `WF1_TTS_MODEL` | `openai/gpt-4o-mini-tts` | `tts.ts` | TTS model override for workflow 1 |
| `LOGS_DIR` | `logs` | `liveLog.ts` via `paths` | Directory for JSONL run logs |
| `METRICS_DIR` | `metrics` | `runLog.ts` via `paths` | Directory for cost metrics CSV |
| `OUTBOX_DIR` | `outbox` | `runLog.ts`, `email.ts` via `paths` | Root output directory |
