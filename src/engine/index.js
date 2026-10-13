/**
 * Grind Dial-In calibration engine.
 *
 * Pure JavaScript with no React or device code, so the same file runs in the app,
 * on a server, and in tests. Ported line-for-line from the web prototype
 * (see the specification, section 4). Do not change behaviour here without
 * re-running tests/engine.test.mjs.
 */

export const ok = Number.isFinite;
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
export const fmt = (v, d = 1) => (ok(v) ? v.toFixed(d) : '–');

/* ---------------- grinder rules ---------------- */

export const RULE_DEFAULTS = {
  step: 10,          // extraction seconds per notch
  dir: 'lower',      // finer on this grinder is a 'lower' | 'higher' number
  deg: 4,            // room climate °C per notch
  warm: 'finer',     // when the room warms up: 'finer' | 'coarser'
  burr: 'fan',       // 'fan' (workload matters) | 'controlled'
  marks: 10,         // marks between numbers on the dial
  presets: '',       // saved doser presets, e.g. "5.8, 6.0, 6.2"
  loadMarks: '',     // marks coarser per step busier (fan-cooled only); blank = learn
  humEq: 12,         // % RH that counts the same as 1 °C
  doserNotch: '',    // dose-time seconds to add per notch finer; blank = learn
};

export const MODELS = ['Mythos One', 'Compak E6', 'Mazzer', 'Other'];

/** Known setups applied when a grinder is registered. */
export function modelDefaults(model) {
  const n = (model || '').toLowerCase();
  if (n.includes('mythos')) return { marks: 6, burr: 'controlled', presets: '5.8, 6.0, 6.2' };
  if (n.includes('e6') || n.includes('compak')) return { burr: 'fan', loadMarks: 1 };
  return {};
}

/** Full rule set for a grinder: defaults, then model defaults, then the barista's own values. */
export function rulesFor(grinder) {
  const g = grinder || {};
  return { ...RULE_DEFAULTS, ...modelDefaults(g.model || g.name), ...(g.rules || {}) };
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

export function dialMarks(rules) {
  const v = parseInt(rules.marks, 10);
  return v >= 2 && v <= 10 ? v : 10;
}

/* ---------------- dial notation ----------------
   Baristas type what the dial reads. On a dial with M marks between numbers,
   "4.3" = number 4, mark 3 = 4 + 3/M notches. A second digit is a fraction past
   the mark: 4.25 = halfway past mark 2. Display rounds to the nearest quarter mark. */

export const QTR = 4;
const FR = ['', '¼', '½', '¾'];

export function fromDial(v, M) {
  if (!ok(v)) return null;
  const w = Math.floor(v + 1e-9);
  const d = Math.min((v - w) * 10, M - 1 / QTR);
  return w + d / M;
}
export function toDial(x, M) {
  let w = Math.floor(x + 1e-9), d = Math.round((x - w) * M * QTR) / QTR;
  if (d >= M - 1e-9) { w += 1; d = 0; }
  const mk = Math.floor(d + 1e-9);
  return { w, mk, q: Math.round((d - mk) * QTR) };
}
export const fmtDial = (x, M) => { if (!ok(x)) return '–'; const t = toDial(x, M); return `${t.w}.${t.mk}${FR[t.q]}`; };
const fracText = q => { const whole = Math.floor(q + 1e-9), f = Math.round((q - whole) * QTR); return (whole ? String(whole) : '') + FR[f] || '0'; };
export const marksText = q => `${fracText(q)} mark${q > 1 ? 's' : ''}`;
export const dialWords = (x, M) => { const t = toDial(x, M), d = t.mk + t.q / QTR; return d ? `${t.w} and ${marksText(d)}` : `on the ${t.w}`; };

/** Validation for a grind setting typed by the barista. Returns an error message or null. */
export function checkDialEntry(v, M) {
  if (!ok(v)) return 'Enter the grind setting.';
  if (M >= 10) return null;
  const w = Math.floor(v + 1e-9), d = (v - w) * 10;
  if (d >= M - 1e-9) return `This grinder has ${M} marks between numbers, so the first decimal goes from .0 to .${M - 1}. For example, 4.3 = mark 3 and 4.35 = halfway past mark 3.`;
  return null;
}

/* ---------------- the model ---------------- */

// 'climate' = room temperature and humidity combined into one figure (°C equivalent)
export const COV = ['climate', 'groupTemp', 'yield', 'workload', 'dose'];
const SCALE = { climate: 5, groupTemp: 2, yield: 5, workload: 1, dose: 1 };
const LAMBDA = 3;
const PRIOR_W = 4;

function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-10) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/** Turn a rule set into the model's starting values (priors). */
export function priorsFrom(rules) {
  const spn = num(rules.step), deg = num(rules.deg), M = dialMarks(rules);
  // finer always means a slower shot; which way the numbers run decides the sign
  const slope = ok(spn) && spn > 0 ? (rules.dir === 'higher' ? spn : -spn) : null;
  const secPerC = (ok(spn) && spn > 0 && ok(deg) && deg > 0) ? (rules.warm === 'finer' ? -1 : 1) * spn / deg : 0;
  // busier = burrs expand = grind finer = slower shot, which the barista undoes by going coarser
  const lm = num(rules.loadMarks);
  const loadPrior = (ok(spn) && spn > 0 && ok(lm) && lm > 0) ? (lm / M) * spn : 0;
  return { slope, fan: rules.burr === 'fan', tempPrior: secPerC * SCALE.climate, loadPrior };
}

export function fit(list, pri) {
  const prior = pri.slope;
  const L = list.filter(s => ok(s.setting) && ok(s.time));
  const n = L.length, distinct = new Set(L.map(s => s.setting)).size;
  if (n < 1 || (distinct < 2 && prior === null)) return { ok: false, n };
  const mean = {}, varies = {};
  COV.forEach(k => { const v = L.map(s => s[k]).filter(ok); mean[k] = v.length ? avg(v) : 0;
    varies[k] = v.length >= 2 && Math.max(...v) - Math.min(...v) > 1e-9; });
  const cov = (k, val) => (ok(val) ? (val - mean[k]) / SCALE[k] : 0);
  const row = s => [1, s.setting, ...COV.map(k => cov(k, s[k]))];
  const P = 2 + COV.length;
  const A = Array.from({ length: P }, () => Array(P).fill(0)), b = Array(P).fill(0);
  L.forEach(s => { const r = row(s); for (let i = 0; i < P; i++) { b[i] += r[i] * s.time; for (let j = 0; j < P; j++) A[i][j] += r[i] * r[j]; } });
  // each condition starts at the barista's rule (or zero) and moves only as shots show otherwise
  const pr = {
    climate: [pri.tempPrior, pri.tempPrior ? PRIOR_W : LAMBDA], groupTemp: [0, LAMBDA], yield: [0, LAMBDA],
    workload: pri.fan ? [pri.loadPrior, pri.loadPrior ? PRIOR_W : 1] : [0, 1e6], dose: [0, LAMBDA],
  };
  COV.forEach((k, i) => { A[2 + i][2 + i] += pr[k][1]; b[2 + i] += pr[k][0] * pr[k][1]; });
  if (prior !== null) { A[1][1] += PRIOR_W; b[1] += PRIOR_W * prior; }
  const beta = solve(A, b); if (!beta) return { ok: false, n };
  const pred = s => row(s).reduce((t, x, i) => t + x * beta[i], 0);
  const ssr = L.map(s => s.time - pred(s)).reduce((t, r) => t + r * r, 0);
  const my = avg(L.map(s => s.time)), sst = L.reduce((t, s) => t + (s.time - my) ** 2, 0);
  const sigma = n > 2 ? Math.sqrt(ssr / (n - 2)) : null;
  // grind rate (g/s) against setting
  const R = L.filter(s => ok(s.dose) && ok(s.doserTime) && s.doserTime > 0).map(s => ({ x: s.setting, y: s.dose / s.doserTime }));
  let rate = null;
  if (R.length) {
    const xs = R.map(r => r.x), rs = R.map(r => r.y);
    const mx = avg(xs), myr = avg(rs), xmin = Math.min(...xs), xmax = Math.max(...xs);
    const rmin = Math.min(...rs), rmax = Math.max(...rs);
    const sxx = R.reduce((t, r) => t + (r.x - mx) ** 2, 0);
    // only trust a grind-rate trend from 3+ shots, and shrink it while data is thin
    let slope = (R.length >= 3 && sxx > 1e-9) ? R.reduce((t, r) => t + (r.x - mx) * (r.y - myr), 0) / sxx : 0;
    slope *= R.length / (R.length + 3);
    // never extrapolate beyond the settings tried, and keep the rate near what was measured
    rate = x => { const xc = Math.min(xmax, Math.max(xmin, x)); return Math.min(rmax * 1.15, Math.max(rmin * 0.85, myr + slope * (xc - mx))); };
  }
  return { ok: true, n, beta, mean, cov, varies, sigma, r2: sst > 0 ? 1 - ssr / sst : null, L, rate };
}

/* ---------------- recommendation ---------------- */

const NAMES = { climate: 'Room climate', groupTemp: 'Group head', yield: 'Yield', workload: 'Workload', dose: 'Dose' };
const LOADS = ['quiet', 'steady', 'busy'];

/**
 * Work out the two settings for the next shot.
 *
 * @param {object}   args
 * @param {object[]} args.shots   shots for one grinder + coffee, oldest first (setting in dial notation)
 * @param {object}   args.rules   the grinder's rules (see rulesFor)
 * @param {object}   args.now     { target, dose, yield, roomTemp, humidity, groupTemp, workload }
 * @param {object}  [args.quick]  optional { setting, time } for a shot just pulled
 * @returns {object} { status, ...readings }  status: 'ready' | 'no-shots' | 'need-more' | 'no-target' | 'flat'
 */
export function recommend({ shots, rules, now, quick }) {
  const M = dialMarks(rules);
  const hEq = num(rules.humEq), H = ok(hEq) && hEq > 0 ? hEq : 12;
  const hs = shots.map(s => s.humidity).filter(ok), hFill = hs.length ? avg(hs) : 50;
  const climateOf = (t, h) => (ok(t) ? t + ((ok(h) ? h : hFill) - 50) / H : null);
  const P = shots.map(s => ({ ...s, dial: s.setting, setting: fromDial(s.setting, M), climate: climateOf(s.roomTemp, s.humidity) }));
  const m = fit(P, priorsFrom(rules));
  if (!P.length) return { status: 'no-shots', M };
  if (!m.ok) return { status: 'need-more', M, model: m };
  const target = num(now.target), dose = num(now.dose);
  const c = {
    climate: climateOf(ok(num(now.roomTemp)) ? num(now.roomTemp) : null, num(now.humidity)),
    groupTemp: num(now.groupTemp), yield: num(now.yield), workload: num(now.workload), dose,
    roomTemp: num(now.roomTemp), humidity: num(now.humidity),
  };
  const b1 = m.beta[1];
  if (!ok(target)) return { status: 'no-target', M, model: m };
  if (Math.abs(b1) < 0.3) return { status: 'flat', M, model: m, secondsPerNotch: b1 };

  const last = m.L[m.L.length - 1];
  const qT = quick ? num(quick.time) : null, qS = quick ? fromDial(num(quick.setting), M) : null;
  const parts = [];
  let anchorS, expected, anchorLabel;
  if (ok(qT) && ok(qS)) {
    // a shot pulled right now already reflects today's room and workload
    anchorS = qS; expected = qT; anchorLabel = `Shot just pulled at ${fmtDial(qS, M)} ran ${fmt(qT)} s`;
  } else {
    anchorS = last.setting;
    let shift = 0;
    COV.forEach((k, i) => {
      const to = ok(c[k]) ? c[k] : last[k];
      const d = m.beta[2 + i] * (m.cov(k, to) - m.cov(k, last[k]));
      shift += d;
      if (Math.abs(d / b1) >= 0.5 / (M * QTR)) parts.push({ k, from: last[k], to, notch: -d / b1 });
    });
    expected = last.time + shift;
    anchorLabel = `Last logged shot ${fmtDial(last.setting, M)} ran ${fmt(last.time)} s`;
  }

  // move in quarter marks, never more than one full notch per shot
  let rawDelta = (target - expected) / b1;
  const capped = Math.abs(rawDelta) > 1;
  if (capped) rawDelta = Math.sign(rawDelta);
  const QM = M * QTR;
  const delta = Math.round(rawDelta * QM) / QM, s0 = anchorS + delta;
  const word = n => { const k = Math.round(Math.abs(n) * QM); if (!k) return 'hold'; return `${marksText(k / QTR)} ${n * b1 > 0 ? 'finer' : 'coarser'}`; };
  const move = Math.abs(delta) < 0.5 / QM ? 'hold, no change needed' : `${word(delta)} (${fmtDial(anchorS, M)} → ${fmtDial(s0, M)})`;

  const roomTxt = (t, h) => `${ok(t) ? fmt(t) + ' °C' : '–'} · ${ok(h) ? fmt(h, 0) + '%' : '–'}`;
  const showVal = (k, v, end) => (k === 'climate'
    ? (end === 'from' ? roomTxt(last.roomTemp, last.humidity) : roomTxt(ok(c.roomTemp) ? c.roomTemp : last.roomTemp, ok(c.humidity) ? c.humidity : last.humidity))
    : !ok(v) ? '–' : k === 'workload' ? (LOADS[v] || '–') : fmt(v, 1) + ((k === 'yield' || k === 'dose') ? ' g' : ' °C'));
  const rem = delta - parts.reduce((t, p) => t + p.notch, 0);
  const breakdown = parts.length
    ? [...parts.map(p => ({ label: `${NAMES[p.k]} ${showVal(p.k, p.from, 'from')} → ${showVal(p.k, p.to, 'to')}`, move: word(p.notch) })),
       { label: `Shot time against your ${fmt(target)} s target`, move: word(rem) }]
    : [];

  const finerStep = b1 > 0 ? 1 : -1;
  const doserPerNotch = (m.rate && ok(dose)) ? dose / m.rate(s0 + finerStep) - dose / m.rate(s0) : null;
  const rangeNotch = ok(m.sigma) ? m.sigma / Math.abs(b1) : null;
  const rangeQ = rangeNotch !== null ? Math.round(rangeNotch * QM) : 0;

  // DOSE TIME: last shot's doser time scaled to the target dose, plus time for any real change
  // in burr gap. A workload correction only restores the gap, so it is left out here.
  const lastR = P.filter(s => ok(s.dose) && ok(s.doserTime) && s.doserTime > 0).slice(-1)[0];
  const kRule = num(rules.doserNotch);
  let kDoser = null, kSrc = '';
  if (ok(kRule) && kRule > 0) { kDoser = kRule; kSrc = 'your rule'; }
  else if (doserPerNotch !== null && Math.abs(doserPerNotch) >= 0.02) { kDoser = doserPerNotch; kSrc = 'learned from your shots'; }
  let doser = null, finerGap = 0, doserUnknown = false;
  if (lastR && ok(dose)) {
    const loadNotch = (parts.find(p => p.k === 'workload') || {}).notch || 0;
    finerGap = ((s0 - lastR.setting) - loadNotch) * finerStep;
    const baseT = lastR.doserTime * dose / lastR.dose;
    doser = Math.round((baseT + (kDoser || 0) * finerGap) * 10) / 10;
    doserUnknown = Math.abs(finerGap) >= 0.5 / QM && kDoser === null;
  }
  const rateNow = doser ? dose / doser : null;
  const presets = String(rules.presets || '').split(/[,\s]+/).map(parseFloat).filter(v => ok(v) && v > 0);
  let preset = null;
  if (doser !== null && presets.length) {
    const best = presets.reduce((a, b) => (Math.abs(b - doser) < Math.abs(a - doser) ? b : a));
    preset = Math.abs(best - doser) < 0.05
      ? { match: true, value: best, text: `Use preset ${fmt(best)} s` }
      : { match: false, value: best, text: `No preset matches. Set ${fmt(doser)} s (preset ${fmt(best)} s would give about ${fmt(rateNow * best)} g)` };
  }
  const doserMove = lastR && doser !== null ? Math.round((doser - lastR.doserTime) * 10) / 10 : null;

  const settings = m.L.map(s => s.setting), lo = Math.min(...settings), hi = Math.max(...settings), span = hi - lo;
  const lastTaste = shots[shots.length - 1].taste;

  return {
    status: 'ready', M, model: m,
    dial: { value: s0, text: fmtDial(s0, M), words: dialWords(s0, M), range: rangeQ >= 1 ? marksText(rangeQ / QTR) : null,
            anchor: anchorLabel, move, capped, breakdown,
            anchorValue: anchorS, anchorText: fmtDial(anchorS, M),
            moveShort: Math.abs(delta) < 0.5 / QM ? 'hold' : word(delta),
            reason: (() => { const p = [...parts].sort((a, b) => Math.abs(b.notch) - Math.abs(a.notch))[0];
              return p ? `${NAMES[p.k]} ${showVal(p.k, p.from, 'from')} → ${showVal(p.k, p.to, 'to')}: ${word(p.notch)}` : ''; })() },
    target, ifUnchanged: expected,
    finerIsHigher: b1 > 0,
    dose: { seconds: doser, preset, lastSeconds: lastR ? lastR.doserTime : null, lastGrams: lastR ? lastR.dose : null,
            change: doserMove, perNotch: kDoser, perNotchSource: kSrc, unknownPerNotch: doserUnknown, gapNotches: finerGap },
    secondsPerNotch: Math.abs(b1), secondsPerMark: Math.abs(b1) / M, secondsPerQuarter: Math.abs(b1) / M / QTR,
    shotsUsed: m.n, fitPercent: m.r2 !== null && m.n > 2 ? Math.round(Math.max(0, m.r2) * 100) : null,
    direction: b1 < 0 ? 'Lower numbers run slower on this grinder.' : 'Higher numbers run slower on this grinder.',
    outside: s0 < lo - span * 0.5 || s0 > hi + span * 0.5,
    tasteHint: lastTaste === 'sour' ? 'Your last shot tasted sour. Try a target 2–3 s longer or a longer ratio.'
      : lastTaste === 'bitter' ? 'Your last shot tasted bitter. Try a target 2–3 s shorter or a shorter ratio.' : '',
  };
}

/* ---------------- insights ---------------- */

/**
 * What the shots say so far, for the Insights screen.
 * accuracy: average seconds away from target per week (oldest first, up to 6 weeks)
 * effects:  seconds of extraction for a typical change, learned from the shots
 */
export function insights({ shots, rules }) {
  const M = dialMarks(rules);
  const hEq = num(rules.humEq), H = ok(hEq) && hEq > 0 ? hEq : 12;
  const hs = shots.map(s => s.humidity).filter(ok), hFill = hs.length ? avg(hs) : 50;
  const climateOf = (t, h) => (ok(t) ? t + ((ok(h) ? h : hFill) - 50) / H : null);
  const P = shots.map(s => ({ ...s, setting: fromDial(s.setting, M), climate: climateOf(s.roomTemp, s.humidity) }));
  const m = fit(P, priorsFrom(rules));

  const weekStart = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
  const byWeek = new Map();
  shots.filter(s => ok(s.time) && s.ts).forEach(s => {
    const k = weekStart(s.ts), tgt = ok(s.target) ? s.target : 28;
    if (!byWeek.has(k)) byWeek.set(k, []);
    byWeek.get(k).push(Math.abs(s.time - tgt));
  });
  const accuracy = [...byWeek.entries()].sort((a, b) => a[0] - b[0]).slice(-6)
    .map(([k, v]) => ({ week: k, off: avg(v) }));

  let effects = [];
  if (m.ok) {
    const b = name => m.beta[2 + COV.indexOf(name)];
    effects = [
      { label: 'Grind: 1 mark finer', seconds: Math.abs(m.beta[1]) / M },
      { label: 'Room climate: +2 °C', seconds: b('climate') / SCALE.climate * 2 },
      { label: `Humidity: +5 % RH`, seconds: b('climate') / SCALE.climate * (5 / H) },
      { label: 'Group head: +1 °C', seconds: b('groupTemp') / SCALE.groupTemp },
      { label: 'Dose: +0.5 g', seconds: b('dose') / SCALE.dose * 0.5 },
    ];
    if (rules.burr === 'fan') effects.splice(3, 0, { label: 'Workload: one step busier', seconds: b('workload') });
  }
  const recent = shots.filter(s => ok(s.time)).slice(-12);
  const tgt = s => (ok(s.target) ? s.target : 28);
  const offs = recent.map(s => Math.abs(s.time - tgt(s)));
  return {
    accuracy, effects,
    lastShots: recent,
    avgOff: offs.length ? avg(offs) : null,
    balancedPct: recent.length ? Math.round(100 * recent.filter(s => s.taste === 'balanced').length / recent.length) : null,
    improvementPct: accuracy.length >= 2 && accuracy[0].off > 0 ? Math.round(100 * (accuracy[accuracy.length - 1].off - accuracy[0].off) / accuracy[0].off) : null,
  };
}

/** 16 example shots on a Mythos One, for "Explore with sample shots". Marked sample: true. */
export function sampleShots(grinderId) {
  const rows = [ // setting, room, humidity, time, taste, doser, dose
    [4.3, 19, 50, 24.5, 'sour', 6.0, 17.8], [4.2, 19, 51, 26.0, 'sour', 6.0, 17.9], [4.1, 20, 52, 28.5, 'balanced', 6.1, 18.0],
    [4.1, 21, 55, 27.0, 'balanced', 6.1, 18.0], [4.0, 21, 56, 30.5, 'bitter', 6.2, 18.1], [4.1, 22, 58, 26.5, 'sour', 6.1, 17.9],
    [4.05, 22, 58, 28.0, 'balanced', 6.2, 18.0], [4.0, 23, 60, 29.0, 'balanced', 6.2, 18.0], [4.0, 23, 62, 27.5, 'balanced', 6.2, 17.9],
    [3.5, 23, 61, 31.0, 'bitter', 6.3, 18.1], [4.0, 22, 57, 28.5, 'balanced', 6.2, 18.0], [4.05, 21, 55, 27.0, 'sour', 6.1, 17.9],
    [4.0, 21, 55, 28.0, 'balanced', 6.2, 18.0], [4.0, 22, 58, 28.5, 'balanced', 6.2, 18.0], [4.0, 22, 58, 28.9, 'balanced', 6.2, 18.0],
    [4.05, 21, 55, 28.9, 'balanced', 6.4, 18.0],
  ];
  const start = Date.now() - 24 * 864e5;
  return rows.map((r, i) => ({
    id: 'sample' + i, sample: true, grinderId, bean: 'Ethiopia Guji', setting: r[0], roomTemp: r[1], humidity: r[2], time: r[3],
    taste: r[4], doserTime: r[5], dose: r[6], yield: 36, groupTemp: 93, workload: 1, target: 28, notes: '', roast: '',
    ts: new Date(start + i * 1.5 * 864e5).toISOString(),
  }));
}

/* ---------------- membership ----------------
   Every plan uses this same engine. Plans only limit active grinders and saved shots.
   In the testing build the plan is a local setting. Before launch it must come from a
   verified subscription (RevenueCat entitlement checked server-side). */

export const TIERS = {
  free:     { id: 'free',     label: 'Free',     grinders: 1,        shots: 20,       month: 0,    year: 0 },
  pro:      { id: 'pro',      label: 'Pro',      grinders: 1,        shots: Infinity, month: 2.99, year: 24.99 },
  business: { id: 'business', label: 'Business', grinders: Infinity, shots: Infinity, month: 9.99, year: 89.99 },
};
export const tierOf = id => TIERS[id] || TIERS.free;
export const activeGrinders = grinders => grinders.filter(g => !g.archived);
export const canRegisterGrinder = (tierId, grinders) => activeGrinders(grinders.filter(g => !g.sample)).length < tierOf(tierId).grinders;
// sample grinders and sample shots never count towards a plan's limits
export const realGrinders = grinders => grinders.filter(g => !g.sample);
export const realShots = shots => shots.filter(s => !s.sample);
export const shotLimitReached = (tierId, shots) => realShots(shots).length >= tierOf(tierId).shots;
export function usageText(tierId, grinders, shots) {
  const t = tierOf(tierId), act = activeGrinders(realGrinders(grinders)).length, n = realShots(shots).length;
  if (t.shots !== Infinity) return `Shots used: ${Math.min(n, t.shots)} / ${t.shots}`;
  if (t.grinders !== Infinity) return `${Math.min(act, t.grinders)} of ${t.grinders} grinder profile used`;
  return `${act} active grinder${act === 1 ? '' : 's'}`;
}
/**
 * After a plan change: which grinders need archiving or restoring.
 * Returns { mustChoose: bool, restore: [ids] }.
 */
export function reconcileGrinders(tierId, allGrinders) {
  const grinders = allGrinders.filter(g => !g.sample);
  const lim = tierOf(tierId).grinders, act = activeGrinders(grinders), arch = grinders.filter(g => g.archived);
  if (act.length > lim) return { mustChoose: true, restore: [] };
  if (arch.length && act.length < lim) {
    const n = lim === Infinity ? arch.length : lim - act.length;
    return { mustChoose: false, restore: arch.slice(0, n).map(g => g.id) };
  }
  return { mustChoose: false, restore: [] };
}
export function priceText(tierId, bill) {
  const T = tierOf(tierId), money = v => '£' + v.toFixed(2);
  if (!T.month) return { main: '£0', sub: 'Free forever' };
  if (bill === 'year') return { main: `${money(T.year)}/year`, sub: `Save ${Math.round((1 - T.year / (T.month * 12)) * 100)}% vs monthly` };
  return { main: `${money(T.month)}/month`, sub: `or ${money(T.year)}/year` };
}
