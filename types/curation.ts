export interface FeedItem {
  guid: string;
  title: string;
  description: string;
  pubDate: string;
  author?: string;
  thumbnail?: string;
  url: string;
}

export type ShelfLife = 'Short Term' | 'Medium Term' | 'Long Term';

export type Action = 'READ' | 'MAYBE' | 'SKIP';

export interface ScoredItem {
  Title: string;
  Score: number;
  Action: Action;
  Category: string;
  Summary: string;
  'So what?': string;
  'Who cares?': string;
  'What now?': string;
  'Prompts Referenced'?: string | null;
  'Original Prompts'?: string | null;
  'Evidence Type'?: string | null;
  'Has Numbers?'?: 'Yes' | 'No' | null;
  'Has Real Use Case?'?: 'Yes' | 'No' | null;
  'Has Clear Action?'?: 'Yes' | 'No' | null;
  'Source Link'?: string | null;
  'Secondary Source'?: string | null;
  Notes?: string | null;
  Timestamp: string;
  'Shelf life?': ShelfLife;
}

export interface CurationConfig {
  feeds: string[];
}
