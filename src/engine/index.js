/**
 * Dial In calibration engine (v2).
 *
 * Pure JavaScript with no React or device code, so the same file runs in the app,
 * on a server, and in tests. Drop-in for src/engine/index.js in the Expo app.
 *
 * What it does, per grinder:
 *   1. Grind response k: extraction seconds per notch, learned from shots at different
 *      settings (this coffee first, then the grinder's other coffees, then the benchmark).
 *   2. Grind move: (target time − expected time) ÷ k, from the grinder's confirmed position.
 *   3. Room temperature (s per °C) and absolute humidity (s per g/m³) as SEPARATE terms,
 *      each starting at the barista's benchmark and replaced by measured values as data builds.
 *   4. Doser time to hold the target dose: target dose ÷ grind rate (g/s) at the new setting.
 * Every recommendation says what it is based on and how confident it is.
 */

export const ok = Number.isFinite;
export const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
export const fmt = (v, d = 1) => (ok(v) ? v.toFixed(d) : '–');
export const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

/* ---------------- grinder rules (benchmarks) ---------------- */

export const RULE_DEFAULTS = {
  dir: 'lower',      // finer on this grinder is a 'lower' | 'higher' number
  burr: 'fan',       // 'fan' (workload matters) | 'controlled'
  marks: 10,         // subdivisions between numbers on the dial
  minStep: 0.5,      // smallest step the barista can set, in notches (1, 0.5, 0.25 or 0.1 stepless); half notches by default
  presets: '',       // saved doser presets, e.g. "5.8, 6.0, 6.2"
  doserStep: 0.1,    // smallest step the doser timer can be set in: 0.1 or 0.01 s
  doserNotch: '',    // optional override: doser seconds per subdivision finer; blank = learned
  purge: 3,          // doses to grind off after a grind change, so old grind left in the grinder doesn't skew the test shot
  // House rules: OFF by default. Only used when a manager switches them on, and always
  // labelled as a house rule, never as a measured or verified figure.
  houseRules: false,
  step: '',          // seconds per number
  deg: '',           // room °C per number
  warm: 'finer',     // when the room warms up: 'finer' | 'coarser'
  humEq: '',         // % RH that counts the same as 1 °C
  loadMarks: '',     // subdivisions coarser per step busier (fan-cooled only)
};
/** Guided first step, in subdivisions, while the grinder's response is not yet measured. */
export const GUIDE_STEPS = 2;

export const MODELS = ['Mythos One', 'Compak E6', 'Mazzer', 'Other'];

export function modelDefaults(model) {
  const n = (model || '').toLowerCase();
  if (n.includes('mythos')) return { marks: 6, burr: 'controlled', presets: '5.8, 6.0, 6.2', doserStep: 0.1 };
  if (n.includes('e6') || n.includes('compak')) return { burr: 'fan' };
  return {};
}

export function rulesFor(grinder) {
  const g = grinder || {};
  return { ...RULE_DEFAULTS, ...modelDefaults(g.model || g.name), ...(g.rules || {}) };
}

export function dialMarks(rules) {
  const v = parseInt(rules.marks, 10);
  return v >= 2 && v <= 10 ? v : 10;
}

/* ---------------- dial notation ----------------
   On a dial with M marks between numbers, "4.3" = number 4, mark 3 = 4 + 3/M notches.
   A second digit is a fraction past the mark: 4.25 = halfway past mark 2. */

export const QTR = 4;
export const FR = ['', '¼', '½', '¾'];

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
/** Subdivisions past the number, kept to 0.01 of a subdivision (enough for stepless grinders). */
const subdivOf = (x, M) => { const w = Math.floor(x + 1e-9); return { w, d: Math.round((x - w) * M * 100) / 100 }; };
const isQuarter = d => Math.abs(d * QTR - Math.round(d * QTR)) < 1e-6;
export const fmtDial = (x, M) => { if (!ok(x)) return '–'; if (!isQuarter(subdivOf(x, M).d)) return toEntry(x, M); const t = toDial(x, M); return `${t.w}.${t.mk}${FR[t.q]}`; };
export const fracText = q => { const whole = Math.floor(q + 1e-9), f = Math.round((q - whole) * QTR); return (whole ? String(whole) : '') + FR[f] || '0'; };
export const marksText = q => `${isQuarter(q) ? fracText(q) : String(+q.toFixed(2))} notch${q > 1 ? 'es' : ''}`;
export const dialWords = (x, M) => { const { w, d } = subdivOf(x, M); if (!isQuarter(d)) return `number ${w}, notch ${+d.toFixed(2)}`; const t = toDial(x, M), q = t.mk + t.q / QTR; return q ? `number ${t.w}, notch ${fracText(q)}` : `on the ${t.w}`; };
/** A dial value (notches) as what the barista types: 4 + 3/6 → "4.3". */
export const toEntry = (x, M) => { const { w, d } = subdivOf(x, M); return String(+(w + d / 10).toFixed(3)); };

export function checkDialEntry(v, M) {
  if (!ok(v)) return 'Enter the grind setting.';
  if (M >= 10) return null;
  const w = Math.floor(v + 1e-9), d = (v - w) * 10;
  if (d >= M - 1e-9) return `This grinder has ${M} notches between numbers, so the first decimal goes from .0 to .${M - 1}. For example, 4.3 = notch 3 and 4.35 = halfway past notch 3.`;
  return null;
}

/* ---------------- the model ---------------- */

export const COV = ['roomTemp', 'humidity', 'groupTemp', 'yield', 'workload', 'dose'];
export const ENV = ['roomTemp', 'humidity'];
export const SCALE = { roomTemp: 5, humidity: 10, groupTemp: 2, yield: 5, workload: 1, dose: 1 };
export const LAMBDA = 3;      // pull towards zero for terms with no benchmark
export const LAMBDA_MEASURED = 0.02; // once measured, the recorded results decide the size (only a token pull towards zero)
export const PRIOR_W = 4;     // a benchmark counts like this many shots
// Settings move in small steps (0.1–0.3 of a number), so a shot carries little weight on the
// grind slope: SLOPE_W is the weight of ONE shot ±0.07 of a number from the mean (0.07² ≈ 0.005).
export const SLOPE_W = 0.005;
export const HALF_LIFE = 30;  // days: a shot this old counts half
// evidence needed before a room-condition term is called "measured"
export const EVIDENCE = { roomTemp: { n: 5, range: 3 }, humidity: { n: 5, range: 15 } }; // 3 shots to dial in + 2 to confirm

/**
 * What the grinder actually dropped for a shot. Differs from s.dose (what went in the basket)
 * when the barista topped up or took coffee out. The doser's grind rate must use this.
 */
export const dropped = s => (ok(num(s.ground)) ? num(s.ground) : num(s.dose));

/**
 * Why a shot should be set aside, or null if it is valid. The barista can include it again.
 * prev = the previous shot of the run (same grinder + coffee), run = { dose, tol, yield }.
 */
export function checkShot(shot, prev, run) {
  if (ok(num(shot.dose)) && Math.abs(num(shot.dose) - run.dose) > run.tol + 1e-9) return `Basket dose ${fmt(num(shot.dose))} g, outside ${fmt(run.dose)} ± ${fmt(run.tol)} g`;
  if (ok(num(shot.yield)) && ok(num(run.yield)) && Math.abs(num(shot.yield) - run.yield) > 1 + 1e-9) return `Yield ${fmt(num(shot.yield))} g, more than 1 g from ${fmt(run.yield)} g`;
  if (prev && ok(num(prev.setting)) && ok(num(shot.setting)) && Math.abs(num(shot.setting) - num(prev.setting)) > 2 + 1e-9) return `Setting jumped from ${prev.setting} to ${shot.setting}: check it was typed correctly`;
  return null;
}

/**
 * The measured step between two shots: subdivisions moved finer (+) or coarser (−), and
 * seconds of extraction per subdivision finer. Null when the step can't be measured.
 */
export function stepResponse(shot, prev, rules) {
  const M = dialMarks(rules);
  if (!prev || !ok(num(prev.time)) || !ok(num(shot.time))) return null;
  const a = fromDial(num(prev.setting), M), b = fromDial(num(shot.setting), M);
  if (!ok(a) || !ok(b)) return null;
  const finer = Math.round((rules.dir === 'higher' ? b - a : a - b) * M * 4) / 4; // subdivisions, + = finer
  const out = { prevSetting: prev.setting, stepsFiner: finer };
  if (Math.abs(finer) >= 0.25) out.secPerSubdivision = Math.round(((num(shot.time) - num(prev.time)) / finer) * 100) / 100;
  return out;
}

/** Smallest step the grinder's doser timer can be set in, in seconds (0.1 or 0.01). */
export const doserStepOf = rules => (num(rules && rules.doserStep) === 0.01 ? 0.01 : 0.1);
export const doserDecimals = rules => (doserStepOf(rules) === 0.01 ? 2 : 1);
/** Round a doser time to a step the grinder can actually be set to. */
export const roundDoser = (sec, rules) => { const k = doserStepOf(rules) === 0.01 ? 100 : 10; return Math.round(sec * k) / k; };
export const fmtDoser = (v, rules) => fmt(v, doserDecimals(rules));
/** Seconds shown with 2 decimals only when they need them (e.g. 8.95), otherwise 1. */
export const fmtSec = v => fmt(v, ok(v) && Math.abs(Math.round(v * 10) - v * 10) > 1e-6 ? 2 : 1);

/** Doser time that gives the target dose, from one weighed drop: target ÷ (dropped ÷ doser time). */
export function doserFor(target, droppedG, doserTime, rules) {
  const t = num(target), g = num(droppedG), d = num(doserTime);
  if (!ok(t) || !ok(g) || !ok(d) || g <= 0 || d <= 0) return null;
  const rate = g / d;
  return { rate, seconds: roundDoser(t / rate, rules), exact: t / rate, step: doserStepOf(rules) };
}

export function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-10) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/** Benchmarks from the grinder's rules, in seconds per unit. */
export function benchmarks(rules) {
  if (!rules.houseRules) return { slope: null, perC: 0, perRH: 0, perLoad: 0, fan: rules.burr === 'fan', house: false };
  const spn = num(rules.step), deg = num(rules.deg), M = dialMarks(rules), hEq = num(rules.humEq);
  const slope = ok(spn) && spn > 0 ? (rules.dir === 'higher' ? spn : -spn) : null; // finer = slower
  const perC = ok(spn) && spn > 0 && ok(deg) && deg > 0 ? (rules.warm === 'finer' ? -1 : 1) * spn / deg : 0;
  const perRH = perC && ok(hEq) && hEq > 0 ? perC / hEq : 0;
  const lm = num(rules.loadMarks);
  const perLoad = ok(spn) && spn > 0 && ok(lm) && lm > 0 ? (lm / M) * spn : 0;
  return { slope, perC, perRH, perLoad, fan: rules.burr === 'fan', house: true };
}

/** Smallest settable step as a fraction of a number: 1 subdivision on a 10-mark dial = 0.1. */
export const stepOf = rules => { const q = num(rules.minStep); return (ok(q) && q > 0 ? q : 1) / dialMarks(rules); };

/** Recency weight for a shot: 1 today, ½ after HALF_LIFE days. */
export function ageWeight(ts, now = Date.now()) {
  if (!ts) return 1;
  const days = Math.max(0, (now - new Date(ts).getTime()) / 864e5);
  return Math.pow(0.5, days / HALF_LIFE);
}

/** Prepare logged shots for the model: notches, absolute humidity, weights. Never invents readings. */
export function prepare(shots, M, gauge, now) {
  // shots set aside as invalid (typo, wrong dose, wrong yield) are never learned from
  return shots.filter(s => !s.excluded).map(s => ({
    ...s,
    dial: s.setting,
    setting: fromDial(num(s.setting), M),
    roomTemp: gauge ? num(s.roomTemp) : null,
    humidity: gauge ? num(s.humidity) : null,
    w: ageWeight(s.ts, now),
  }));
}

/**
 * Grind response pooled across the grinder's coffees: each coffee keeps its own level,
 * all share one seconds-per-notch. Returns { slope, n } or null.
 */
export function pooledSlope(P) {
  const by = new Map();
  P.filter(s => ok(s.setting) && ok(s.time)).forEach(s => { const k = s.coffeeId || s.bean || ''; if (!by.has(k)) by.set(k, []); by.get(k).push(s); });
  let sxy = 0, sxx = 0, n = 0;
  by.forEach(L => {
    if (new Set(L.map(s => s.setting)).size < 2) return;
    const W = L.reduce((t, s) => t + s.w, 0), mx = L.reduce((t, s) => t + s.w * s.setting, 0) / W, my = L.reduce((t, s) => t + s.w * s.time, 0) / W;
    L.forEach(s => { sxy += s.w * (s.setting - mx) * (s.time - my); sxx += s.w * (s.setting - mx) ** 2; });
    n += L.length;
  });
  return sxx > 1e-9 && n >= 2 ? { slope: sxy / sxx, n } : null;
}

/** How much evidence the shots hold for each room condition. */
export function envEvidence(L) {
  const out = {};
  ENV.forEach(k => {
    const v = L.map(s => s[k]).filter(ok);
    const range = v.length ? Math.max(...v) - Math.min(...v) : 0;
    out[k] = { n: v.length, range, measured: v.length >= EVIDENCE[k].n && range >= EVIDENCE[k].range };
  });
  const wl = L.map(s => s.workload).filter(ok);
  // workload (the barista's Quiet / Steady / Busy button): measured after 5 shots that include at least
  // 2 at the quietest level logged and 2 at the busiest, the same 3-to-dial-in + 2-to-confirm routine as the room
  out.workload = { n: wl.length, range: wl.length ? Math.max(...wl) - Math.min(...wl) : 0,
    measured: wl.length >= 5 && new Set(wl).size >= 2 && wl.filter(w => w === Math.max(...wl)).length >= 2 && wl.filter(w => w === Math.min(...wl)).length >= 2 };
  // humidity and temperature must have moved separately, or the data can't tell them apart
  const both = L.filter(s => ok(s.roomTemp) && ok(s.humidity));
  if (both.length >= 3) {
    const mx = avg(both.map(s => s.roomTemp)), my = avg(both.map(s => s.humidity));
    const sxy = both.reduce((t, s) => t + (s.roomTemp - mx) * (s.humidity - my), 0);
    const sxx = both.reduce((t, s) => t + (s.roomTemp - mx) ** 2, 0), syy = both.reduce((t, s) => t + (s.humidity - my) ** 2, 0);
    const r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
    if (Math.abs(r) > 0.85) { out.roomTemp.measured = false; out.humidity.measured = false; out.tangled = true; }
  }
  return out;
}

/**
 * Fit extraction time against grind setting and conditions for ONE coffee on ONE grinder.
 * pool: the grinder's pooled slope (other coffees), used before this coffee has its own.
 */
export function fit(L0, bench, pool, gauge) {
  // Room and workload benchmarks are in GRIND units (1 notch per 4 °C), so their seconds
  // follow the grinder's own response: fit once, rescale them by the fitted slope, fit again.
  const first = fitOnce(L0, bench, pool, gauge);
  if (!first.ok || bench.slope === null || !bench.slope) return first;
  const k = Math.abs(first.beta[1] / bench.slope);
  return fitOnce(L0, { ...bench, perC: bench.perC * k, perRH: bench.perRH * k, perLoad: bench.perLoad * k }, pool, gauge);
}

function fitOnce(L0, bench, pool, gauge) {
  const L = L0.filter(s => ok(s.setting) && ok(s.time));
  const n = L.length, distinct = new Set(L.map(s => s.setting)).size;
  let slopePrior = null, slopeW = 0, slopeSource = 'benchmark';
  if (distinct >= 2) slopeSource = 'measured';
  if (pool && Math.abs(pool.slope) >= 0.3) { slopePrior = pool.slope; slopeW = SLOPE_W * Math.min(pool.n, 8); if (distinct < 2) slopeSource = 'grinder'; }
  else if (bench.slope !== null) { slopePrior = bench.slope; slopeW = SLOPE_W * 2; }
  if (n < 1 || (distinct < 2 && slopePrior === null)) return { ok: false, n };

  const mean = {};
  COV.forEach(k => { const v = L.map(s => s[k]).filter(ok); mean[k] = v.length ? avg(v) : 0; });
  const cov = (k, val) => (ok(val) ? (val - mean[k]) / SCALE[k] : 0);
  const row = s => [1, s.setting, ...COV.map(k => cov(k, s[k]))];
  const P = 2 + COV.length;
  const A = Array.from({ length: P }, () => Array(P).fill(0)), b = Array(P).fill(0);
  L.forEach(s => { const r = row(s), w = ok(s.w) ? s.w : 1; for (let i = 0; i < P; i++) { b[i] += w * r[i] * s.time; for (let j = 0; j < P; j++) A[i][j] += w * r[i] * r[j]; } });
  // Before a room effect has much evidence its estimate is held close to zero (it is still used, just small). Once the
  // evidence is there (envEvidence: 5+ shots over a real range), the recorded results decide its size.
  const ev = envEvidence(L); // every recorded result counts
  const roomW = k => (ev[k] && ev[k].measured && !ev.tangled ? LAMBDA_MEASURED : LAMBDA);
  const pr = {
    roomTemp: gauge ? [bench.perC * SCALE.roomTemp, bench.perC ? PRIOR_W : roomW('roomTemp')] : [0, 1e6],
    humidity: gauge ? [bench.perRH * SCALE.humidity, bench.perRH ? PRIOR_W : roomW('humidity')] : [0, 1e6],
    groupTemp: [0, LAMBDA], yield: [0, LAMBDA], dose: [0, LAMBDA],
    workload: bench.fan ? [bench.perLoad, bench.perLoad ? PRIOR_W : 1] : [0, 1e6],
  };
  COV.forEach((k, i) => { A[2 + i][2 + i] += pr[k][1]; b[2 + i] += pr[k][0] * pr[k][1]; });
  if (slopePrior !== null) { A[1][1] += slopeW; b[1] += slopeW * slopePrior; }
  const beta = solve(A, b); if (!beta) return { ok: false, n };
  const pred = s => row(s).reduce((t, x, i) => t + x * beta[i], 0);
  const ssr = L.map(s => s.time - pred(s)).reduce((t, r) => t + r * r, 0);
  const my = avg(L.map(s => s.time)), sst = L.reduce((t, s) => t + (s.time - my) ** 2, 0);
  const sigma = n > 2 ? Math.sqrt(ssr / (n - 2)) : null;
  // how sure we are of each room effect: standard error from the fit (null while there's no residual spread to judge by)
  const se = {};
  ENV.forEach(k => { const i = 2 + COV.indexOf(k); const e = Array(P).fill(0); e[i] = 1; const x = sigma !== null ? solve(A, e) : null; se[k] = x && x[i] > 0 ? sigma * Math.sqrt(x[i]) : null; });
  // grind rate (g/s) against setting, for doser time
  // grind rate learns from every weighed drop, including dose checks with no extraction
  const R = L0.filter(s => ok(s.setting) && ok(dropped(s)) && ok(s.doserTime) && s.doserTime > 0).map(s => ({ x: s.setting, y: dropped(s) / s.doserTime }));
  let rate = null, rateTrend = null, drops = { n: R.length, settings: 0 };
  if (R.length) {
    const xs = R.map(r => r.x), rs = R.map(r => r.y);
    const mx = avg(xs), myr = avg(rs), xmin = Math.min(...xs), xmax = Math.max(...xs);
    const rmin = Math.min(...rs), rmax = Math.max(...rs);
    const sxx = R.reduce((t, r) => t + (r.x - mx) ** 2, 0);
    const settingsTried = new Set(xs).size;
    // grams per second against setting: needs weighed drops at 2+ settings; shrunk a little while data is thin
    let slope = (settingsTried >= 2 && sxx > 1e-9) ? R.reduce((t, r) => t + (r.x - mx) * (r.y - myr), 0) / sxx : 0;
    slope *= R.length / (R.length + 1);
    rate = x => { const xc = Math.min(xmax, Math.max(xmin, x)); return Math.min(rmax * 1.15, Math.max(rmin * 0.85, myr + slope * (xc - mx))); };
    // the trend itself, allowed one notch past the settings tried, never below half the slowest rate seen
    rateTrend = settingsTried >= 2 ? (x => { const xc = Math.min(xmax + 1, Math.max(xmin - 1, x)); return Math.max(rmin * 0.5, myr + slope * (xc - mx)); }) : null;
    drops = { n: R.length, settings: settingsTried };
  }
  return { ok: true, n, distinct, beta, se, mean, cov, sigma, r2: sst > 0 ? 1 - ssr / sst : null, L, rate, rateTrend, drops, slopeSource, env: envEvidence(L) }; // room/workload evidence: every recorded result
}

/* ---------------- doser: what each second is worth in grams, against the room ---------------- */

/**
 * Learns the grind rate (grams per second of doser time) against room temperature and humidity from the
 * weighed drops (shots and dose checks). No formula is assumed: with no spread in the readings the room terms
 * are zero, and they firm up as drops are logged at different temperatures and humidities.
 * Returns { perC, perRH } in grams per second, per °C and per % RH, plus how much evidence backs each.
 */
export function roomRate(rows) {
  const D = rows.filter(s => ok(s.setting) && ok(dropped(s)) && ok(s.doserTime) && s.doserTime > 0 && ok(s.roomTemp) && ok(s.humidity));
  if (D.length < 3) return null;
  const xs = D.map(s => s.setting), Ts = D.map(s => s.roomTemp), Hs = D.map(s => s.humidity);
  const mx = avg(xs), mT = avg(Ts), mH = avg(Hs);
  const useX = new Set(xs).size >= 2;
  const rT = Math.max(...Ts) - Math.min(...Ts), rH = Math.max(...Hs) - Math.min(...Hs);
  // rate = a + b·setting + cT·(T − mean)/5 + cH·(RH − mean)/10, lightly held towards zero while data is thin
  const row = s => [1, useX ? s.setting - mx : 0, (s.roomTemp - mT) / SCALE.roomTemp, (s.humidity - mH) / SCALE.humidity];
  const A = Array.from({ length: 4 }, () => Array(4).fill(0)), b = Array(4).fill(0);
  D.forEach(s => { const r = row(s), y = dropped(s) / s.doserTime; for (let i = 0; i < 4; i++) { b[i] += r[i] * y; for (let j = 0; j < 4; j++) A[i][j] += r[i] * r[j]; } });
  A[1][1] += useX ? 0.1 : 1e6; A[2][2] += 0.1; A[3][3] += 0.1;
  const beta = solve(A, b); if (!beta) return null;
  const ev = k => { const n = D.length, range = k === 'roomTemp' ? rT : rH; return { n, range, measured: n >= EVIDENCE[k].n && range >= EVIDENCE[k].range }; };
  return { perC: rT > 0 ? beta[2] / SCALE.roomTemp : 0, perRH: rH > 0 ? beta[3] / SCALE.humidity : 0, roomTemp: ev('roomTemp'), humidity: ev('humidity') };
}

/** Doser seconds to drop the target dose, from the last weighed drop, corrected for today's room. */
function doserFromDrop(lastR, dose, room, rr) {
  const r0 = dropped(lastR) / lastR.doserTime; // grams per second on that drop
  let rNow = r0, roomSec = 0;
  if (rr && room && ok(room.roomTemp) && ok(room.humidity) && ok(lastR.roomTemp) && ok(lastR.humidity)) {
    rNow = Math.max(r0 * 0.5, r0 + rr.perC * (room.roomTemp - lastR.roomTemp) + rr.perRH * (room.humidity - lastR.humidity));
    roomSec = dose / rNow - dose / r0;
  }
  return { seconds: dose / rNow, roomSec, rateNow: rNow };
}

/* ---------------- recommendation ---------------- */

export const NAMES = { position: 'Grinder moved since saving', roomTemp: 'Room temperature', humidity: 'Humidity', groupTemp: 'Group head', yield: 'Yield', workload: 'Workload', dose: 'Dose' };
export const LOADS = ['quiet', 'steady', 'busy'];
export const SOURCES = {
  guidance: 'Initial calibration guidance',
  grinder: 'Previously observed grinder behaviour',
  environment: 'Historical environmental data',
  benchmarkEnv: 'Observed grinder behaviour + house rule',
};

/**
 * Initial calibration step, used while this grinder + coffee has no measured response yet.
 * It is a fixed, clearly labelled procedure (GUIDE_STEPS subdivisions in the right direction),
 * never a prediction. Each guided shot then measures the response.
 */
function guided({ P, calRow, anchor, M, rules, step, lo, hi, target, dose, note, room }) {
  const QM = M * QTR;
  let s0, t;
  if (anchor && anchor.kind === 'shot' && ok(num(anchor.time)) && ok(fromDial(num(anchor.setting), M))) { s0 = fromDial(num(anchor.setting), M); t = num(anchor.time); }
  else { const lt = [...P].reverse().find(r => ok(r.setting) && ok(r.time)); if (!lt) return null; s0 = lt.setting; t = lt.time; }
  const coarser = rules.dir === 'higher' ? -1 : 1; // sign of a coarser move in dial numbers
  // first step sized to the miss, so a shot just outside the band gets a small move, not a big one
  const miss = t > hi ? t - hi : t < lo ? lo - t : 0;
  const sized = miss <= 2 ? 0.5 : miss <= 5 ? 1 : GUIDE_STEPS;
  const subdiv = Math.max(sized, num(rules.minStep) || 1);
  const delta = t > hi ? coarser * subdiv / M : t < lo ? -coarser * subdiv / M : 0;
  const s1 = s0 + Math.round(delta / step) * step;
  const isHold = Math.abs(s1 - s0) < step / 2;
  const moveShort = isHold ? 'hold' : `${marksText(Math.round(Math.abs(s1 - s0) * M * 100) / 100)} ${t > hi ? 'coarser' : 'finer'}`;
  // doser: proportional from the last weighed drop only
  const rows = [...P, ...(calRow ? [calRow] : [])];
  const lastR = rows.filter(r => ok(dropped(r)) && ok(r.doserTime) && r.doserTime > 0).slice(-1)[0];
  const rr = roomRate(rows);
  const dd = lastR && ok(dose) ? doserFromDrop(lastR, dose, room, rr) : null;
  const doser = dd ? roundDoser(dd.seconds, rules) : null;
  return {
    status: 'ready', guided: true, M, model: null,
    dial: { value: s1, text: fmtDial(s1, M), entry: toEntry(s1, M), words: dialWords(s1, M), range: null, anchor: '', move: moveShort,
            capped: false, conservative: true, breakdown: [], delta: s1 - s0, anchorValue: s0, anchorText: fmtDial(s0, M), fromText: fmtDial(s0, M),
            moveShort, reason: isHold ? '' : `${fmt(t)} s is ${t > hi ? 'slower' : 'faster'} than your ${fmt(lo, 0)}–${fmt(hi, 0)} s band${note ? `. ${note}` : ''}` },
    target, targetLo: lo, targetHi: hi, lo, hi, inRange: isHold, inBand: isHold, ifUnchanged: t, predictedTime: null,
    confidence: 'Low', source: 'guidance', sourceText: SOURCES.guidance, label: 'Insufficient data', tier: 'insufficient', enoughHistory: false, notApplied: [], uncertain: [],
    slopeSource: 'none', env: {}, finerIsHigher: rules.dir === 'higher', direction: '',
    dose: { seconds: doser, target: dose, preset: null, lastSeconds: lastR ? lastR.doserTime : null, lastGrams: lastR ? dropped(lastR) : null,
            change: lastR && doser !== null ? roundDoser(doser - lastR.doserTime, rules) : null, perNotch: null, perNotchSource: '',
            drops: null, unknownPerNotch: !isHold && doser !== null, gapNotches: s1 - s0,
            rateNow: dd ? dd.rateNow : null, roomSec: dd ? dd.roomSec : 0, room: rr },
    secondsPerNotch: null, secondsPerMark: null, secondsPerQuarter: null, shotsUsed: P.length, fitPercent: null, outside: false, tasteHint: '',
  };
}

/**
 * Work out the grind setting and doser time for the next shot.
 *
 * @param {object}   a
 * @param {object[]} a.shots       this grinder + coffee, current calibration epoch, oldest first
 * @param {object[]} [a.grinderShots] all this grinder's shots in the epoch (for the pooled slope)
 * @param {object}   a.rules       the grinder's rules (rulesFor)
 * @param {boolean}  [a.gauge=true] the grinder profile has a temperature & humidity gauge
 * @param {object}   a.now         { target, lo, hi, dose, yield, roomTemp, humidity, groupTemp, workload }
 * @param {object}   [a.anchor]    where to start from:
 *     { kind:'shot', setting, time }                     a shot just pulled (already reflects today)
 *     { kind:'calibration', cal, current }               a saved calibration + grinder's confirmed position
 *   default: the last logged shot, corrected for any change in conditions
 * @returns {object} { status, ... }  status: 'ready' | 'no-shots' | 'need-more' | 'no-target' | 'flat'
 */
export function recommend({ shots, grinderShots, rules, gauge = true, now, anchor, nowTs }) {
  const M = dialMarks(rules), QM = M * QTR;
  const P0 = prepare(shots, M, gauge, nowTs);
  // Shots near where the grinder is now count most: the grind response is not assumed to be linear across
  // the whole dial. A shot one whole number away counts half; dose checks and the rest are unaffected.
  const near = anchor && anchor.kind === 'shot' ? fromDial(num(anchor.setting), M)
    : anchor && anchor.kind === 'calibration' ? (ok(fromDial(num(anchor.current), M)) ? fromDial(num(anchor.current), M) : fromDial(num(anchor.cal.setting), M)) : null;
  const P = ok(near) ? P0.map(s => (ok(s.setting) ? { ...s, w: s.w / (1 + (s.setting - near) ** 2) } : s)) : P0;
  const G = grinderShots ? prepare(grinderShots, M, gauge, nowTs) : P;
  const bench = benchmarks(rules);
  const cal = anchor && anchor.kind === 'calibration' ? anchor.cal : null;
  if (!P.length && !cal) return { status: 'no-shots', M };
  // a saved calibration counts as a data point for its coffee
  const calRow = cal ? prepare([{ ...cal, ts: cal.ts }], M, gauge, nowTs)[0] : null;
  const fitRows = P.length ? P : [calRow];
  // the grinder's response on its OTHER coffees helps a coffee that hasn't been measured yet
  const thisCoffee = cal ? cal.coffeeId : (P[0] && P[0].coffeeId);
  const m = fit(fitRows, bench, pooledSlope(G.filter(s => !thisCoffee || s.coffeeId !== thisCoffee)), gauge);
  const target = num(now.target), dose = num(now.dose);
  if (!ok(target)) return { status: 'no-target', M, model: m };
  // target band, e.g. 28–30 s: a shot expected inside it needs no change
  const tLo = num(now.targetLo), tHi = num(now.targetHi);
  const hasBand = ok(tLo) && ok(tHi) && tHi > tLo;
  const lo = hasBand ? tLo : target - 1, hi = hasBand ? tHi : target + 1;
  const step = stepOf(rules); // smallest settable step, in numbers
  const room = gauge ? { roomTemp: num(now.roomTemp), humidity: num(now.humidity) } : null;
  if (!m.ok) return guided({ P, calRow, anchor, M, rules, step, lo, hi, target, dose, room }) || { status: 'need-more', M, model: m };
  const b1 = m.beta[1];
  // The rule: finer = slower. A long shot always goes coarser, a short shot always goes finer.
  // If the shots so far suggest the opposite (noise, a mistyped setting), don't trust the fit: follow the rule.
  const finerSign = rules.dir === 'higher' ? 1 : -1; // sign seconds-per-number must have
  if (b1 * finerSign <= 0) return guided({ P, calRow, anchor, M, rules, step, lo, hi, target, dose, room,
    note: 'Your shots so far don\'t show the grind response clearly yet, so this follows the rule: long shot coarser, short shot finer' })
    || { status: 'flat', M, model: m, secondsPerNotch: b1 };
  if (Math.abs(b1) < 0.3) return { status: 'flat', M, model: m, secondsPerNotch: b1 };

  const c = {
    roomTemp: gauge ? num(now.roomTemp) : null,
    humidity: gauge ? num(now.humidity) : null,
    groupTemp: num(now.groupTemp), yield: num(now.yield), workload: num(now.workload), dose,
  };
  const last = m.L[m.L.length - 1];
  const parts = [];
  let anchorS, expected, anchorLabel, fromS;
  const notApplied = [], uncertain = [];
  const condShift = ref => {
    let shift = 0;
    COV.forEach((k, i) => {
      // only move for a condition measured BOTH then and now; never fill a missing reading
      if (!ok(c[k]) || !ok(ref[k])) return;
      // Room and workload are ALWAYS taken into account when they're measured. No formula is assumed: the size of
      // each effect is whatever this grinder's own results show so far (zero until they show one), and it sharpens
      // with every shot. While the evidence is thin or inconsistent, the prediction is flagged as still learning.
      if ((ENV.includes(k) || k === 'workload') && !bench.house && Math.abs(c[k] - ref[k]) > 1e-9) {
        const measured = !!(m.env[k] && m.env[k].measured);
        const se = m.se && m.se[k];
        const consistent = !ENV.includes(k) || (se !== null && se !== undefined && Math.abs(m.beta[2 + i]) >= 2 * se);
        if (!measured || !consistent) uncertain.push({ k, from: ref[k], to: c[k] });
      }
      const d = m.beta[2 + i] * (m.cov(k, c[k]) - m.cov(k, ref[k]));
      shift += d;
      if (Math.abs(d / b1) >= step / 2) parts.push({ k, from: ref[k], to: c[k], notch: -d / b1, seconds: d });
    });
    return shift;
  };

  if (anchor && anchor.kind === 'shot' && ok(num(anchor.time)) && ok(fromDial(num(anchor.setting), M))) {
    anchorS = fromDial(num(anchor.setting), M); fromS = anchorS; expected = num(anchor.time);
    anchorLabel = `Shot at ${fmtDial(anchorS, M)} ran ${fmt(expected)} s`;
  } else if (cal) {
    const calS = calRow.setting, cur = ok(fromDial(num(anchor.current), M)) ? fromDial(num(anchor.current), M) : calS;
    fromS = calS; anchorS = cur;
    if (Math.abs(cur - calS) >= step / 2) parts.push({ k: 'position', from: calS, to: cur, notch: calS - cur, seconds: b1 * (cur - calS) });
    expected = num(cal.time) + b1 * (cur - calS) + condShift(calRow);
    anchorLabel = `Saved calibration ${fmtDial(calS, M)} ran ${fmt(num(cal.time))} s` + (Math.abs(cur - calS) > 1e-6 ? `; grinder now on ${fmtDial(cur, M)}` : '');
  } else {
    anchorS = last.setting; fromS = anchorS;
    expected = last.time + condShift(last);
    anchorLabel = `Last logged shot ${fmtDial(last.setting, M)} ran ${fmt(last.time)} s`;
  }

  const inRange = expected >= lo && expected <= hi;
  let rawDelta = (target - expected) / b1;
  let capped = false, conservative = false;
  if (m.slopeSource === 'benchmark') {
    // grind response unknown: half the benchmark move, no more than half a number per shot
    conservative = true;
    rawDelta = rawDelta * 0.5;
    if (Math.abs(rawDelta) > 0.5) { rawDelta = 0.5 * Math.sign(rawDelta); capped = true; }
    if (!inRange && Math.abs(rawDelta) < step) rawDelta = Math.sign(rawDelta) * step; // at least the smallest physical step
  } else if (Math.abs(rawDelta) > 1) { rawDelta = Math.sign(rawDelta); capped = true; }
  // Inside the target band: normally no change. The exception is a prediction from a saved calibration where
  // the evidence (a measured room effect or the grinder having moved) puts the shot clearly off the target:
  // further off than this coffee's own shot-to-shot spread, and by at least one physical step's worth.
  // Then the smallest step(s) back towards the target is a micro-adjustment.
  const drift = expected - target, stepSec = Math.abs(b1) * step;
  const micro = inRange && !!cal && parts.length > 0 && ok(m.sigma) && Math.abs(drift) > m.sigma && Math.abs(drift) >= stepSec;
  if (inRange && !micro) rawDelta = 0;
  // only whole physical steps: the barista can't set 0.37 of a subdivision
  const delta = Math.round(rawDelta / step) * step;
  const s0 = anchorS + delta;
  const word = n => { const sd = Math.round(Math.abs(n) * M * 100) / 100; if (sd < 0.005) return 'hold'; return `${marksText(sd)} ${n * b1 > 0 ? 'finer' : 'coarser'}`; };
  const isHold = Math.abs(delta) < step / 2;
  const move = isHold ? 'hold, no change needed' : `${word(delta)} (${fmtDial(anchorS, M)} → ${fmtDial(s0, M)})`;

  const showVal = (k, v) => !ok(v) ? '–' : k === 'position' ? fmtDial(v, M) : k === 'workload' ? (LOADS[v] || '–') : k === 'humidity' ? fmt(v, 0) + ' % RH'
    : fmt(v, 1) + ((k === 'yield' || k === 'dose') ? ' g' : ' °C');
  const envStatus = k => (m.env[k] && m.env[k].measured ? 'measured' : bench.house ? 'house rule' : 'not measured');
  const rem = delta - parts.reduce((t, p) => t + p.notch, 0);
  const breakdown = parts.length
    ? [...parts.map(p => ({ label: `${NAMES[p.k]} ${showVal(p.k, p.from)} → ${showVal(p.k, p.to)}`, move: word(p.notch), status: ENV.includes(p.k) ? envStatus(p.k) : null })),
       { label: `Shot time against your ${hasBand ? `${fmt(tLo, 0)}–${fmt(tHi, 0)}` : fmt(target)} s target`, move: word(rem), status: null }]
    : [];

  // ---- confidence and source ----
  const envUsed = parts.filter(p => ENV.includes(p.k));
  const envBench = envUsed.some(p => envStatus(p.k) === 'house rule');
  let source = m.slopeSource === 'benchmark' ? 'guidance' : envUsed.length ? (envBench ? 'benchmarkEnv' : 'environment') : 'grinder';
  if (anchor && anchor.kind === 'shot' && m.slopeSource !== 'benchmark') source = 'grinder';
  const rangeNotch = ok(m.sigma) ? m.sigma / Math.abs(b1) : null;
  const rangeQ = rangeNotch !== null ? Math.round(rangeNotch * QM) : 0;
  let confidence;
  if (m.slopeSource === 'benchmark' || m.n < 3 || (envBench && !(anchor && anchor.kind === 'shot'))) confidence = 'Low';
  else if (m.n >= 6 && rangeNotch !== null && rangeNotch * M <= 1) confidence = 'High';
  else confidence = 'Moderate';
  // Verified = the saved calibration stands as it is; Predicted = calculated from measured history
  // Verified: plenty of consistent data and nothing left unaccounted for. Provisional: limited but relevant data,
  // confirm with a shot. (Insufficient data is the guided path, before this grinder's response is measured.)
  const tier = confidence === 'High' && uncertain.length === 0 ? 'verified' : 'provisional';
  const label = tier === 'verified' ? 'Verified recommendation' : 'Provisional recommendation';
  const notAppliedText = notApplied.map(p => `${NAMES[p.k]} ${showVal(p.k, p.from)} → ${showVal(p.k, p.to)}`);
  const enoughHistory = uncertain.length === 0;

  // ---- doser time: target dose ÷ grind rate at the new setting ----
  const finerStep = b1 > 0 ? 1 : -1;
  const doserPerNotch = (m.rateTrend && ok(dose)) ? dose / m.rateTrend(s0 + finerStep) - dose / m.rateTrend(s0) : null;
  const Pd = [...P, ...(calRow ? [calRow] : [])];
  const lastR = Pd.filter(s => ok(dropped(s)) && ok(s.doserTime) && s.doserTime > 0).slice(-1)[0];
  // house-rule override is entered per subdivision; the engine works per whole number
  const kRule = rules.houseRules ? num(rules.doserNotch) : null;
  let kDoser = null, kSrc = '';
  if (ok(kRule) && kRule > 0) { kDoser = kRule * M; kSrc = 'house rule'; }
  else if (doserPerNotch !== null && Math.abs(doserPerNotch) >= 0.02) { kDoser = doserPerNotch; kSrc = 'learned from your weighed drops'; }
  let doser = null, doserUnknown = false, finerGap = 0, dd = null;
  const rr = gauge ? roomRate(Pd) : null;
  if (lastR && ok(dose)) {
    const loadNotch = (parts.find(p => p.k === 'workload') || {}).notch || 0;
    finerGap = ((s0 - lastR.setting) - loadNotch) * finerStep;
    dd = doserFromDrop(lastR, dose, room, rr);
    doser = roundDoser(dd.seconds + (kDoser || 0) * finerGap, rules);
    doserUnknown = Math.abs(finerGap) >= step / 2 && kDoser === null;
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

  const settings = m.L.map(s => s.setting), sLo = Math.min(...settings), sHi = Math.max(...settings), span = sHi - sLo;
  const lastTaste = shots.length ? shots[shots.length - 1].taste : '';
  return {
    status: 'ready', M, model: m,
    dial: { value: s0, text: fmtDial(s0, M), entry: toEntry(s0, M), words: dialWords(s0, M), range: rangeQ >= 1 ? marksText(rangeQ / QTR) : null,
            anchor: anchorLabel, move, capped, conservative, breakdown, delta,
            anchorValue: anchorS, anchorText: fmtDial(anchorS, M), fromText: fmtDial(fromS, M),
            moveShort: isHold ? 'hold' : word(delta),
            reason: (() => { const p = [...parts].sort((a, b) => Math.abs(b.notch) - Math.abs(a.notch))[0];
              return p ? `${NAMES[p.k]} ${showVal(p.k, p.from)} → ${showVal(p.k, p.to)}: ${word(p.notch)}` : ''; })() },
    target, targetLo: hasBand ? tLo : null, targetHi: hasBand ? tHi : null, lo, hi, inRange, inBand: inRange, ifUnchanged: expected, predictedTime: expected + b1 * delta,
    confidence, source, sourceText: SOURCES[source], enoughHistory, label, tier, notApplied: notAppliedText, micro,
    uncertain: uncertain.map(p => `${NAMES[p.k]} ${showVal(p.k, p.from)} → ${showVal(p.k, p.to)}`),
    slopeSource: m.slopeSource, env: m.env,
    finerIsHigher: rules.dir === 'higher',
    direction: b1 < 0 ? 'Lower numbers run slower on this grinder.' : 'Higher numbers run slower on this grinder.',
    dose: { seconds: doser, target: dose, preset, lastSeconds: lastR ? lastR.doserTime : null, lastGrams: lastR ? dropped(lastR) : null,
            change: lastR && doser !== null ? roundDoser(doser - lastR.doserTime, rules) : null, perNotch: kDoser, perNotchSource: kSrc, drops: m.drops, unknownPerNotch: doserUnknown, gapNotches: finerGap,
            rateNow: dd ? dd.rateNow : null, roomSec: dd ? dd.roomSec : 0, room: rr },
    secondsPerNotch: Math.abs(b1), secondsPerMark: Math.abs(b1) / M, secondsPerQuarter: Math.abs(b1) / M / QTR,
    shotsUsed: m.n, fitPercent: m.r2 !== null && m.n > 2 ? Math.round(Math.max(0, m.r2) * 100) : null,
    outside: span > 0 && (s0 < sLo - span * 0.5 || s0 > sHi + span * 0.5),
    tasteHint: lastTaste === 'sour' ? 'Last shot tasted sour. Try a target 2–3 s longer or a longer ratio.'
      : lastTaste === 'bitter' ? 'Last shot tasted bitter. Try a target 2–3 s shorter or a shorter ratio.' : '',
  };
}

/* ---------------- insights ---------------- */

export function insights({ shots, grinderShots, rules, gauge = true }) {
  const M = dialMarks(rules);
  const P = prepare(shots, M, gauge), G = grinderShots ? prepare(grinderShots, M, gauge) : P;
  const thisCoffee = P[0] && P[0].coffeeId;
  const m = fit(P, benchmarks(rules), pooledSlope(G.filter(s => !thisCoffee || s.coffeeId !== thisCoffee)), gauge);
  const weekStart = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
  const tgt = s => (ok(s.target) ? s.target : 30);
  const byWeek = new Map();
  shots.filter(s => ok(s.time) && s.ts).forEach(s => {
    const k = weekStart(s.ts);
    if (!byWeek.has(k)) byWeek.set(k, []);
    byWeek.get(k).push(Math.abs(s.time - tgt(s)));
  });
  const accuracy = [...byWeek.entries()].sort((a, b) => a[0] - b[0]).slice(-6).map(([k, v]) => ({ week: k, off: avg(v) }));
  let effects = [];
  if (m.ok) {
    const b = name => m.beta[2 + COV.indexOf(name)];
    const house = benchmarks(rules).house;
    const st = k => (m.env[k] && m.env[k].measured ? 'measured' : house ? 'house rule' : 'not measured');
    effects = [{ label: 'Grind: 1 notch finer', seconds: Math.abs(m.beta[1]) / M, status: m.slopeSource === 'benchmark' ? 'house rule' : 'measured' }];
    if (gauge) effects.push(
      { label: 'Room temperature: +2 °C', seconds: b('roomTemp') / SCALE.roomTemp * 2, status: st('roomTemp') },
      { label: 'Humidity: +10 % RH', seconds: b('humidity') / SCALE.humidity * 10, status: st('humidity') });
    effects.push({ label: 'Group head: +1 °C', seconds: b('groupTemp') / SCALE.groupTemp, status: null },
      { label: 'Dose: +0.5 g', seconds: b('dose') / SCALE.dose * 0.5, status: null });
    if (rules.burr === 'fan') effects.splice(gauge ? 3 : 1, 0, { label: 'Workload: one step busier', seconds: b('workload'), status: null });
  }
  const recent = shots.filter(s => ok(s.time)).slice(-12);
  const offs = recent.map(s => Math.abs(s.time - tgt(s)));
  return {
    accuracy, effects, lastShots: recent, tangled: !!(m.env && m.env.tangled),
    avgOff: offs.length ? avg(offs) : null,
    balancedPct: recent.length ? Math.round(100 * recent.filter(s => s.taste === 'balanced').length / recent.length) : null,
    improvementPct: accuracy.length >= 2 && accuracy[0].off > 0 ? Math.round(100 * (accuracy[accuracy.length - 1].off - accuracy[0].off) / accuracy[0].off) : null,
    predictions: shots.filter(s => ok(s.predTime) && ok(s.time)).slice(-12).map(s => ({ ts: s.ts, pred: s.predTime, actual: s.time })),
  };
}

/** 16 example shots on a Mythos One, for "Explore with sample shots". Marked sample: true. */
export function sampleShots(grinderId, coffeeId) {
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
    id: 'sample' + i, sample: true, grinderId, coffeeId, bean: 'Ethiopia Guji', setting: r[0], roomTemp: r[1], humidity: r[2], time: r[3],
    taste: r[4], doserTime: r[5], dose: r[6], yield: 36, groupTemp: 93, workload: 1, target: 28, notes: '',
    ts: new Date(start + i * 1.5 * 864e5).toISOString(),
  }));
}

/* ---------------- membership ----------------
   Every plan uses this same engine. Plans only limit active grinders and saved shots.
   In the testing build the plan is a local setting. Before launch it must come from a
   verified subscription (RevenueCat entitlement checked server-side). */

export const TIERS = {
  free:     { id: 'free',     label: 'Free',     grinders: 1,        shots: 20,       month: 0,    year: 0 },
  pro:      { id: 'pro',      label: 'Pro',      grinders: 1,        shots: Infinity, month: 4.99, year: 41.99 },
  business: { id: 'business', label: 'Business', grinders: Infinity, shots: Infinity, month: 15.00, year: 134.99 },
};
export const tierOf = id => TIERS[id] || TIERS.free;
export const activeGrinders = grinders => grinders.filter(g => !g.archived);
export const canRegisterGrinder = (tierId, grinders) => activeGrinders(grinders.filter(g => !g.sample)).length < tierOf(tierId).grinders;
// sample grinders and sample shots never count towards a plan's limits
export const realGrinders = grinders => grinders.filter(g => !g.sample);
export const realShots = shots => shots.filter(s => !s.sample && s.kind !== 'dose'); // dose checks don't count towards the Free limit
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


/* ---------------- re-dial check ----------------
   Small drifts get a suggested tweak. A big shift since the coffee was dialled in means the
   saved settings are no longer a safe starting point, so the barista is asked to dial in again. */
export const REDIAL = { roomTemp: 4, humidity: 15, workload: 2 };

/** Returns a plain-English reason to dial in again, or null. Missing readings are never compared. */
export function redialCheck(cal, now, rules) {
  if (!cal || !now) return null;
  const why = [];
  const a = num(cal.roomTemp), b = num(now.roomTemp);
  if (a !== null && b !== null && Math.abs(b - a) >= REDIAL.roomTemp) why.push(`room ${fmt(a)} → ${fmt(b)} °C`);
  const h0 = num(cal.humidity), h1 = num(now.humidity);
  if (h0 !== null && h1 !== null && Math.abs(h1 - h0) >= REDIAL.humidity) why.push(`humidity ${fmt(h0, 0)} → ${fmt(h1, 0)} %`);
  const w0 = num(cal.workload), w1 = num(now.workload);
  if (rules && rules.burr === 'fan' && w0 !== null && w1 !== null && Math.abs(w1 - w0) >= REDIAL.workload) why.push(`${LOADS[w0] || 'quiet'} → ${LOADS[w1] || 'busy'}`.toLowerCase());
  return why.length ? why.join(', ') : null;
}
