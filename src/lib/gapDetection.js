export const DEFAULT_SEVERITY_CONFIG = {
  significantGapRatio: 1,
  prolongedDays: 5,
  significantAbsoluteGapWhenZeroReserve: 100000,
};

export function detectLiquidityGap(forecast, minimumReserve = 0, config = {}) {
  const reserve = Math.max(0, Number(minimumReserve) || 0);
  const thresholds = { ...DEFAULT_SEVERITY_CONFIG, ...config };
  if (!Array.isArray(forecast) || forecast.length === 0) {
    return {
      status: 'Insufficient evidence',
      severity: 'Insufficient evidence to make a reliable forecast',
      first_shortage_date: null,
      maximum_gap: 0,
      gap_duration_days: 0,
      recovery_date: null,
      reserve,
      rows: [],
    };
  }

  const rows = forecast.map((row) => ({
    ...row,
    required_liquidity_gap: Math.max(0, reserve - Number(row.closing_cash || 0)),
  }));
  const gapRows = rows.filter((row) => row.required_liquidity_gap > 0);
  if (!gapRows.length) {
    return {
      status: 'No gap',
      severity: 'No projected funding gap',
      first_shortage_date: null,
      maximum_gap: 0,
      gap_duration_days: 0,
      total_gap_days: 0,
      recovery_date: null,
      minimum_projected_cash: Math.min(...rows.map((r) => r.closing_cash)),
      reserve,
      rows,
    };
  }

  const firstIndex = rows.findIndex((row) => row.required_liquidity_gap > 0);
  let recoveryIndex = -1;
  for (let i = firstIndex + 1; i < rows.length; i += 1) {
    if (rows[i].required_liquidity_gap === 0) {
      recoveryIndex = i;
      break;
    }
  }
  const episodeEnd = recoveryIndex === -1 ? rows.length : recoveryIndex;
  const firstEpisode = rows.slice(firstIndex, episodeEnd).filter((row) => row.required_liquidity_gap > 0);
  const maximumGap = Math.max(...gapRows.map((row) => row.required_liquidity_gap));
  const ratio = reserve > 0 ? maximumGap / reserve : Infinity;
  const significant = reserve > 0
    ? ratio >= thresholds.significantGapRatio || firstEpisode.length >= thresholds.prolongedDays
    : maximumGap >= thresholds.significantAbsoluteGapWhenZeroReserve || firstEpisode.length >= thresholds.prolongedDays;

  return {
    status: significant ? 'Significant' : 'Temporary',
    severity: significant ? 'Significant or prolonged liquidity shortage' : 'Temporary liquidity shortage',
    first_shortage_date: rows[firstIndex].date,
    maximum_gap: maximumGap,
    gap_duration_days: firstEpisode.length,
    total_gap_days: gapRows.length,
    recovery_date: recoveryIndex === -1 ? null : rows[recoveryIndex].date,
    minimum_projected_cash: Math.min(...rows.map((r) => r.closing_cash)),
    reserve,
    thresholds,
    rows,
  };
}
