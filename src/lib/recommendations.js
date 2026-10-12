import { chooseCombination, compareFinancingOptions } from './financing.js';

export function buildRecommendation({ gap, financingOptions, evaluationDate }) {
  if (!gap || gap.status === 'Insufficient evidence') {
    return {
      action: 'Improve forecast evidence before making a financing decision',
      external_financing_necessary: null,
      amount_required: 0,
      funding_needed_date: null,
      estimated_cost: 0,
      liquidity_improvement: 0,
      remaining_gap: 0,
      rationale: ['The available forecast does not contain enough evidence for a reliable liquidity decision.'],
      rejected: [],
      residual_risk: 'Forecast reliability is insufficient.',
      next_action: 'Validate receivable dates and committed obligations, then rerun the forecast.',
      evaluations: [],
    };
  }

  if (gap.maximum_gap <= 0) {
    return {
      action: 'Do not add borrowing under the current assumptions',
      external_financing_necessary: false,
      amount_required: 0,
      funding_needed_date: null,
      expected_duration_days: 0,
      estimated_cost: 0,
      liquidity_improvement: 0,
      remaining_gap: 0,
      rationale: ['Projected closing cash does not fall below the configured minimum operating cash reserve.'],
      rejected: ['External financing options are not needed because no projected funding gap exists.'],
      residual_risk: 'Actual customer collections and expenses can still differ from the forecast.',
      next_action: 'Continue monitoring collections and obligations; refresh the forecast when assumptions change.',
      evaluations: compareFinancingOptions(financingOptions, { requiredAmount: 0, deadline: null, evaluationDate }),
    };
  }

  const context = {
    requiredAmount: gap.maximum_gap,
    deadline: gap.first_shortage_date,
    evaluationDate,
  };
  const evaluations = compareFinancingOptions(financingOptions, context);
  const covering = evaluations.filter((item) => item.feasible && item.covers_required_amount);
  if (covering.length) {
    const operational = covering.filter((item) => item.type === 'supplier_reschedule');
    const pool = operational.length ? operational : covering;
    const selected = [...pool].sort((a, b) => a.estimated_total_cost - b.estimated_total_cost || a.effective_cost_pct - b.effective_cost_pct)[0];
    return {
      action: selected.type === 'supplier_reschedule' ? `Use ${selected.name} if supplier consent is confirmed` : `Use ${selected.name}`,
      external_financing_necessary: selected.type !== 'supplier_reschedule',
      amount_required: gap.maximum_gap,
      funding_needed_date: gap.first_shortage_date,
      expected_duration_days: gap.gap_duration_days,
      estimated_cost: selected.estimated_total_cost,
      liquidity_improvement: selected.liquidity_improvement,
      remaining_gap: selected.remaining_gap,
      rationale: [
        `The projected maximum liquidity gap is ${gap.maximum_gap.toFixed(2)} and begins on ${gap.first_shortage_date}.`,
        `${selected.name} meets eligibility and timing constraints and covers the required amount.`,
        `Hard feasibility constraints were applied before comparing estimated cost.`,
      ],
      rejected: evaluations.filter((item) => item.id !== selected.id).map((item) => item.feasible ? `${item.name}: feasible but not preferred on cost/operational grounds.` : `${item.name}: ${item.rejection_reasons.join(' ')}`),
      residual_risk: 'Collection timing, lender disbursement, supplier consent, and actual charges may differ from the modeled assumptions.',
      next_action: selected.type === 'supplier_reschedule' ? 'Obtain written supplier confirmation before relying on the revised payment date.' : 'Confirm final lender terms and disbursement date before drawing funds.',
      selected,
      evaluations,
    };
  }

  const combination = chooseCombination(evaluations, gap.maximum_gap);
  if (combination && combination.remaining_gap < gap.maximum_gap) {
    return {
      action: `Combine ${combination.items.map((item) => item.name).join(' + ')}`,
      external_financing_necessary: combination.items.some((item) => item.type !== 'supplier_reschedule'),
      amount_required: gap.maximum_gap,
      funding_needed_date: gap.first_shortage_date,
      expected_duration_days: gap.gap_duration_days,
      estimated_cost: combination.estimated_total_cost,
      liquidity_improvement: combination.liquidity_improvement,
      remaining_gap: combination.remaining_gap,
      rationale: ['No single feasible option covers the projected gap, so the engine selects the lowest-gap two-option combination after hard feasibility checks.'],
      rejected: evaluations.filter((item) => !combination.items.some((selected) => selected.id === item.id)).map((item) => item.feasible ? `${item.name}: contributes less liquidity than the selected combination.` : `${item.name}: ${item.rejection_reasons.join(' ')}`),
      residual_risk: combination.remaining_gap > 0 ? 'A residual funding gap remains and requires further action.' : 'Multiple actions must execute as assumed; delay in either can reopen the gap.',
      next_action: combination.remaining_gap > 0 ? 'Reduce or defer additional obligations, accelerate confirmed collections, or secure a larger financing facility.' : 'Confirm both actions before the shortage date and rerun the forecast with the agreed terms.',
      combination,
      evaluations,
    };
  }

  return {
    action: 'No currently modeled option fully addresses the projected gap',
    external_financing_necessary: true,
    amount_required: gap.maximum_gap,
    funding_needed_date: gap.first_shortage_date,
    expected_duration_days: gap.gap_duration_days,
    estimated_cost: 0,
    liquidity_improvement: 0,
    remaining_gap: gap.maximum_gap,
    rationale: ['All modeled responses fail at least one mandatory eligibility, timing, or amount constraint.'],
    rejected: evaluations.map((item) => `${item.name}: ${item.rejection_reasons.length ? item.rejection_reasons.join(' ') : `remaining gap ${item.remaining_gap.toFixed(2)}.`}`),
    residual_risk: 'The forecast indicates an unresolved liquidity shortage.',
    next_action: 'Negotiate obligations, accelerate confirmed receivables, or add a financing option that can arrive before the shortage date.',
    evaluations,
  };
}
