const FAIR_HOUSING_VIOLATIONS = [
  /\bfamily[- ]?friendly\b/i,
  /\bperfect for (a |new )?(family|families|young couple|singles|seniors|kids)\b/i,
  /\bsafe neighborhood\b/i,
  /\bgood schools\b/i,
  /\bchristian\b/i,
  /\bchurch\b/i,
  /\bintegrated\b/i,
  /\bsegregated\b/i,
  /\bexclusive (area|community|neighborhood)\b/i,
];

export function checkFairHousing(text: string): { safe: boolean; violations: string[] } {
  const violations = FAIR_HOUSING_VIOLATIONS
    .filter(regex => regex.test(text))
    .map(regex => regex.source);
  return { safe: violations.length === 0, violations };
}