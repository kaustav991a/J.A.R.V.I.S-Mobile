/**
 * Generate every status surface from `docs/status/ledger.json`.
 *
 * Writes two things and owns them completely:
 *   - `ROADMAP.md` §0b and §0c, between the BEGIN/END markers
 *   - `docs/completion-tracker.html`, the browser view
 *
 * Why a generator rather than three files kept in step by hand: this repo has already
 * paid for two documents answering "is this built?" differently — `NEXT.md` was merged
 * into `ROADMAP.md` for exactly that reason. Percentages typed by hand are the same bug
 * with an extra digit of false precision. Everything here is counted from the ledger, so
 * a number on the page cannot disagree with the row it came from.
 *
 * Run with `node scripts/build-status.mjs`. Pass `--check` to fail instead of writing, which is what a
 * hook or CI wants: it answers "is the generated output stale?" without touching the tree.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = join(ROOT, 'docs', 'status', 'ledger.json');
const ROADMAP = join(ROOT, 'ROADMAP.md');
const TRACKER = join(ROOT, 'docs', 'completion-tracker.html');

const CHECK = process.argv.includes('--check');

const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
const { meta, blockers, criteria, areas, queue, timeline } = ledger;

/** The order is the reading order everywhere: what is wrong first, then what is done. */
const ORDER = ['broken', 'partial', 'untested', 'proved', 'none'];
const WORD = {
  proved: 'proved',
  partial: 'partial',
  untested: 'untested',
  broken: 'broken',
  none: '—',
};
const LABEL = {
  proved: 'Proved',
  partial: 'Partial',
  untested: 'Unexercised',
  broken: 'Broken',
  none: 'Not built',
};

const allRows = areas.flatMap((a) => a.rows.map((r) => ({ ...r, area: a.name })));

/* ── counting, once, so nothing is typed twice ─────────────────────────── */

const count = (rows, key) => rows.filter((r) => r.status === key).length;
const tally = (rows) => Object.fromEntries(ORDER.map((k) => [k, count(rows, k)]));

const T = tally(allRows);
const total = allRows.length;
const hasCode = total - T.none;
const pct = (n) => Math.round((n / total) * 100);

/**
 * What the app repo can reach on its own.
 *
 * The honest ceiling, and the reason it is computed rather than asserted: a row blocked
 * on the brain, the desk or the phone is not a row this repo can finish, so counting it
 * towards "app progress" would flatter the number. `app` and `app-build` are both this
 * repo; `none` means finished.
 */
const OURS = new Set(['app', 'app-build', 'none']);
const reachable = allRows.filter((r) => OURS.has(r.blockedBy));
const blocked = allRows.filter((r) => !OURS.has(r.blockedBy));
const byBlocker = Object.fromEntries(
  Object.keys(blockers).map((k) => [k, allRows.filter((r) => r.blockedBy === k).length])
);

const critMet = criteria.filter((c) => c.status === 'proved').length;
const critPartial = criteria.filter((c) => c.status === 'partial').length;
const critBrain = criteria.filter((c) => c.blockedBy === 'brain').length;
const critCeiling = Math.round(((criteria.length - critBrain) / criteria.length) * 100);

/* ── markdown ──────────────────────────────────────────────────────────── */

const esc = (s) => s.replace(/\|/g, '\\|');

/** Strip the HTML the tracker wants but a markdown table must not carry. */
const plain = (s) => s.replace(/\*\*/g, '**').trim();

function mdLedger() {
  const out = [];
  out.push('**Status means exactly this:** `proved` — a human has seen it work on the');
  out.push('phone; `untested` — the code and its tests are in, no human has ever exercised');
  out.push('it; `partial` — works, with a named gap; `broken` — works badly, defect logged');
  out.push('in §2; `—` — not built.');
  out.push('');
  out.push('**Blocked-on** is the column that stops a brain dependency hiding in prose.');
  out.push(
    Object.entries(blockers)
      .filter(([k]) => k !== 'none')
      .map(([, v]) => `\`${v.label}\``)
      .join(' · ') + ' — a blank means nothing is owed.'
  );
  out.push('');
  out.push(
    `**${T.proved} of ${total} rows are proved on the phone** (${pct(T.proved)}%). ` +
      `${hasCode} have code (${pct(hasCode)}%). ` +
      `${blocked.length} cannot be finished in this repo: ` +
      Object.entries(byBlocker)
        .filter(([k, n]) => n > 0 && !OURS.has(k))
        .map(([k, n]) => `${n} on the ${blockers[k].label.toLowerCase()}`)
        .join(', ') +
      '.'
  );
  out.push('');

  for (const area of areas) {
    const t = tally(area.rows);
    out.push(`### ${area.name}`);
    out.push('');
    out.push(`*${t.proved} proved of ${area.rows.length}.*`);
    out.push('');
    out.push('| | Status | Blocked on | Note |');
    out.push('| --- | --- | --- | --- |');
    for (const r of area.rows) {
      const b = r.blockedBy === 'none' ? '' : blockers[r.blockedBy].label;
      out.push(`| ${esc(r.name)} | ${WORD[r.status]} | ${b} | ${esc(plain(r.note))} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

function mdCriteria() {
  const out = [];
  out.push('Not a wish list — the shortest set of things whose absence makes the app');
  out.push('*incomplete* rather than merely unfinished.');
  out.push('');
  out.push('**Nothing may be `untested`.** A feature nobody has ever used is a claim, not a');
  out.push('capability.');
  out.push('');
  out.push(
    `**${critMet} of ${criteria.length} are met.** ${critPartial} are partly met. ` +
      `**${critBrain} need \`jarvis-brain\`**, so the app repo alone tops out at ` +
      `${critCeiling}% of this list.`
  );
  out.push('');
  out.push('| | Criterion | Status | Blocked on | Why it is not met |');
  out.push('| --- | --- | --- | --- | --- |');
  for (const c of criteria) {
    const b = c.blockedBy === 'none' ? '' : blockers[c.blockedBy].label;
    out.push(
      `| ${c.n} | **${esc(c.title)}** | ${WORD[c.status]} | ${b} | ${esc(c.detail)} |`
    );
  }
  out.push('');
  return out.join('\n');
}

/* ── splice into ROADMAP.md ────────────────────────────────────────────── */

/**
 * Replace between markers, and refuse rather than guess if they are missing.
 *
 * A generator that silently writes nothing is worse than one that fails: the tree looks
 * updated and is not, which is the same failure shape as the fingerprint trap.
 */
function splice(text, name, body) {
  const begin = `<!-- BEGIN GENERATED: ${name} -->`;
  const end = `<!-- END GENERATED: ${name} -->`;
  const i = text.indexOf(begin);
  const j = text.indexOf(end);
  if (i === -1 || j === -1) {
    throw new Error(
      `ROADMAP.md is missing the ${name} markers. Expected ${begin} … ${end}. ` +
        `Add them around the section this script owns, or it cannot write without ` +
        `guessing where the section ends.`
    );
  }
  if (j < i) throw new Error(`ROADMAP.md has the ${name} markers in the wrong order.`);
  return (
    text.slice(0, i + begin.length) +
    '\n\n*Generated from `docs/status/ledger.json` by `node scripts/build-status.mjs`. Do not edit by hand.*\n\n' +
    body +
    '\n' +
    text.slice(j)
  );
}

/* ── html ──────────────────────────────────────────────────────────────── */

const h = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The notes carry backticks and ** deliberately; render them, escape the rest. */
const rich = (s) =>
  h(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

function html() {
  const bar = (t, n) =>
    ORDER.filter((k) => t[k])
      .map((k) => `<i class="${k}" style="width:${(t[k] / n) * 100}%"></i>`)
      .join('');

  const areaBlocks = areas
    .map((a) => {
      const t = tally(a.rows);
      const n = a.rows.length;
      const rows = a.rows
        .map(
          (r) => `
          <div class="row" data-s="${r.status}" data-b="${r.blockedBy}">
            <div>
              <div class="row-name">${rich(r.name)}</div>
              ${r.note ? `<div class="row-note">${rich(r.note)}</div>` : ''}
            </div>
            <div class="row-tags">
              ${r.blockedBy !== 'none' ? `<span class="dep dep-${r.blockedBy}" title="${h(blockers[r.blockedBy].detail)}">${h(blockers[r.blockedBy].label)}</span>` : ''}
              <span class="chip ${r.status}">${LABEL[r.status]}</span>
            </div>
          </div>`
        )
        .join('');
      return `
      <div class="area">
        <div class="area-head">
          <h3>${h(a.name)}</h3>
          <span class="area-stat"><b>${t.proved}</b> proved of ${n} · ${n - t.none} have code</span>
        </div>
        <div class="bar" role="img" aria-label="${ORDER.map((k) => `${t[k]} ${LABEL[k].toLowerCase()}`).join(', ')}">${bar(t, n)}</div>
        <div class="rows">${rows}</div>
      </div>`;
    })
    .join('');

  const critBlocks = criteria
    .map(
      (c) => `
      <article class="crit" data-s="${c.status}">
        <span class="crit-n">${String(c.n).padStart(2, '0')}</span>
        <div>
          <p class="crit-t">${h(c.title)}</p>
          <p class="crit-d">${rich(c.detail)}</p>
        </div>
        <div class="row-tags">
          ${c.blockedBy !== 'none' ? `<span class="dep dep-${c.blockedBy}">${h(blockers[c.blockedBy].label)}</span>` : ''}
          <span class="chip ${c.status}">${c.status === 'none' ? 'Not started' : LABEL[c.status]}</span>
        </div>
      </article>`
    )
    .join('');

  const blockedRows = Object.entries(byBlocker)
    .filter(([k, n]) => n > 0 && !OURS.has(k))
    .map(([k, n]) => {
      const rows = allRows.filter((r) => r.blockedBy === k);
      return `
        <tr>
          <td><span class="dep dep-${k}">${h(blockers[k].label)}</span></td>
          <td class="num">${n}</td>
          <td>${h(blockers[k].detail)}</td>
          <td class="held">${rows.map((r) => rich(r.name)).join(' · ')}</td>
        </tr>`;
    })
    .join('');

  /**
   * The task list, and what earns a line through a title.
   *
   * **Only `proved` strikes through**, and that means a human has seen it work — the same
   * bar the ledger uses. `shipped` is code landed, tests green and published, which is
   * emphatically not the same thing: the row this project most recently shipped was
   * correct in 893 tests and still unseen on a phone. Striking those through would make
   * the list agree with the tests instead of with reality, and this repo has already paid
   * for a doc that did that.
   */
  const QSTATE = {
    proved: { word: 'Proved', hint: 'Seen working. Nothing owed.' },
    shipped: { word: 'Shipped · unproved', hint: 'Code landed and published. No human has seen it yet.' },
    open: { word: 'Open', hint: 'Not started.' },
    blocked: { word: 'Blocked', hint: 'Cannot be finished from this repo.' },
  };

  const qTally = queue.reduce((a, q) => ({ ...a, [q.state]: (a[q.state] ?? 0) + 1 }), {});

  const queueBlocks = queue
    .map(
      (q) => `
      <div class="q q-${q.state}">
        <span class="q-n">${String(q.n).padStart(2, '0')}</span>
        <div>
          <p class="q-t">${h(q.title)}</p>
          <p class="q-d">${rich(q.detail)}</p>
        </div>
        <div class="row-tags">
          ${q.blockedBy !== 'none' && q.state !== 'proved' ? `<span class="dep dep-${q.blockedBy}" title="${h(blockers[q.blockedBy].detail)}">${h(blockers[q.blockedBy].label)}</span>` : ''}
          <span class="q-tag q-tag-${q.state}" title="${h(QSTATE[q.state].hint)}">${QSTATE[q.state].word}</span>
        </div>
      </div>`
    )
    .join('');

  /**
   * The timeline, newest last.
   *
   * `kind` is not decoration: this project's most useful history is the traps and the
   * measurements, not the features. Colouring a trap like a shipped feature would hide
   * the thing worth rereading.
   */
  const KIND = {
    built: 'Built',
    proved: 'Proved',
    fixed: 'Fixed',
    broke: 'Broke',
    trap: 'Trap',
    rule: 'Rule',
    measured: 'Measured',
  };

  const timelineBlocks = timeline
    .map(
      (t) => `
      <li class="tl" data-k="${t.kind}">
        <div class="tl-dot"></div>
        <div class="tl-body">
          <div class="tl-head">
            <time class="tl-date">${h(t.date)}</time>
            <span class="tl-kind tl-${t.kind}">${h(KIND[t.kind] ?? t.kind)}</span>
          </div>
          <p class="tl-t">${h(t.title)}</p>
          <p class="tl-d">${rich(t.detail)}</p>
        </div>
      </li>`
    )
    .join('');

  const kindCounts = Object.entries(
    timeline.reduce((acc, t) => ({ ...acc, [t.kind]: (acc[t.kind] ?? 0) + 1 }), {})
  );

  return `<title>JARVIS Mobile Tracker</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">

<!--
  GENERATED FILE. Do not edit.

  Written by \`node scripts/build-status.mjs\` from docs/status/ledger.json, which is the single source
  of truth for every status claim in this repo. Editing this file is lost work: the next
  generate overwrites it without asking.
-->

<style>
  :root {
    /* the app's own ground and accent, from app.json — inherited, not invented */
    --ground: #020814;
    --panel: #0b1526;
    --panel-2: #101f35;
    --line: #1c304c;
    --accent: #3ea6ff;
    --accent-dim: #1d5a92;
    --proved: #2fd4b5;
    --partial: #f5a524;
    --untested: #8b7fd4;
    --broken: #ff5d5d;
    --none: #48607d;
    --text: #e8f1fb;
    --dim: #8aa1ba;
    --dimmer: #5f7794;
    --display: 'Orbitron', 'Trebuchet MS', sans-serif;
    --body: 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif;
    --mono: 'IBM Plex Mono', ui-monospace, 'Cascadia Mono', monospace;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--ground);
    color: var(--text);
    font-family: var(--body);
    font-size: 16px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  .wrap { max-width: 1120px; margin: 0 auto; padding: 0 20px 96px; position: relative; }

  .bloom {
    position: absolute;
    inset: -80px -200px auto -200px;
    height: 460px;
    background: radial-gradient(ellipse 50% 60% at 50% 0%, rgba(62,166,255,0.16), transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  header { position: relative; z-index: 1; padding: 56px 0 36px; }

  .eyebrow {
    font-family: var(--mono);
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0 0 14px;
  }

  h1 {
    font-family: var(--display);
    font-weight: 700;
    font-size: clamp(1.9rem, 5vw, 3rem);
    line-height: 1.05;
    margin: 0 0 16px;
    text-wrap: balance;
  }

  .standfirst { max-width: 62ch; color: var(--dim); font-size: 1.05rem; margin: 0 0 22px; }

  .provenance {
    max-width: 68ch;
    margin: 0 0 26px;
    padding: 14px 18px;
    border-left: 3px solid var(--accent-dim);
    background: rgba(62,166,255,0.05);
    border-radius: 0 4px 4px 0;
    color: var(--dim);
    font-size: 0.89rem;
  }

  .provenance strong { color: var(--text); font-weight: 600; }

  .facts { display: flex; flex-wrap: wrap; gap: 8px 10px; font-family: var(--mono); font-size: 0.78rem; margin: 0; padding: 0; list-style: none; }
  .facts li { border: 1px solid var(--line); border-radius: 3px; padding: 5px 10px; color: var(--dim); background: rgba(11,21,38,0.7); }
  .facts b { color: var(--text); font-weight: 500; }

  .meters { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; margin: 0 0 20px; }
  .meter { background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 20px 22px 18px; }
  .meter-num { font-family: var(--display); font-weight: 700; font-size: 2.9rem; line-height: 1; font-variant-numeric: tabular-nums; display: block; }
  .meter-num span { font-size: 1.2rem; font-weight: 500; margin-left: 2px; }
  .meter-label { font-family: var(--mono); font-size: 0.74rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--dim); display: block; margin-top: 10px; }
  .meter-sub { font-size: 0.85rem; color: var(--dimmer); margin: 8px 0 0; }
  .track { height: 5px; background: rgba(255,255,255,0.07); border-radius: 3px; overflow: hidden; margin-top: 14px; }
  .track i { display: block; height: 100%; border-radius: 3px; }

  section { position: relative; z-index: 1; margin-top: 52px; }

  h2 {
    font-family: var(--display);
    font-weight: 500;
    font-size: 1.35rem;
    margin: 0 0 6px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--line);
  }

  .sec-note { color: var(--dim); font-size: 0.94rem; max-width: 70ch; margin: 14px 0 24px; }
  code { font-family: var(--mono); font-size: 0.87em; color: var(--accent); background: rgba(62,166,255,0.09); padding: 1px 5px; border-radius: 3px; }

  .criteria { display: grid; gap: 10px; }
  .crit {
    display: grid;
    grid-template-columns: 2.4rem 1fr auto;
    gap: 16px;
    align-items: start;
    background: var(--panel);
    border: 1px solid var(--line);
    border-left: 3px solid var(--none);
    border-radius: 4px;
    padding: 15px 18px;
  }
  .crit[data-s="partial"] { border-left-color: var(--partial); }
  .crit[data-s="proved"] { border-left-color: var(--proved); }
  .crit-n { font-family: var(--mono); font-size: 0.95rem; color: var(--dimmer); padding-top: 2px; font-variant-numeric: tabular-nums; }
  .crit-t { font-weight: 600; font-size: 1rem; margin: 0 0 4px; }
  .crit-d { color: var(--dim); font-size: 0.9rem; margin: 0; }

  .row-tags { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }

  .chip {
    font-family: var(--mono);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 4px 9px;
    border-radius: 3px;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid;
  }
  .chip::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: none; }
  .chip.proved { color: var(--proved); border-color: rgba(47,212,181,0.4); background: rgba(47,212,181,0.09); }
  .chip.partial { color: var(--partial); border-color: rgba(245,165,36,0.4); background: rgba(245,165,36,0.09); }
  .chip.untested { color: var(--untested); border-color: rgba(139,127,212,0.4); background: rgba(139,127,212,0.1); }
  .chip.broken { color: var(--broken); border-color: rgba(255,93,93,0.45); background: rgba(255,93,93,0.1); }
  .chip.none { color: var(--none); border-color: rgba(72,96,125,0.5); background: rgba(72,96,125,0.12); }
  .chip.none::before { background: transparent; box-shadow: inset 0 0 0 1px currentColor; }

  /* the dependency badge — the thing that must stay visible on every blocked row */
  .dep {
    font-family: var(--mono);
    font-size: 0.63rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 2px;
    white-space: nowrap;
    border: 1px solid;
    font-weight: 500;
    cursor: help;
  }
  .dep-brain { color: #ff8fa0; border-color: rgba(255,143,160,0.45); background: rgba(255,143,160,0.1); }
  .dep-desk { color: var(--partial); border-color: rgba(245,165,36,0.4); background: rgba(245,165,36,0.08); }
  .dep-device { color: var(--untested); border-color: rgba(139,127,212,0.4); background: rgba(139,127,212,0.08); }
  .dep-app-build { color: var(--accent); border-color: rgba(62,166,255,0.4); background: rgba(62,166,255,0.08); }
  .dep-app { color: var(--dim); border-color: var(--line); background: transparent; }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin: 0 0 22px;
    padding: 14px 16px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 4px;
  }
  .controls-label { font-family: var(--mono); font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--dimmer); margin-right: 4px; }
  button.filter {
    font-family: var(--mono);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--dim);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 3px;
    padding: 6px 11px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  button.filter:hover { color: var(--text); border-color: var(--accent-dim); }
  button.filter[aria-pressed="true"] { color: var(--ground); background: var(--accent); border-color: var(--accent); font-weight: 500; }
  button.filter:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .count { font-family: var(--mono); font-size: 0.75rem; color: var(--dimmer); margin-left: auto; font-variant-numeric: tabular-nums; }

  .area { margin-bottom: 34px; }
  .area-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 14px; margin-bottom: 4px; }
  .area-head h3 { font-family: var(--display); font-weight: 500; font-size: 1.02rem; margin: 0; }
  .area-stat { font-family: var(--mono); font-size: 0.76rem; color: var(--dim); font-variant-numeric: tabular-nums; }
  .area-stat b { color: var(--proved); font-weight: 500; }

  .bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin: 10px 0 14px; background: rgba(255,255,255,0.05); }
  .bar i { display: block; height: 100%; }
  .bar i.proved { background: var(--proved); }
  .bar i.partial { background: var(--partial); }
  .bar i.untested { background: var(--untested); }
  .bar i.broken { background: var(--broken); }
  .bar i.none { background: rgba(72,96,125,0.45); }

  .rows { display: grid; gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
  .row { display: grid; grid-template-columns: 1fr auto; gap: 8px 18px; padding: 12px 16px; background: var(--panel); align-items: start; }
  .row:nth-child(even) { background: var(--panel-2); }
  .row.hide { display: none; }
  .row-name { font-size: 0.95rem; font-weight: 500; }
  .row-note { color: var(--dim); font-size: 0.86rem; margin-top: 3px; }

  .scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 4px; }
  table { border-collapse: collapse; width: 100%; min-width: 620px; font-size: 0.92rem; }
  th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--line); vertical-align: top; }
  thead th { font-family: var(--mono); font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--dimmer); background: var(--panel-2); font-weight: 500; white-space: nowrap; }
  tbody tr { background: var(--panel); }
  tbody tr:last-child td { border-bottom: none; }
  td.num { font-family: var(--mono); font-variant-numeric: tabular-nums; color: var(--text); }
  td.held { color: var(--dim); font-size: 0.86rem; }

  .queue { display: grid; gap: 10px; }
  .q { display: grid; grid-template-columns: 2.2rem 1fr auto; gap: 16px; align-items: start; background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 15px 18px; }
  .q-n { font-family: var(--mono); color: var(--accent); font-size: 0.9rem; padding-top: 2px; }
  .q-t { font-weight: 600; margin: 0 0 4px; }
  .q-d { color: var(--dim); font-size: 0.89rem; margin: 0; }
  .q-tag { font-family: var(--mono); font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dimmer); border: 1px solid var(--line); border-radius: 3px; padding: 4px 8px; white-space: nowrap; cursor: help; }
  .q-tag-proved { color: var(--proved); border-color: rgba(47,212,181,0.4); background: rgba(47,212,181,0.08); }
  .q-tag-shipped { color: var(--partial); border-color: rgba(245,165,36,0.4); background: rgba(245,165,36,0.08); }
  .q-tag-blocked { color: #ff8fa0; border-color: rgba(255,143,160,0.4); background: rgba(255,143,160,0.07); }

  /* only proved earns the line through — see the comment at the generator */
  .q-proved { opacity: 0.55; border-color: rgba(47,212,181,0.22); }
  .q-proved .q-t { text-decoration: line-through; text-decoration-color: var(--proved); text-decoration-thickness: 2px; }
  .q-proved .q-n { color: var(--proved); }

  /* shipped-but-unproved is deliberately NOT struck through, and says so */
  .q-shipped { border-left: 3px solid var(--partial); }
  .q-blocked { border-left: 3px solid rgba(255,143,160,0.5); }
  .q-blocked .q-t, .q-blocked .q-d { opacity: 0.82; }

  /* ── timeline ─────────────────────────────────────── */
  .timeline { list-style: none; margin: 0; padding: 0 0 0 4px; display: grid; gap: 0; }

  .tl { display: grid; grid-template-columns: 1.6rem 1fr; gap: 0 16px; position: relative; }

  /* one continuous rail, drawn by the dots' container rather than a pseudo-element per row */
  .tl::before {
    content: '';
    position: absolute;
    left: 0.52rem;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--line);
  }
  .tl:first-child::before { top: 1.1rem; }
  .tl:last-child::before { bottom: auto; height: 1.1rem; }

  .tl-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--ground);
    border: 2px solid var(--dimmer);
    margin-top: 0.85rem;
    position: relative;
    z-index: 1;
    justify-self: start;
    margin-left: 0.19rem;
  }

  .tl[data-k="proved"] .tl-dot, .tl[data-k="fixed"] .tl-dot { border-color: var(--proved); }
  .tl[data-k="broke"] .tl-dot { border-color: var(--broken); background: var(--broken); }
  .tl[data-k="trap"] .tl-dot { border-color: var(--partial); background: var(--partial); }
  .tl[data-k="measured"] .tl-dot { border-color: var(--untested); }
  .tl[data-k="rule"] .tl-dot { border-color: var(--accent); }
  .tl[data-k="built"] .tl-dot { border-color: var(--accent-dim); background: var(--accent-dim); }

  .tl-body { padding: 0 0 22px; min-width: 0; }
  .tl-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 3px; }
  .tl-date { font-family: var(--mono); font-size: 0.74rem; color: var(--dimmer); font-variant-numeric: tabular-nums; }

  .tl-kind {
    font-family: var(--mono);
    font-size: 0.62rem;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 2px;
    border: 1px solid;
  }
  .tl-built { color: var(--dim); border-color: var(--line); }
  .tl-proved, .tl-fixed { color: var(--proved); border-color: rgba(47,212,181,0.4); }
  .tl-broke { color: var(--broken); border-color: rgba(255,93,93,0.45); }
  .tl-trap { color: var(--partial); border-color: rgba(245,165,36,0.45); }
  .tl-measured { color: var(--untested); border-color: rgba(139,127,212,0.42); }
  .tl-rule { color: var(--accent); border-color: rgba(62,166,255,0.42); }

  .tl-t { font-weight: 600; font-size: 0.98rem; margin: 0 0 3px; }
  .tl-d { color: var(--dim); font-size: 0.88rem; margin: 0; max-width: 70ch; }

  .callout {
    background: linear-gradient(180deg, rgba(255,143,160,0.07), rgba(255,143,160,0.02));
    border: 1px solid rgba(255,143,160,0.28);
    border-radius: 4px;
    padding: 18px 22px;
    margin: 24px 0 0;
  }
  .callout h4 { font-family: var(--display); font-weight: 500; font-size: 1rem; margin: 0 0 8px; color: #ff8fa0; }
  .callout p { margin: 0; color: var(--dim); font-size: 0.93rem; max-width: 72ch; }

  footer { margin-top: 64px; padding-top: 22px; border-top: 1px solid var(--line); color: var(--dimmer); font-family: var(--mono); font-size: 0.76rem; position: relative; z-index: 1; }
  footer p { margin: 0 0 6px; }

  @media (max-width: 660px) {
    .row { grid-template-columns: 1fr; }
    .row-tags { flex-direction: row; align-items: center; justify-content: flex-start; }
    .crit, .q { grid-template-columns: 1.8rem 1fr; }
    .crit > .row-tags, .q > .q-tag { grid-column: 2; justify-self: start; margin-top: 6px; }
  }

  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
</style>

<div class="wrap">
  <div class="bloom"></div>

  <header>
    <p class="eyebrow">Completion tracker · generated ${h(meta.read)}</p>
    <h1>JARVIS Mobile</h1>
    <p class="standfirst">
      Every feature in the ledger, what state it is actually in, and who is holding up the
      rest. Two numbers matter and they are not the same number: what a human has watched
      work on the phone, and what merely has code.
    </p>
    <p class="provenance">
      <strong>Generated, not written.</strong> Every row, badge and percentage on this page is
      counted from <code>docs/status/ledger.json</code> by <code>node scripts/build-status.mjs</code> — that
      file is the single source of truth for status, and editing this page is lost work.
      <code>ROADMAP.md</code> §0b and §0c come from the same place, so the two cannot disagree.
      <code>RESUME.md</code> is untouched: it answers how something was proved and what it cost
      to find out, which is a different question.
    </p>
    <ul class="facts">
      <li>Branch <b>${h(meta.branch)}</b></li>
      <li>HEAD <b>${h(meta.head)}</b></li>
      <li><b>${meta.tests}</b> tests · ${meta.suites} suites</li>
      <li><code>tsc --noEmit</code> <b>${h(meta.typecheck)}</b></li>
      <li>OTA <b>verified</b> ${h(meta.otaVerified.on)}</li>
    </ul>
  </header>

  <div class="meters">
    <div class="meter">
      <span class="meter-num" style="color:var(--proved)">${pct(T.proved)}<span>%</span></span>
      <span class="meter-label">Proved on the phone</span>
      <div class="track"><i style="width:${pct(T.proved)}%;background:var(--proved)"></i></div>
      <p class="meter-sub">${T.proved} of ${total} ledger rows a human has watched work. Nothing is upgraded by a passing test alone.</p>
    </div>
    <div class="meter">
      <span class="meter-num" style="color:var(--accent)">${pct(hasCode)}<span>%</span></span>
      <span class="meter-label">Has code</span>
      <div class="track"><i style="width:${pct(hasCode)}%;background:var(--accent)"></i></div>
      <p class="meter-sub">${hasCode} rows: proved, partial, unexercised and broken together. The gap to the left is the honesty gap.</p>
    </div>
    <div class="meter">
      <span class="meter-num" style="color:#ff8fa0">${blocked.length}</span>
      <span class="meter-label">Blocked outside this repo</span>
      <div class="track"><i style="width:${Math.round((blocked.length / total) * 100)}%;background:#ff8fa0"></i></div>
      <p class="meter-sub">${byBlocker.brain} on the brain, ${byBlocker.desk} on the desk, ${byBlocker.device} on the phone in hand. Marked on every row below.</p>
    </div>
    <div class="meter">
      <span class="meter-num">${critMet}<span>/${criteria.length}</span></span>
      <span class="meter-label">Criteria fully met</span>
      <div class="track"><i style="width:${Math.round((critPartial / criteria.length) * 100)}%;background:var(--partial)"></i></div>
      <p class="meter-sub">${critPartial} partly met, ${criteria.length - critMet - critPartial} not started. ${critBrain} need the brain, so this repo tops out at ${critCeiling}%.</p>
    </div>
  </div>

  <section>
    <h2>The definition of complete</h2>
    <p class="sec-note">
      The shortest set of things whose absence makes the app <em>incomplete</em> rather than
      merely unfinished. Its own opening rule is the strict one: <strong>nothing may be
      unexercised</strong>, because a feature nobody has ever used is a claim, not a capability.
    </p>
    <div class="criteria">${critBlocks}</div>

    <div class="callout">
      <h4>Why 100% is not reachable from this repo</h4>
      <p>
        ${critBrain} of the ${criteria.length} criteria are gateway work, which is
        <code>jarvis-brain</code> and deliberately not being touched — so the app repo alone
        tops out at ${critCeiling}%. That dependency is kept and marked rather than dropped:
        every affected row below carries a <span class="dep dep-brain">Brain</span> badge, and
        the table further down says what each one is waiting for.
      </p>
    </div>
  </section>

  <section>
    <h2>The ledger — all ${total} rows</h2>
    <p class="sec-note">
      <strong>Proved</strong> — a human has seen it work on the phone.
      <strong>Partial</strong> — works, with a named gap.
      <strong>Unexercised</strong> — code and tests are in, no human has ever run it.
      <strong>Broken</strong> — works badly, defect logged.
      <strong>Not built</strong> — nothing there.
      Filter by state, or by what is blocking it.
    </p>

    <div class="controls">
      <span class="controls-label">State</span>
      <button class="filter" data-k="s" data-f="all" aria-pressed="true">All</button>
      ${ORDER.map((k) => `<button class="filter" data-k="s" data-f="${k}" aria-pressed="false">${LABEL[k]}</button>`).join('\n      ')}
      <span class="count" id="visCount"></span>
    </div>
    <div class="controls">
      <span class="controls-label">Blocked on</span>
      <button class="filter" data-k="b" data-f="all" aria-pressed="true">Anything</button>
      ${Object.entries(blockers)
        .filter(([k, v]) => byBlocker[k] > 0 && k !== 'none')
        .map(([k, v]) => `<button class="filter" data-k="b" data-f="${k}" aria-pressed="false">${v.label} (${byBlocker[k]})</button>`)
        .join('\n      ')}
    </div>

    <div id="areas">${areaBlocks}</div>
  </section>

  <section>
    <h2>What is holding up the rest</h2>
    <p class="sec-note">
      Kept and marked, not dropped. Nothing here is being attempted, and each row says why.
      The brain rows are a deliberate constraint rather than a discovery — that repo is clean
      and fully pushed.
    </p>
    <div class="scroll">
      <table>
        <thead><tr><th>Blocked on</th><th>Rows</th><th>What it means</th><th>Which rows</th></tr></thead>
        <tbody>${blockedRows}</tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>How it got here</h2>
    <p class="sec-note">
      Newest last. The features are the least interesting rows: what this project actually
      runs on is the <span class="tl-kind tl-measured">Measured</span> and
      <span class="tl-kind tl-trap">Trap</span> entries — the things that were assumed,
      turned out false, and cost a session. They are kept because a project relearns a
      lesson it has already paid for otherwise.
    </p>
    <ol class="timeline">${timelineBlocks}</ol>
  </section>

  <section>
    <h2>Every task, and what is actually finished</h2>
    <p class="sec-note">
      All ${queue.length} of them, blocked ones included. <strong>A title is struck through only
      when it is proved</strong> — a human has seen it work — which is the same bar the ledger
      uses. <span class="q-tag q-tag-shipped">Shipped · unproved</span> means code landed, tests
      green, published, and still nobody has looked: the most recent one was correct in
      ${meta.tests} tests and unseen on a phone, and striking that through would make this list
      agree with the tests rather than with reality.
    </p>
    <p class="sec-note" style="margin-top:-10px">
      <strong>${qTally.proved ?? 0} proved · ${qTally.shipped ?? 0} shipped and unproved ·
      ${qTally.open ?? 0} open · ${qTally.blocked ?? 0} blocked elsewhere.</strong>
      Detail for each in <code>docs/superpowers/plans/2026-08-24-app-completion.md</code>.
    </p>
    <div class="queue">${queueBlocks}</div>
  </section>

  <footer>
    <p>Single source of truth: <code>docs/status/ledger.json</code>. Regenerate with <code>node scripts/build-status.mjs</code>; <code>node scripts/build-status.mjs --check</code> fails if this file is stale.</p>
    <p>Archaeology — how each thing was proved and what it cost — stays in <code>RESUME.md</code>. What to tap on the device stays in <code>TESTING.md</code>.</p>
    <p>OTA channel <code>${h(meta.otaVerified.channel)}</code> verified ${h(meta.otaVerified.on)}, runtime <code>${h(meta.otaVerified.runtime)}</code>.</p>
  </footer>
</div>

<script>
  const rows = [...document.querySelectorAll('.row')];
  const countEl = document.getElementById('visCount');
  const pick = { s: 'all', b: 'all' };

  function apply() {
    rows.forEach((r) => {
      const ok = (pick.s === 'all' || r.dataset.s === pick.s) &&
                 (pick.b === 'all' || r.dataset.b === pick.b);
      r.classList.toggle('hide', !ok);
    });
    document.querySelectorAll('button.filter').forEach((b) => {
      b.setAttribute('aria-pressed', String(pick[b.dataset.k] === b.dataset.f));
    });
    document.querySelectorAll('.area').forEach((a) => {
      const any = [...a.querySelectorAll('.row')].some((r) => !r.classList.contains('hide'));
      a.style.display = any ? '' : 'none';
    });
    const shown = rows.filter((r) => !r.classList.contains('hide')).length;
    countEl.textContent = shown === rows.length
      ? \`${total} rows · ${T.proved} proved · ${T.none} not built\`
      : shown + ' of ' + rows.length + ' rows';
    try { localStorage.setItem('jarvis-status-filter', JSON.stringify(pick)); } catch (e) { /* private window, or site data blocked */ }
  }

  document.querySelectorAll('button.filter').forEach((b) => {
    b.addEventListener('click', () => { pick[b.dataset.k] = b.dataset.f; apply(); });
  });

  try {
    const saved = JSON.parse(localStorage.getItem('jarvis-status-filter') || 'null');
    if (saved && typeof saved.s === 'string' && typeof saved.b === 'string') Object.assign(pick, saved);
  } catch (e) { /* nothing stored, nothing to restore */ }
  apply();
</script>
`;
}

/* ── write, or check ───────────────────────────────────────────────────── */

let roadmap = readFileSync(ROADMAP, 'utf8');
roadmap = splice(roadmap, 'ledger', mdLedger());
roadmap = splice(roadmap, 'criteria', mdCriteria());
const tracker = html();

if (CHECK) {
  const stale = [];
  if (readFileSync(ROADMAP, 'utf8') !== roadmap) stale.push('ROADMAP.md §0b/§0c');
  try {
    if (readFileSync(TRACKER, 'utf8') !== tracker) stale.push('docs/completion-tracker.html');
  } catch {
    stale.push('docs/completion-tracker.html (missing)');
  }
  if (stale.length) {
    console.error('Stale, run `node scripts/build-status.mjs`:\n  ' + stale.join('\n  '));
    process.exit(1);
  }
  console.log(`Up to date — ${total} rows, ${T.proved} proved, ${blocked.length} blocked elsewhere.`);
  process.exit(0);
}

writeFileSync(ROADMAP, roadmap);
writeFileSync(TRACKER, tracker);

console.log(`Wrote ROADMAP.md §0b/§0c and docs/completion-tracker.html`);
console.log(
  `  ${total} rows · ${T.proved} proved (${pct(T.proved)}%) · ${hasCode} have code (${pct(hasCode)}%)`
);
console.log(
  `  blocked elsewhere: ${blocked.length} — ` +
    Object.entries(byBlocker)
      .filter(([k, n]) => n > 0 && !OURS.has(k))
      .map(([k, n]) => `${n} ${k}`)
      .join(', ')
);
console.log(
  `  criteria: ${critMet}/${criteria.length} met, ${critPartial} partial, ${critBrain} need the brain (ceiling ${critCeiling}%)`
);
