export const MODELS = {
  chief: process.env.CHIEF_DEFAULT_MODEL ?? 'inclusionai/ring-2.6-1t',
  wf1: {
    llm: process.env.WF1_LLM_MODEL ?? 'inclusionai/ring-2.6-1t',
    tts: process.env.WF1_TTS_MODEL ?? 'openai/gpt-4o-mini-tts',
  },
  wf2: {
    llm: process.env.WF2_LLM_MODEL ?? 'inclusionai/ring-2.6-1t',
  },
  wf3: {
    llm: process.env.WF3_LLM_MODEL ?? 'inclusionai/ring-2.6-1t',
  },
  wf4: {
    schema: process.env.WF4_SCHEMA_MODEL ?? 'inclusionai/ring-2.6-1t',
    llm: process.env.WF4_LLM_MODEL ?? 'inclusionai/ring-2.6-1t',
    email: process.env.WF4_EMAIL_MODEL ?? 'inclusionai/ring-2.6-1t',
  },
  orchestrator: process.env.ORCHESTRATOR_MODEL ?? 'inclusionai/ring-2.6-1t',
} as const;

export const WORKFLOW_KNOBS = {
  wf2: {
    chunkSize: Number(process.env.WF2_CHUNK_SIZE ?? 10),
    tierConfirm: (process.env.WF2_TIER_CONFIRM ?? 'true').toLowerCase() === 'true',
    fetchCapPerFeed: Number(process.env.WF2_FETCH_CAP_PER_FEED ?? 5),
    timeWindowHours: Number(process.env.WF2_TIME_WINDOW_HOURS ?? 24),
  },
  wf3: {
    fetchCapPerFeed: Number(process.env.WF3_FETCH_CAP_PER_FEED ?? 5),
  },
} as const;

export const TTS = {
  voice: process.env.TTS_VOICE ?? 'alloy',
  format: (process.env.TTS_FORMAT ?? 'mp3') as 'mp3' | 'wav' | 'opus',
} as const;

export const SENDER = {
  name: process.env.SENDER_NAME ?? 'Chief of Staff',
  email: process.env.SENDER_EMAIL ?? 'chief-of-staff@acmecorp.com',
} as const;

export const HITL = {
  mode: (process.env.HITL_MODE ?? 'cli') as 'cli' | 'web',
  requireApproval: (process.env.REQUIRE_APPROVAL ?? 'false').toLowerCase() === 'true',
} as const;

export const SERVER = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const;

export const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
