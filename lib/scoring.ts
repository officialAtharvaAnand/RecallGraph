// Rule-based relevance, not a probability or a learned prediction.
export const MATCH_WEIGHTS = {
  sharedSymptom: 35,
  sameService: 25,
  similarSeverity: 15,
  recent: 10,
} as const;

export type MatchInput = {
  sharedLabels: string[];
  sameService: boolean;
  serviceName: string;
  severityGap: number;
  occurredAt: string;
};

export function scoreMatch(input: MatchInput) {
  const similarSeverity = input.severityGap <= 1;
  const recent = Date.now() - new Date(input.occurredAt).getTime() <= 90 * 86400000;
  const score = Math.min(
    100,
    input.sharedLabels.length * MATCH_WEIGHTS.sharedSymptom +
      (input.sameService ? MATCH_WEIGHTS.sameService : 0) +
      (similarSeverity ? MATCH_WEIGHTS.similarSeverity : 0) +
      (recent ? MATCH_WEIGHTS.recent : 0),
  );
  const reasons = [
    ...input.sharedLabels.map((label) => `Shared symptom: ${label}`),
    ...(input.sameService ? [`Same service: ${input.serviceName}`] : []),
    ...(similarSeverity ? ['Similar severity'] : []),
    ...(recent ? ['Occurred in the last 90 days'] : []),
  ];
  return { score, reasons };
}
