#!/usr/bin/env node
/* ============================================================
   SPEAKER NOTES <-> DECK

   Every deck keeps its speaker notes in one readable markdown
   file, SPEAKER-NOTES.md, alongside its slides. That file is the
   editing surface; the @note blocks inside the slide files are
   generated from it.

   Usage:
     node sync-notes.js --deck=<name> --extract
        slides  ->  SPEAKER-NOTES.md   (seed the file, or pick up
                                        notes edited in a slide)

     node sync-notes.js --deck=<name> --apply
        SPEAKER-NOTES.md  ->  slides   (then rebuild the deck)

   --apply rewrites only the @note block of each slide; the slide
   markup is untouched. Run `node build.js --deck=<name>` after.
   ============================================================ */
const fs = require("fs");
const path = require("path");

const ARGV = process.argv.slice(2);
const flag = n => { const e = ARGV.find(a => a.startsWith(`--${n}=`)); if (e) return e.split("=")[1] || null;
                    const i = ARGV.indexOf(`--${n}`); return i !== -1 && ARGV[i + 1] && !ARGV[i + 1].startsWith("--") ? ARGV[i + 1] : null; };
const has = n => ARGV.includes(`--${n}`);

const DECK = flag("deck");
if (!DECK) { console.error("✗ Need --deck=<name>"); process.exit(1); }

const ROOT = __dirname;
const DECK_ROOT = path.join(ROOT, ".local", "slides", DECK);
const NOTES_MD = path.join(DECK_ROOT, "SPEAKER-NOTES.md");
if (!fs.existsSync(DECK_ROOT)) { console.error(`✗ No local deck at ${path.relative(ROOT, DECK_ROOT)}`); process.exit(1); }

const read = p => fs.readFileSync(p, "utf8");

// Running order comes from the manifest — the one place order lives.
function slideFiles() {
  const man = read(path.join(DECK_ROOT, "manifest.html"));
  const re = /<!--\s*@build:inline\s+([^\s*>]+)\s*-->/g;
  const out = []; let m;
  while ((m = re.exec(man))) out.push(m[1]);
  return out;
}

const NOTE_RE = /<!--\s*@note\r?\n([\s\S]*?)(?:\r?\n)?\s*-->\s*(?=<section\b)/;

function slideTitle(html) {
  const m = html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/);
  if (!m) return "";
  return m[1].replace(/<[^>]+>/g, "")
             .replace(/&middot;/g, "·").replace(/&rsquo;/g, "’").replace(/&amp;/g, "&")
             .replace(/&mdash;/g, "—").replace(/&ldquo;|&rdquo;/g, '"').replace(/&nbsp;/g, " ")
             .replace(/\s+/g, " ").trim();
}

function extract() {
  const files = slideFiles();
  let md = `# Speaker notes — ${DECK}\n\n`;
  md += `Generated from the slide files. **This file is the editing surface for the notes:**\n`;
  md += `edit here, then run\n\n`;
  md += "```\nnode sync-notes.js --deck=" + DECK + " --apply\nnode build.js --deck=" + DECK + "\n```\n\n";
  md += `Keep the \`## NN · \\\`file.html\\\`\` headings exactly as they are — they are how each\n`;
  md += `note finds its slide. Never write a literal close-comment sequence in a note.\n\n---\n`;

  files.forEach((f, i) => {
    const html = read(path.join(DECK_ROOT, f));
    const m = html.match(NOTE_RE);
    const n = String(i + 1).padStart(2, "0");
    md += `\n## ${n} · \`${f}\`\n`;
    const t = slideTitle(html);
    if (t) md += `\n**${t}**\n`;
    md += `\n${m ? m[1].trim() : "(no notes yet)"}\n`;
  });

  fs.writeFileSync(NOTES_MD, md, "utf8");
  console.log(`✓ Wrote ${path.relative(ROOT, NOTES_MD)} (${files.length} slides)`);
}

function apply() {
  if (!fs.existsSync(NOTES_MD)) { console.error(`✗ No ${path.relative(ROOT, NOTES_MD)} — run --extract first`); process.exit(1); }
  const md = read(NOTES_MD);
  // Split on the "## NN · `file.html`" headings.
  const re = /^##\s+\d+\s+·\s+`([^`]+)`\s*$/gm;
  const marks = []; let m;
  while ((m = re.exec(md))) marks.push({ file: m[1], start: m.index + m[0].length });
  if (!marks.length) { console.error("✗ No '## NN · `file.html`' headings found"); process.exit(1); }

  let changed = 0, skipped = 0;
  marks.forEach((mk, i) => {
    const end = i + 1 < marks.length ? md.lastIndexOf("\n##", marks[i + 1].start) : md.length;
    let body = md.slice(mk.start, end);
    // drop the bold slide-title line the extractor adds; it is a reading aid, not a note
    body = body.replace(/^\s*\*\*[^\n]*\*\*\s*$/m, "").trim();

    const p = path.join(DECK_ROOT, mk.file);
    if (!fs.existsSync(p)) { console.warn(`  ! no such slide: ${mk.file}`); skipped++; return; }
    if (/--\s*>/.test(body) || body.includes("-->")) { console.warn(`  ! ${mk.file}: note contains a close-comment sequence — skipped`); skipped++; return; }

    const html = read(p);
    if (!NOTE_RE.test(html)) { console.warn(`  ! ${mk.file}: no @note block to replace`); skipped++; return; }
    const next = html.replace(NOTE_RE, `<!-- @note\n${body}\n-->\n`);
    if (next !== html) { fs.writeFileSync(p, next, "utf8"); changed++; }
  });

  console.log(`✓ Applied notes to ${changed} slide file(s)${skipped ? `, ${skipped} skipped` : ""}`);
  console.log(`  Now rebuild:  node build.js --deck=${DECK}`);
}

if (has("apply")) apply();
else if (has("extract")) extract();
else { console.error("✗ Need --extract or --apply"); process.exit(1); }
