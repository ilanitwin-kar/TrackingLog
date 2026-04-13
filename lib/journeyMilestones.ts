/** ימים נותרים במסלול במשבצת i (0 = היום) */
export function getDaysLeftAtSquare(
  daysRemaining: number,
  squareIndex: number
): number {
  return daysRemaining - squareIndex;
}

const MILESTONE_DAY_INTERVAL = 30;

/**
 * הודעת אבן דרך: כל 30 יום (30, 60, 90, …) — "עוד [X] ימים ליעד!"
 */
export function getJourneyMilestoneMessage(
  daysRemaining: number,
  squareIndex: number
): string | null {
  const daysLeft = getDaysLeftAtSquare(daysRemaining, squareIndex);
  if (daysLeft <= 0) return null;

  if (daysLeft % MILESTONE_DAY_INTERVAL === 0) {
    return `עוד ${daysLeft} ימים ליעד!`;
  }

  return null;
}

export const JOURNEY_FINAL_GOLD_MESSAGE = "הגעת אל היעד!";
