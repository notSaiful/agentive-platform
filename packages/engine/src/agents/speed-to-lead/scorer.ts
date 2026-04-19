import { SCORING } from '@agentive/shared';

interface QualificationData {
  budgetIdentified: boolean;
  timelineDays: number | null;
  isDecisionMaker: boolean;
  intentSignals: string[];
}

interface ScoreResult {
  score: number;
  classification: 'HOT' | 'WARM' | 'COLD';
  breakdown: Record<string, number>;
}

const EXPLORING_KEYWORDS = ['just looking', 'just browsing', 'curious', 'no rush', 'not ready'];

export function scoreLead(data: QualificationData): ScoreResult {
  const breakdown: Record<string, number> = {};
  let score = 0;

  if (data.budgetIdentified) {
    score += SCORING.WEIGHTS.BUDGET_IDENTIFIED;
    breakdown.budget = SCORING.WEIGHTS.BUDGET_IDENTIFIED;
  }

  if (data.timelineDays !== null) {
    if (data.timelineDays <= 30) {
      score += SCORING.WEIGHTS.TIMELINE_UNDER_30;
      breakdown.timeline = SCORING.WEIGHTS.TIMELINE_UNDER_30;
    } else if (data.timelineDays <= 90) {
      score += SCORING.WEIGHTS.TIMELINE_30_90;
      breakdown.timeline = SCORING.WEIGHTS.TIMELINE_30_90;
    }
  }

  if (data.isDecisionMaker) {
    score += SCORING.WEIGHTS.DECISION_MAKER;
    breakdown.decisionMaker = SCORING.WEIGHTS.DECISION_MAKER;
  }

  const hasStrongIntent = data.intentSignals.some(s =>
    /ready|pre-approved|urgent|asap|must move/i.test(s)
  );
  if (hasStrongIntent) {
    score += SCORING.WEIGHTS.STRONG_INTENT;
    breakdown.intent = SCORING.WEIGHTS.STRONG_INTENT;
  }

  const isExploring = data.intentSignals.some(s =>
    EXPLORING_KEYWORDS.some(kw => s.toLowerCase().includes(kw))
  );
  if (isExploring) {
    score += SCORING.WEIGHTS.EXPLORING_PENALTY;
    breakdown.exploring = SCORING.WEIGHTS.EXPLORING_PENALTY;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    classification: classifyLead(score),
    breakdown,
  };
}

export function classifyLead(score: number): 'HOT' | 'WARM' | 'COLD' {
  if (score >= SCORING.THRESHOLDS.HOT) return 'HOT';
  if (score >= SCORING.THRESHOLDS.WARM) return 'WARM';
  return 'COLD';
}