/**
 * The goal for each round: the points you need over a round's balls. A designed curve with round numbers
 * (1,000 in round 1 to 600,000 for the final boss, about ×1.5 a round late), not a measured one: the parts, decals and bosses are tuned
 * towards it instead (docs/balance-changes-plan.md §9). `npm run balance -- --verify` shows how often par machines
 * clear each round against it. Past the final boss, endless is a fixed list too (ENDLESS_GOALS, rounds 16 to 30);
 * round 30 cleared, the run is beaten for good.
 */
export const GOALS: number[] = [1000, 1500, 2500, 4000, 6000, 10000, 15000, 25000, 40000, 60000, 100000, 150000, 250000, 400000, 600000];
/** Endless: rounds 16 to 30, about ×1.6 a round, rounded. */
export const ENDLESS_GOALS: number[] = [1000000, 1500000, 2500000, 4000000, 6000000, 10000000, 15000000, 25000000, 40000000, 60000000, 100000000, 150000000, 250000000, 400000000, 600000000];
/** The last round there is: clear it and the run is over, beaten for good. */
export const LAST_ROUND = GOALS.length + ENDLESS_GOALS.length;
/** Tools that play past the last round: the goal keeps growing by this much a round. */
export const GOAL_GROWTH = 1.6;
