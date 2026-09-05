// Hand-written declarations, same convention as product-id.d.cts.
export type ScrapeFailureCode = 'ANTI_BOT' | 'SCRAPE_FAILED';

export interface ScrapeFailureClassification {
  code: ScrapeFailureCode;
  vendor: string | null;
  status: number | null;
  title: string;
  message: string;
  technical: string;
  evidence: string[];
}

export declare const SCRAPE_FAILURE_CODES: readonly ScrapeFailureCode[];

export declare function classifyScrapeFailure(evidence: {
  status?: number | null;
  bodySample?: string | null;
  message?: string;
  url?: string | null;
}): ScrapeFailureClassification;

export declare function scrapeFailureSummary(c: ScrapeFailureClassification): {
  title: string;
  message: string;
  code: ScrapeFailureCode;
};
