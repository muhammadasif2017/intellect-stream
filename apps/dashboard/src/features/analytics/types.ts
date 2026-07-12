/* Mirrors analytics-service's trends read API row. */
export interface TrendRow {
  date: string;
  category: string;
  verdict: 'approved' | 'rejected' | 'pending' | string;
  count: number;
}
