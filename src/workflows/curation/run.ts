import 'dotenv/config';
import { runCuration } from './steps';

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
    console.error('Usage: pnpm tsx src/workflows/curation/run.ts --config <feeds.json>');
    process.exit(1);
  }
  const items = await runCuration({ configPath });
  console.log(`[curation] done. ${items.length} items scored.`);
}

main()
  .then(() => {
    // Force exit: see weekly-digest/run.ts for rationale. The OpenAI SDK
    // and rss-parser can both hold the event loop open after main() returns.
    process.exit(0);
  })
  .catch((err) => {
    console.error('[curation] failed:', err);
    process.exit(1);
  });
