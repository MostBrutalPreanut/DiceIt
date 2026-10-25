import { runPar, type ParOptions } from './par';

/** One par progression, run as its own process so several can use all the cores. Prints `RESULT <json>` last. */
const opts = JSON.parse(process.argv[2]) as ParOptions;
const run = runPar({ ...opts, log: (l) => process.stderr.write(l + '\n') });
process.stdout.write('RESULT ' + JSON.stringify(run) + '\n');
