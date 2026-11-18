// Score Lekhani on an Aksharantar test file: first guess right, the way the technical report counts it.
//
//   node score.mjs <language folder> <xxx_test.json> [--runner path/to/translit.js] [--boot 2000]
//
// <language folder> holds the four files (model.q4.gz, model.json.gz, words.bin.gz, rerank.json): "." for Hindi, or
// tamil/, marathi/, ... from https://huggingface.co/udgamlabs/Lekhani. <xxx_test.json> comes from the language's zip in
// https://huggingface.co/datasets/ai4bharat/Aksharantar (revision e418c1f), e.g. hin.zip -> hin_test.json (one JSON
// object per line). Rules: rows are grouped by romanised input (trimmed, lower-cased); a guess is right if it equals any
// reference spelling for that input, both trimmed, Unicode NFC and with zero-width joiners (U+200C, U+200D) removed.
// The 95% interval resamples the test inputs with replacement; it uses JavaScript's own random numbers, so its ends can
// differ from the report's (Python, seed 7) by a few hundredths.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const runnerOpt = opt("--runner", null), boots = Number(opt("--boot", "2000"));
const [dir, testPath] = args;
if (!dir || !testPath) { console.error("usage: node score.mjs <language folder> <xxx_test.json> [--runner ./translit.js]"); process.exit(1); }

// The runner: --runner, else the first translit.js found here, next to this script, in ../files/ (the GitHub layout)
// or next to the language folder (the Hugging Face layout).
const here = path.dirname(new URL(import.meta.url).pathname);
const runner = runnerOpt || [".", here, path.join(here, "../files"), dir, path.join(dir, "..")]
  .map((d) => path.join(d, "translit.js")).find((f) => fs.existsSync(f));
if (!runner) { console.error("translit.js not found: pass --runner path/to/translit.js"); process.exit(1); }
const { Transliterator, VERSION } = await import(pathToFileURL(path.resolve(runner)).href);
const rd = (f) => fs.readFileSync(path.join(dir, f));
const tr = await Transliterator.load({ model: rd("model.q4.gz"), json: rd("model.json.gz"), words: rd("words.bin.gz"),
  rerank: JSON.parse(rd("rerank.json").toString("utf8")) });

const norm = (s) => s.trim().normalize("NFC").replace(/[‌‍]/g, "");
const refs = new Map();
for (const line of fs.readFileSync(testPath, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const r = JSON.parse(line), src = r["english word"].trim().toLowerCase();
  if (!refs.has(src)) refs.set(src, new Set());
  refs.get(src).add(norm(r["native word"]));
}
const ok = [];
const t0 = performance.now();
for (const [src, R] of refs) ok.push(R.has(norm(tr.word(src).best)) ? 1 : 0);
const ms = (performance.now() - t0) / ok.length;
const n = ok.length, hits = ok.reduce((a, b) => a + b, 0), v = [];
for (let b = 0; b < boots; b++) { let s = 0; for (let i = 0; i < n; i++) s += ok[(Math.random() * n) | 0]; v.push((100 * s) / n); }
v.sort((a, b) => a - b);
console.log(`runner ${VERSION} | ${hits} of ${n} test inputs right = ${((100 * hits) / n).toFixed(2)}% ` +
  `(95% interval ${v[Math.floor(0.025 * boots)].toFixed(2)} to ${v[Math.floor(0.975 * boots)].toFixed(2)}) | ${ms.toFixed(2)} ms a word`);
