import 'dotenv/config';
import { runWeeklyDigest } from './steps';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let configPath = '';
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--config' && args[i + 1]) {
      configPath = args[i + 1]!;
      i += 1;
    }
  }
  if (!configPath) {
    console.error('Usage: pnpm tsx src/workflows/weekly-digest/run.ts --config <industry_feeds.json>');
    process.exit(1);
  }
  const md = await runWeeklyDigest({ configPath });
  console.log(`[wf3] digest written. ${md.length} chars.`);
}

main()
  .then(() => {
    // Force exit: the OpenAI SDK's default agentkeepalive keeps idle
    // sockets alive after main() returns, so the event loop never drains
    // naturally for short-lived CLI scripts. process.exit() guarantees
    // a clean exit immediately after the workflow completes.
    process.exit(0);
  })
  .catch((err) => {
    console.error('[wf3] failed:', err);
    process.exit(1);
  });
