import Parser from 'rss-parser';
import type { FeedItem } from '@apptypes/curation';

const parser = new Parser({
  timeout: 10_000,
  headers: { 'User-Agent': 'chief-staff/0.1 (local)' },
});

export async function fetchFeed(url: string, cap: number): Promise<FeedItem[]> {
  try {
    const feed = await parser.parseURL(url);
    const items = (feed.items ?? []).slice(0, cap);
    return items.map((it): FeedItem => {
      const pubDate = it.pubDate ?? it.isoDate ?? new Date().toISOString();
      return {
        guid: it.guid ?? it.id ?? it.link ?? `${url}#${pubDate}`,
        title: it.title ?? '(untitled)',
        description: stripHtml(it.contentSnippet ?? it.content ?? it.summary ?? ''),
        pubDate,
        author: it.creator ?? it.author,
        thumbnail: it.enclosure?.url,
        url: it.link ?? url,
      };
    });
  } catch (err) {
    console.warn(`[curation] failed to fetch ${url}: ${(err as Error).message}`);
    return [];
  }
}

export async function fetchAllFeeds(feeds: string[], cap: number): Promise<FeedItem[]> {
  const results = await Promise.allSettled(feeds.map((f) => fetchFeed(f, cap)));
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim();
}
