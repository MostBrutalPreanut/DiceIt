// Turns the single-file build into the page FRAGMENT the Artifact tool wants (it wraps the doctype,
// head and body itself). Usage: npm run artifact [outFile]
import fs from 'node:fs';

const out = process.argv[2] ?? 'dist-single/free-play-artifact.html';
const html = fs.readFileSync('dist-single/index.html', 'utf8');

const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? '').replace(/<script[\s\S]*?<\/script>/g, '');
const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? 'Free Play';

if (!styles.length || !scripts.length || !body.trim()) throw new Error('unexpected build output');
for (const s of scripts) if (/<\/script/i.test(s)) throw new Error('bundle contains </script; cannot inline safely');

const page = `<title>${title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${styles.join('\n')}
</style>
${body.trim()}
<script type="module">
${scripts.join('\n')}
</script>
`;
fs.writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1024).toFixed(0)} KB`);
