import OpenAI from 'openai';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Agent as HttpsAgent } from 'node:https';

export interface TtsResult {
  audioPath: string;
  model: string;
  costUsd: number;
}

export async function synthesizeSpeech(
  text: string,
  outPath: string,
  opts: { voice?: string; model?: string } = {}
): Promise<TtsResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set. See .env.example.');
  }
  const model = opts.model ?? process.env.WF1_TTS_MODEL ?? 'openai/gpt-4o-mini-tts';
  const voice = opts.voice ?? process.env.TTS_VOICE ?? 'alloy';

  const c = new OpenAI({
    apiKey,
    baseURL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    // See src/_shared/llm.ts for the rationale. Disable keepalive so the
    // TTS client's sockets don't keep the Node process alive after main().
    httpAgent: new HttpsAgent({ keepAlive: false }),
  });

  const speech = await c.audio.speech.create({
    model,
    voice: voice as any,
    input: text,
    response_format: 'mp3',
  });

  const buffer = Buffer.from(await speech.arrayBuffer());
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, buffer);

  return {
    audioPath: outPath,
    model,
    costUsd: 0,
  };
}
