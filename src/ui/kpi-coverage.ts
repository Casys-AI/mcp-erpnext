export interface MissingValuation {
  item_code: string;
  warehouse: string;
  stock_uom: string;
  revenue: number;
  lineCount: number;
}

/** Complete population totals with a bounded list of missing valuations. */
export interface ValuationCoverage {
  value: number;
  costedRevenue: number;
  uncostedRevenue: number;
  currency: string;
  costedLineCount: number;
  uncostedLineCount: number;
  missingValuationCount: number;
  missingItemCount: number;
  missingValuations: MissingValuation[];
  omittedValuationCount: number;
}
