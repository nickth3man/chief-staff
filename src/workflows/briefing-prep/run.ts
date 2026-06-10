import 'dotenv/config';
import { runBriefingPrep } from './steps';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let eventPath = '';
  let bypassDelay = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--event' && args[i + 1]) {
      eventPath = args[i + 1]!;
      i += 1;
    } else if (args[i] === '--bypass-delay') {
      bypassDelay = true;
    }
  }
  if (!eventPath) {
    console.error('Usage: pnpm tsx src/workflows/briefing-prep/run.ts --event <path> [--bypass-delay]');
    process.exit(1);
  }

  const briefing = await runBriefingPrep({ eventPath, bypassDelay });
  console.log(`[wf1] briefing generated for ${briefing.event['Event Name']}`);
  console.log(`[wf1] runId: ${briefing.runId}`);
}

main()
  .then(() => {
    // Force exit: see weekly-digest/run.ts for rationale.
    process.exit(0);
  })
  .catch((err) => {
    console.error('[wf1] failed:', err);
    process.exit(1);
  });
