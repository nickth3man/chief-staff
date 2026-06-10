import 'dotenv/config';
import { watchTranscripts } from './watcher';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let requireApproval = false;
  let oncePath: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--require-approval') requireApproval = true;
    if (args[i] === '--once' && args[i + 1]) {
      oncePath = args[i + 1]!;
      i += 1;
    }
  }

  await watchTranscripts({ requireApproval, once: oncePath });
}

main()
  .then(() => {
    // In --once mode, watchTranscripts resolves after a single file is
    // processed; force exit so the chokidar watcher and OpenAI sockets
    // don't keep the process alive. In watcher mode (no --once),
    // watchTranscripts never resolves — this .then() never fires — and
    // the process keeps running until SIGINT (see watcher.ts).
    process.exit(0);
  })
  .catch((err) => {
    console.error('[wf4] failed:', err);
    process.exit(1);
  });
