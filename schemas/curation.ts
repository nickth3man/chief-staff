import { z } from 'zod';

export const FeedItemSchema = z.object({
  guid: z.string(),
  title: z.string(),
  description: z.string(),
  pubDate: z.string(),
  author: z.string().optional(),
  thumbnail: z.string().optional(),
  url: z.string().url(),
});

export const ScoredItemSchema = z.object({
  Title: z.string(),
  Score: z.number().min(0).max(10),
  Action: z.enum(['READ', 'MAYBE', 'SKIP']),
  Category: z.string(),
  Summary: z.string(),
  'So what?': z.string(),
  'Who cares?': z.string(),
  'What now?': z.string(),
  'Prompts Referenced': z.string().nullish(),
  'Original Prompts': z.string().nullish(),
  'Evidence Type': z.string().nullish(),
  'Has Numbers?': z.enum(['Yes', 'No']).nullish(),
  'Has Real Use Case?': z.enum(['Yes', 'No']).nullish(),
  'Has Clear Action?': z.enum(['Yes', 'No']).nullish(),
  'Source Link': z.string().url().nullish(),
  'Secondary Source': z.string().url().nullish(),
  Notes: z.string().nullish(),
  Timestamp: z.string().datetime(),
  'Shelf life?': z.enum(['Short Term', 'Medium Term', 'Long Term']),
});

export const ScoredItemsSchema = z.array(ScoredItemSchema);

export const CurationConfigSchema = z.object({
  feeds: z.array(z.string().url()),
});
