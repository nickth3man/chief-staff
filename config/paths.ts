import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, '..');

export const paths = {
  assets: {
    consultantX: path.join(PROJECT_ROOT, process.env.ASSETS_CONSULTANT_DIR ?? 'assets/consultant_x'),
    transcripts: path.join(PROJECT_ROOT, process.env.ASSETS_TRANSCRIPTS_DIR ?? 'assets/transcripts'),
    meetingDocuments: path.join(PROJECT_ROOT, process.env.ASSETS_MEETING_DOCS_DIR ?? 'assets/meeting-documents'),
  },
  outbox: {
    root: path.join(PROJECT_ROOT, process.env.OUTBOX_DIR ?? 'outbox'),
    confirmations: path.join(PROJECT_ROOT, process.env.OUTBOX_DIR ?? 'outbox', 'confirmations'),
    briefings: path.join(PROJECT_ROOT, process.env.OUTBOX_DIR ?? 'outbox', 'briefings'),
    audio: path.join(PROJECT_ROOT, process.env.OUTBOX_DIR ?? 'outbox', 'audio'),
    meetingNotes: path.join(PROJECT_ROOT, process.env.OUTBOX_DIR ?? 'outbox', 'meeting_notes'),
    drafts: path.join(PROJECT_ROOT, process.env.OUTBOX_DIR ?? 'outbox', 'drafts'),
    runs: path.join(PROJECT_ROOT, process.env.OUTBOX_DIR ?? 'outbox', 'runs'),
    feedSummaries: path.join(PROJECT_ROOT, process.env.OUTBOX_DIR ?? 'outbox', 'feed_summaries.csv'),
    tasks: path.join(PROJECT_ROOT, process.env.OUTBOX_DIR ?? 'outbox', 'tasks.csv'),
    kanban: path.join(PROJECT_ROOT, process.env.OUTBOX_DIR ?? 'outbox', 'kanban_cards.csv'),
    weeklyDigest: path.join(PROJECT_ROOT, process.env.OUTBOX_DIR ?? 'outbox', 'weekly_digest.md'),
    feedDigest: path.join(PROJECT_ROOT, process.env.OUTBOX_DIR ?? 'outbox', 'feed_digest.html'),
    context: path.join(PROJECT_ROOT, process.env.OUTBOX_DIR ?? 'outbox', 'context.csv'),
  },
  logs: path.join(PROJECT_ROOT, process.env.LOGS_DIR ?? 'logs'),
  metrics: {
    root: path.join(PROJECT_ROOT, process.env.METRICS_DIR ?? 'metrics'),
    cost: path.join(PROJECT_ROOT, process.env.METRICS_DIR ?? 'metrics', 'cost.csv'),
  },
  testRecords: {
    root: path.join(PROJECT_ROOT, process.env.TEST_RECORDS_DIR ?? 'test_records'),
    event: path.join(PROJECT_ROOT, process.env.TEST_RECORDS_DIR ?? 'test_records', 'event.json'),
    feeds: path.join(PROJECT_ROOT, process.env.TEST_RECORDS_DIR ?? 'test_records', 'feeds.json'),
    industryFeeds: path.join(PROJECT_ROOT, process.env.TEST_RECORDS_DIR ?? 'test_records', 'industry_feeds.json'),
    transcript: path.join(PROJECT_ROOT, process.env.TEST_RECORDS_DIR ?? 'test_records', 'transcript.txt'),
  },
} as const;

export type Paths = typeof paths;
