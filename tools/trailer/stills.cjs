// A still of each trailer machine, to lay the builds out: node tools/trailer/stills.cjs [outDir]
const path = require('path');
const { Film, startServer } = require('./film.cjs');
const { BUILDS, dress } = require('./shots.cjs');

(async () => {
  const out = path.resolve(process.argv[2] || 'trailer-out');
  require('fs').mkdirSync(out, { recursive: true });
  const server = await startServer();
  const film = await Film.open(server.url);
  try {
    for (const id of Object.keys(BUILDS)) {
      const missed = await film.run(dress, { machine: id, parts: BUILDS[id], clean: true, round: true });
      if (missed.length) console.log(id, 'did not fit:', JSON.stringify(missed));
      await film.run((d) => { d.skip(2); d.frame(33, 0, false); d.frame(33, 0, false); });
      await film.page.screenshot({ path: `${out}/still-${id}.jpg`, quality: 85 });
    }
  } finally {
    if (film.errors.length) console.log('page errors:', film.errors);
    await film.close();
    server.stop();
  }
})();
