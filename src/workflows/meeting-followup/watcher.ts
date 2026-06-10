import chokidar from 'chokidar';
import { promises as fs } from 'node:fs';
import { paths } from '@config/paths';
import { runFollowup } from './steps';

export async function watchTranscripts(opts: { requireApproval?: boolean; once?: string }): Promise<void> {
  if (opts.once) {
    await runFollowup({ transcriptPath: opts.once, requireApproval: opts.requireApproval });
    return;
  }

  const watcher = chokidar.watch(paths.assets.transcripts, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 },
  });

  watcher.on('add', async (filePath) => {
    if (!filePath.endsWith('.txt')) return;
    try {
      const stat = await fs.stat(filePath);
      if (stat.size === 0) return;
      console.log(`[wf4] new transcript: ${filePath}`);
      await runFollowup({ transcriptPath: filePath, requireApproval: opts.requireApproval });
    } catch (err) {
      console.error(`[wf4] failed to process ${filePath}:`, err);
    }
  });

  console.log(`[wf4] watching ${paths.assets.transcripts}`);

  process.on('SIGINT', async () => {
    await watcher.close();
    console.log('[wf4] watcher closed');
    process.exit(0);
  });
}
