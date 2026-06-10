import { chatCompletion } from '../../_shared/llm';
import { ScoredItemsSchema } from '@schemas/curation';
import type { FeedItem, ScoredItem } from '@apptypes/curation';
import { MODELS } from '@config/workflows';
import type { LiveRunLogger } from '../../_shared/liveLog';

const SCORE_SYSTEM = `You are a news curator scoring articles for an enterprise audience. For EACH article, produce a strict JSON object with these fields:

- Title (string, copy from input)
- Score (number 0-10)
- Action ("READ" 8-10, "MAYBE" 4-7, "SKIP" 0-3)
- Category (one of: AI Models, AI Tools, Enterprise Tech, Research, Industry, Consumer, Policy)
- Summary (one sentence)
- "So what?" (one sentence)
- "Who cares?" (one sentence)
- "What now?" (one sentence)
- "Prompts Referenced" (string or null)
- "Original Prompts" (string or null)
- "Evidence Type" (one of: Engineering Benchmark, Analyst Consensus, Industry Report, Real-World Case, Speculation)
- "Has Numbers?" ("Yes" or "No")
- "Has Real Use Case?" ("Yes" or "No")
- "Has Clear Action?" ("Yes" or "No")
- "Source Link" (URL)
- "Secondary Source" (URL or null)
- Notes (string or null)
- "Shelf life?" ("Short Term" / "Medium Term" / "Long Term")

Score each item on these 4 questions:
1. So what? (magnitude of impact)
2. Who cares? (blast radius)
3. What now? (strategic posture)
4. Shelf life? (relevance duration)

Output a strict JSON object of the shape: { "items": [...] }. No commentary.`;

const SCORE_USER = (items: FeedItem[]) => `Score the following ${items.length} items. Respond with strict JSON only.

${items
  .map(
    (it, i) =>
      `[${i + 1}] title: ${it.title}\n    description: ${it.description.slice(0, 400)}\n    url: ${it.url}\n    pubDate: ${it.pubDate}`
  )
  .join('\n\n')}`;

export interface ScoreChunkOpts {
  /** When provided, the LLM call is recorded on this live logger. */
  logger?: LiveRunLogger;
  /** Phase label for the live log, e.g. the chunk index. */
  phase?: string;
}

export async function scoreChunk(items: FeedItem[], opts: ScoreChunkOpts = {}): Promise<ScoredItem[]> {
  if (items.length === 0) return [];
  if (opts.logger && opts.phase) {
    await opts.logger.event('step-score-chunk', { model: MODELS.wf2.llm, items: items.length, phase: opts.phase });
  }
  const t0 = Date.now();
  let result;
  try {
    result = await chatCompletion(
      MODELS.wf2.llm,
      [
        { role: 'system', content: SCORE_SYSTEM },
        { role: 'user', content: SCORE_USER(items) },
      ],
      { responseFormat: 'json' }
    );
  } catch (err) {
    if (opts.logger) {
      await opts.logger.llmCall(
        MODELS.wf2.llm,
        { content: '', tokensIn: 0, tokensOut: 0, costUsd: 0 },
        Date.now() - t0,
        { error: err instanceof Error ? err.message : String(err) }
      );
    }
    throw err;
  }
  if (opts.logger) {
    await opts.logger.llmCall(MODELS.wf2.llm, result, Date.now() - t0);
  }
  const parsed = JSON.parse(result.content);
  const arr: unknown[] = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
  // Coerce `null` -> `undefined` for the schema's optional fields (some LLMs,
  // including inclusionai/ring-2.6-1t, emit explicit `null` for absent values
  // rather than omitting the key). Also filter out items that lack the
  // required `Title` field — they are truncated/garbage and would fail Zod.
  const ts = new Date().toISOString();
  const cleaned = arr
    .filter((row: any) => row && typeof row === 'object' && typeof row.Title === 'string' && row.Title.length > 0)
    .map((row: any) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = v === null ? undefined : v;
      }
      out.Timestamp = ts;
      return out;
    });
  return ScoredItemsSchema.parse(cleaned);
}
