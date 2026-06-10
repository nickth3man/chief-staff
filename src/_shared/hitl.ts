import * as readline from 'node:readline';
import { HITL } from '../../config/workflows';

export interface HitlPrompt {
  question: string;
  defaultValue?: string;
  options?: string[];
}

export interface HitlResponse {
  answer: string;
  mode: 'cli' | 'web';
}

export async function askUser(prompt: HitlPrompt): Promise<HitlResponse> {
  if (HITL.mode === 'web') {
    return askViaWeb(prompt);
  }
  return askViaCli(prompt);
}

function askViaCli(prompt: HitlPrompt): Promise<HitlResponse> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const suffix = prompt.options ? ` (${prompt.options.join('/')})` : '';
    rl.question(`${prompt.question}${suffix}: `, (answer) => {
      rl.close();
      const response: HitlResponse = {
        answer: answer.trim() || (prompt.defaultValue ?? ''),
        mode: 'cli',
      };
      resolve(response);
    });
  });
}

async function askViaWeb(prompt: HitlPrompt): Promise<HitlResponse> {
  const { promptQueue } = await import('../server/promptQueue');
  const answer = await promptQueue.waitForAnswer(prompt);
  return { answer, mode: 'web' };
}
