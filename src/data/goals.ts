/**
 * The goal for each round: the points you need over a round's balls. A designed curve with round numbers
 * (1,000 in round 1 to 2.5 million for the final boss, about x1.7 a round), not a measured one: the parts,
 * decals and bosses are tuned towards it instead (docs/balance-plan.md). `npm run balance -- --verify` shows how
 * often par machines clear each round against it. Past the table the goal grows by GOAL_GROWTH a round.
 */
export const GOALS: number[] = [1000, 2000, 3500, 6000, 10000, 15000, 25000, 40000, 60000, 100000, 160000, 250000, 400000, 750000, 2000000];
export const GOAL_GROWTH = 1.6;
