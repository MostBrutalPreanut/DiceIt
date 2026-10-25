/**
 * The goal for each round: the points you need in 15 rounds' worth of balls. Set by the balance bot
 * (`npm run balance -- --write` regenerates this file from the par machine; see docs/run-flow-and-balance.md §4).
 * Past the table the goal keeps growing by `GOAL_GROWTH` a round.
 */
export const GOALS: number[] = [2500, 4200, 7200, 12000, 21000, 36000, 60000, 100000, 170000, 300000, 500000, 860000, 1500000, 2500000, 4200000];
export const GOAL_GROWTH = 1.5;
