import { addDays, diffDays, maxDate } from './dateUtils.js';

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function simpleInterest(principal, annualRatePct, financingDays) {
  return n(principal) * (n(annualRatePct) / 100) * Math.max(0, n(financingDays)) / 365;
}

function disbursementDate(option, evaluationDate) {
  return maxDate(option.availability_date || evaluationDate, addDays(evaluationDate, n(option.approval_days)));
}

export function evaluateFinancingOption(option, context) {
  const requiredAmount = Math.max(0, n(context.requiredAmount));
  const deadline = context.deadline;
  const evaluationDate = context.evaluationDate;
  const base = {
    id: option.id,
    name: option.name,
    type: option.type,
    eligible: option.eligible !== false,
    assumptions: option.assumptions || '',
    risks: option.risks || '',
  };

  if (option.type === 'no_financing') {
    const feasible = requiredAmount <= 0;
    return {
      ...base,
      gross_amount: 0,
      net_proceeds: 0,
      liquidity_improvement: 0,
      estimated_total_cost: 0,
      effective_cost_pct: 0,
      funds_available_date: evaluationDate,
      meets_deadline: feasible,
      covers_required_amount: feasible,
      remaining_gap: requiredAmount,
      feasible,
      rejection_reasons: feasible ? [] : ['A projected liquidity gap exists.'],
    };
  }

  const rejectionReasons = [];
  if (!base.eligible) rejectionReasons.push(option.eligibility_reason || 'Mandatory eligibility requirement is not met.');
  const fundsAvailable = disbursementDate(option, evaluationDate);
  const meetsDeadline = !deadline || fundsAvailable <= deadline;
  if (!meetsDeadline) rejectionReasons.push(`Funds are expected on ${fundsAvailable}, after the ${deadline} funding deadline.`);

  if (option.type === 'supplier_reschedule') {
    const contractPermitted = option.contract_permitted === true;
    if (!contractPermitted) rejectionReasons.push('Supplier rescheduling has not been contractually confirmed.');
    const liquidityImprovement = Math.min(requiredAmount, Math.max(0, n(option.reschedulable_amount)));
    const cost = n(option.late_fee) + n(option.other_fees);
    const covers = liquidityImprovement >= requiredAmount && requiredAmount > 0;
    if (liquidityImprovement <= 0) rejectionReasons.push('No eligible supplier payment amount is available to reschedule.');
    return {
      ...base,
      gross_amount: liquidityImprovement,
      net_proceeds: 0,
      liquidity_improvement: liquidityImprovement,
      estimated_total_cost: cost,
      effective_cost_pct: liquidityImprovement > 0 ? cost / liquidityImprovement * 100 : 0,
      funds_available_date: fundsAvailable,
      meets_deadline: meetsDeadline,
      covers_required_amount: covers,
      remaining_gap: Math.max(0, requiredAmount - liquidityImprovement),
      feasible: rejectionReasons.length === 0 && liquidityImprovement > 0,
      rejection_reasons: rejectionReasons,
      repayment_implication: option.repayment_implication || 'Payment is deferred to the agreed revised supplier date.',
    };
  }

  let grossAvailable = Math.max(0, n(option.max_available_amount));
  if (option.type === 'credit_line') {
    const undrawn = Math.max(0, n(option.approved_limit) - n(option.current_drawn_amount));
    grossAvailable = Math.min(grossAvailable || undrawn, undrawn);
  }
  if (option.type === 'invoice_financing') {
    const receivableBase = Math.max(0, n(option.eligible_receivable_amount));
    const advance = receivableBase * Math.min(1, Math.max(0, n(option.advance_rate_pct) / 100));
    grossAvailable = grossAvailable > 0 ? Math.min(grossAvailable, advance) : advance;
  }

  const desiredGross = Math.min(grossAvailable, requiredAmount + n(option.processing_fee) + n(option.other_fees));
  const financingDays = Math.max(1, n(option.financing_days || (option.maturity_date ? diffDays(option.maturity_date, fundsAvailable) : 30)));
  let interest = simpleInterest(desiredGross, option.annual_rate_pct, financingDays);
  if (option.type === 'invoice_financing' && n(option.financing_fee_pct) > 0) {
    interest = desiredGross * n(option.financing_fee_pct) / 100;
  }
  const processingFee = n(option.processing_fee);
  const otherFees = n(option.other_fees);
  const upfrontRateFee = desiredGross * Math.max(0, n(option.upfront_fee_pct)) / 100;
  const upfrontDeductions = (option.interest_deducted_upfront ? interest : 0) + processingFee + otherFees + upfrontRateFee;
  const netProceeds = Math.max(0, desiredGross - upfrontDeductions);
  const totalCost = interest + processingFee + otherFees + upfrontRateFee;
  const covers = netProceeds >= requiredAmount && requiredAmount > 0;
  if (grossAvailable <= 0) rejectionReasons.push('No drawable amount is available.');

  return {
    ...base,
    gross_amount: desiredGross,
    net_proceeds: netProceeds,
    liquidity_improvement: netProceeds,
    interest,
    processing_fee: processingFee,
    other_fees: otherFees + upfrontRateFee,
    estimated_total_cost: totalCost,
    effective_cost_pct: netProceeds > 0 ? totalCost / netProceeds * 100 : 0,
    financing_days: financingDays,
    funds_available_date: fundsAvailable,
    meets_deadline: meetsDeadline,
    covers_required_amount: covers,
    remaining_gap: Math.max(0, requiredAmount - netProceeds),
    feasible: rejectionReasons.length === 0 && netProceeds > 0,
    rejection_reasons: rejectionReasons,
    repayment_implication: option.repayment_implication || `Repay gross draw plus estimated financing cost at or before maturity.`,
    financed_invoice_ids: option.financed_invoice_ids || [],
  };
}

export function compareFinancingOptions(options, context) {
  return options.map((option) => evaluateFinancingOption(option, context)).sort((a, b) => {
    if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
    if (a.covers_required_amount !== b.covers_required_amount) return a.covers_required_amount ? -1 : 1;
    if (a.estimated_total_cost !== b.estimated_total_cost) return a.estimated_total_cost - b.estimated_total_cost;
    return a.remaining_gap - b.remaining_gap;
  });
}

export function chooseCombination(evaluations, requiredAmount) {
  const feasible = evaluations.filter((item) => item.feasible && item.liquidity_improvement > 0);
  let best = null;
  for (let i = 0; i < feasible.length; i += 1) {
    for (let j = i + 1; j < feasible.length; j += 1) {
      const items = [feasible[i], feasible[j]];
      const improvement = items.reduce((sum, item) => sum + item.liquidity_improvement, 0);
      const cost = items.reduce((sum, item) => sum + item.estimated_total_cost, 0);
      const remaining = Math.max(0, requiredAmount - improvement);
      const candidate = { items, liquidity_improvement: improvement, estimated_total_cost: cost, remaining_gap: remaining };
      if (!best || candidate.remaining_gap < best.remaining_gap || (candidate.remaining_gap === best.remaining_gap && candidate.estimated_total_cost < best.estimated_total_cost)) {
        best = candidate;
      }
    }
  }
  return best;
}
