/**
 * Item response theory, two-parameter logistic (2PL) model.
 *   P(correct | theta) = 1 / (1 + e^(-a (theta - b)))
 * a = discrimination, b = difficulty, theta = the candidate's ability (0 = average).
 * These are maths constants, not business settings.
 */

export type ItemParams = { a: number; b: number };
export type ScoredAnswer = ItemParams & { correct: boolean };

export function probCorrect(theta: number, { a, b }: ItemParams): number {
  return 1 / (1 + Math.exp(-a * (theta - b)));
}

/** Fisher information of an item at ability theta: a^2 * P * (1 - P). Highest when theta is near b. */
export function itemInformation(theta: number, item: ItemParams): number {
  const p = probCorrect(theta, item);
  return item.a * item.a * p * (1 - p);
}

// Quadrature grid for the EAP estimate: -4 to +4 in steps of 0.05, with a standard normal prior.
const GRID_MIN = -4;
const GRID_MAX = 4;
const GRID_STEP = 0.05;
const GRID: number[] = [];
for (let t = GRID_MIN; t <= GRID_MAX + 1e-9; t += GRID_STEP) GRID.push(Math.round(t * 1000) / 1000);
const PRIOR = GRID.map((t) => Math.exp(-0.5 * t * t));

export type Ability = { theta: number; se: number };

/**
 * Expected a posteriori (EAP) ability estimate.
 * theta = the mean of the posterior distribution, se = its standard deviation.
 * With no answers it returns the prior (theta 0, se 1).
 */
export function estimateAbility(answers: ScoredAnswer[]): Ability {
  const posterior = GRID.map((t, i) => {
    let logLik = 0;
    for (const ans of answers) {
      const p = probCorrect(t, ans);
      logLik += Math.log(ans.correct ? p : 1 - p);
    }
    return PRIOR[i] * Math.exp(logLik);
  });
  const total = posterior.reduce((sum, w) => sum + w, 0);
  const theta = posterior.reduce((sum, w, i) => sum + w * GRID[i], 0) / total;
  const variance = posterior.reduce((sum, w, i) => sum + w * (GRID[i] - theta) ** 2, 0) / total;
  return { theta, se: Math.sqrt(variance) };
}
