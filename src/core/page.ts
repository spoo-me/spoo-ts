/**
 * Unified pagination over the API's mixed conventions.
 *
 * The API paginates with page/pageSize (camelCase on /urls, snake_case on
 * other resources) and returns list envelopes under varying keys. Resources
 * normalize both into this one Page shape; consumers only ever see it.
 */

export interface PageFetcher<T> {
  (page: number): Promise<{ items: T[]; total: number; hasNext: boolean }>;
}

export class Page<T> implements AsyncIterable<T> {
  /** Items of the current page. */
  readonly items: T[];
  /** Total items across all pages, as reported by the API. */
  readonly total: number;
  /** 1-indexed page number of this page. */
  readonly page: number;

  private readonly fetcher: PageFetcher<T>;
  private readonly hasNext: boolean;

  constructor(
    current: { items: T[]; total: number; hasNext: boolean },
    page: number,
    fetcher: PageFetcher<T>,
  ) {
    this.items = current.items;
    this.total = current.total;
    this.hasNext = current.hasNext;
    this.page = page;
    this.fetcher = fetcher;
  }

  hasNextPage(): boolean {
    return this.hasNext;
  }

  async getNextPage(): Promise<Page<T>> {
    if (!this.hasNext) {
      throw new Error("No next page. Check hasNextPage() before calling.");
    }
    const next = this.page + 1;
    return new Page(await this.fetcher(next), next, this.fetcher);
  }

  /** Iterate items across all remaining pages, fetching lazily. */
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let current: Page<T> = this;
    for (;;) {
      for (const item of current.items) yield item;
      if (!current.hasNextPage()) return;
      current = await current.getNextPage();
    }
  }
}
