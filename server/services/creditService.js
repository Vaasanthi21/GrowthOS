import Company from '../models/Company.js';
import CreditTransaction from '../models/CreditTransaction.js';
import CreditSettings from '../models/CreditSettings.js';
import logger from '../utils/logger.js';



// Retrieve settings, falling back to default values if not yet configured in DB
const getCreditSettings = async () => {
  try {
    let settings = await CreditSettings.findOne({ key: 'credits' });
    if (!settings) {
      settings = await CreditSettings.create({ key: 'credits' });
    }
    return settings;
  } catch (err) {
    logger.error(`Error fetching credit settings: ${err.message}`);
    return new CreditSettings({ key: 'credits' });
  }
};

// Update global configuration parameter values
const updateCreditSettings = async (data) => {
  const settings = await getCreditSettings();
  if (data.defaultSignupCredits !== undefined) settings.defaultSignupCredits = data.defaultSignupCredits;
  if (data.textGenerationCost !== undefined) settings.textGenerationCost = data.textGenerationCost;
  if (data.imageGenerationCost !== undefined) settings.imageGenerationCost = data.imageGenerationCost;
  if (data.websiteAnalysisCost !== undefined) settings.websiteAnalysisCost = data.websiteAnalysisCost;
  if (data.researchAnalysisCost !== undefined) settings.researchAnalysisCost = data.researchAnalysisCost;
  await settings.save();
  return settings;
};

// Core method to execute credit adjustments on the Company schema with ledger logs
const allocateCredits = async ({ companyId, userId, amount, type, note = '', createdBy = 'system' }) => {
  const normalizedAmount = Math.round(Number(amount || 0));
  if (normalizedAmount === 0) {
    throw new Error('Credit amount must be a non-zero number');
  }

  const company = await Company.findById(companyId);
  if (!company) {
    throw new Error('Company not found');
  }

  const currentBalance = company.creditsBalance || 0;
  const nextBalance = currentBalance + normalizedAmount;
  if (nextBalance < 0) {
    throw new Error('Insufficient credits for this operation');
  }

  // Update company document
  company.creditsBalance = nextBalance;
  if (normalizedAmount > 0) {
    company.creditsTotalAllocated = (company.creditsTotalAllocated || 0) + normalizedAmount;
    if (type === 'purchase') {
      company.creditsTotalPurchased = (company.creditsTotalPurchased || 0) + normalizedAmount;
    }
  } else {
    company.creditsTotalUsed = (company.creditsTotalUsed || 0) + Math.abs(normalizedAmount);
  }
  await company.save();

  // Insert ledger transaction log
  const transaction = await CreditTransaction.create({
    companyId,
    userId,
    amount: normalizedAmount,
    balanceAfter: nextBalance,
    type,
    note: String(note || '').trim(),
    createdBy,
  });

  return { company, transaction };
};

// Charging wrapper helper method
const chargeCreditsForGeneration = async ({ companyId, userId, amount, type, note }) => {
  const cost = Math.max(Math.round(Number(amount || 0)), 0);
  if (cost === 0) return null;

  return await allocateCredits({
    companyId,
    userId,
    amount: -cost,
    type,
    note,
    createdBy: 'system',
  });
};

// Refunding wrapper helper method
const refundGenerationCredits = async ({ companyId, userId, amount, type, note }) => {
  const cost = Math.max(Math.round(Number(amount || 0)), 0);
  if (cost === 0) return null;

  try {
    return await allocateCredits({
      companyId,
      userId,
      amount: cost,
      type,
      note,
      createdBy: 'system',
    });
  } catch (err) {
    logger.error(`[CREDIT SERVICE ERROR] Failed to refund generation credits: ${err.message}`);
    return null;
  }
};

export default {
  getCreditSettings,
  updateCreditSettings,
  allocateCredits,
  chargeCreditsForGeneration,
  refundGenerationCredits,
};
