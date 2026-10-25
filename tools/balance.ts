import { Game, goalFor } from '../src/game/game';
import { Bot } from '../src/sim/bot';

/** Play many full rounds with the bot and report how often each round's goal is met, and on which ball. */
const rounds = Number(process.argv[2] ?? 60);
const skill = Number(process.argv[3] ?? 0.9);
const game = new Game();
const scores: number[] = [];
const clearedOnBall = [0, 0, 0, 0];
let secondsPerBall = 0, ballsPlayed = 0;

for (let r = 0; r < rounds; r++) {
  game.round = 1; // always measure against round 1's goal
  game.toWorkshop();
  game.startRound();
  const bot = new Bot(r + 1, skill);
  let ballStart = game.sim.time;
  let lastBallsLeft = game.ballsLeft;
  let guard = 0;
  while (game.mode === 'round') {
    if (++guard > 240 * 400) { console.log(`round ${r} did not finish: ballsLeft ${game.ballsLeft} balls ${game.sim.ballCount} t=${game.sim.time.toFixed(1)} awaiting=${game.sim.awaitingPlunge} states=${JSON.stringify(game.sim.ballStates())}`); process.exit(1); }
    const res = game.step(bot.decide(game.sim));
    if (game.ballsLeft !== lastBallsLeft) {
      secondsPerBall += game.sim.time - ballStart; ballsPlayed++;
      ballStart = game.sim.time; lastBallsLeft = game.ballsLeft;
    }
    if (res.game.some((g) => g.type === 'roundWon')) clearedOnBall[3 - game.ballsLeft]++;
  }
  scores.push(game.scorer.score);
}
scores.sort((a, b) => a - b);
const q = (p: number) => scores[Math.floor(p * (scores.length - 1))];
console.log(`round-1 goal ${goalFor(1)}; ${rounds} bot rounds (skill ${skill})`);
console.log(`  3-ball score  p10 ${q(0.1)}  median ${q(0.5)}  p90 ${q(0.9)}`);
console.log(`  cleared: ball1 ${clearedOnBall[1]}  ball2 ${clearedOnBall[2]}  ball3 ${clearedOnBall[3]}  failed ${rounds - clearedOnBall[1] - clearedOnBall[2] - clearedOnBall[3]}`);
console.log(`  avg seconds per ball ${(secondsPerBall / ballsPlayed).toFixed(1)}`);
