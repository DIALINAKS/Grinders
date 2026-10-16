// Run with: npm test   (node tests/engine.test.mjs)
// Checks the Dial In calibration engine (v2).
import { roomRate, toEntry, checkShot, stepResponse, doserFor, roundDoser, doserStepOf, recommend, rulesFor, fromDial, fmtDial, checkDialEntry, reconcileGrinders, usageText, insights, redialCheck, warmUpReason } from '../src/engine/index.js';
import assert from 'node:assert/strict';

const mazzer = rulesFor({ model: 'Mazzer' });          // 10 subdivisions, finer = lower number, no house rules
const house = rulesFor({ model: 'Mazzer', rules: { houseRules: true, step: 10, deg: 4, humEq: 12 } }); // manager-enabled house rules
const mythos = rulesFor({ model: 'Mythos One' });
const now0 = { target: 30, targetLo: 28, targetHi: 32, dose: 18, yield: 36 };
const day = n => new Date(Date.now() - n * 864e5).toISOString();
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('✓ ' + name); };

t('dial notation', () => {
  assert.equal(fromDial(4.3, 6), 4.5);
  assert.equal(fmtDial(fromDial(4.225, 6), 6), '4.2¼');
  assert.equal(fmtDial(fromDial(4.25, 6), 6), '4.2½');
  assert.ok(checkDialEntry(4.7, 6));
  assert.equal(checkDialEntry(4.35, 6), null);
});

t('first shot, response unknown: guided 2-subdivision step, labelled Insufficient data', () => {
  // brief example: 6.5, 18 g → 36 g, 38 s against 30 s
  const shots = [{ setting: 6.5, dose: 18, yield: 36, time: 38, ts: day(0) }];
  const r = recommend({ shots, rules: mazzer, now: now0, anchor: { kind: 'shot', setting: 6.5, time: 38 } });
  assert.equal(r.status, 'ready');
  assert.equal(r.source, 'guidance');
  assert.equal(r.confidence, 'Low');
  assert.equal(r.label, 'Insufficient data');
  assert.ok(/coarser/.test(r.dial.moveShort));
  assert.equal(r.dial.text, '6.7');          // no assumed value: fixed guided step of 2 subdivisions
  assert.equal(r.predictedTime, null);       // and no claimed prediction
});

t('second shot measures the grind response (brief: 6.5 → 38 s, 6.7 → 33 s)', () => {
  const shots = [
    { setting: 6.5, dose: 18, yield: 36, time: 38, ts: day(0) },
    { setting: 6.7, dose: 18, yield: 36, time: 33, ts: day(0) },
  ];
  const r = recommend({ shots, rules: mazzer, now: now0, anchor: { kind: 'shot', setting: 6.7, time: 33 } });
  assert.equal(r.model.slopeSource, 'measured');
  assert.equal(Math.round(r.secondsPerNotch), 25);   // 2 subdivisions took 5 s off: 2.5 s per subdivision, unaltered by any benchmark
  assert.equal(r.dial.text, '6.8');                   // whole subdivisions only
  assert.equal(r.label, 'Provisional recommendation'); // 2 shots: limited data, confirm with a shot
  assert.equal(r.source, 'grinder');
  assert.ok(/coarser/.test(r.dial.moveShort));
  assert.ok(fromDial(6.7, 10) < r.dial.value);
});

t('inside the target band: hold', () => {
  const shots = [{ setting: 6.5, dose: 18, yield: 36, time: 31, ts: day(0) }];
  const r = recommend({ shots, rules: mazzer, now: now0, anchor: { kind: 'shot', setting: 6.5, time: 31 } });
  assert.equal(r.inBand, true);
  assert.equal(r.dial.moveShort, 'hold');
});

const cal = { setting: 4.0, time: 30, dose: 18, yield: 36, roomTemp: 20, humidity: 50, ts: day(0) };
const prior = [ // two shots at different settings, same room, so the grind response is measured
  { setting: 4.2, time: 25, dose: 18, yield: 36, roomTemp: 20, humidity: 50, ts: day(0) },
  { setting: 4.0, time: 30, dose: 18, yield: 36, roomTemp: 20, humidity: 50, ts: day(0) },
];
const envRow = (r, k) => r.dial.breakdown.find(b => b.label.startsWith(k));

t('house rule on: temperature changes, humidity does not (1 number per 4 °C)', () => {
  const r = recommend({ shots: prior, rules: house, now: { ...now0, roomTemp: 23, humidity: 50 }, anchor: { kind: 'calibration', cal, current: 4.0 } });
  const row = envRow(r, 'Room temperature');
  assert.ok(row && /finer/.test(row.move));
  assert.equal(row.move, '7½ notches finer');       // 3 °C ÷ 4 °C per number = ¾ number
  assert.equal(row.status, 'house rule');
  assert.ok(!envRow(r, 'Humidity'));
  assert.equal(r.confidence, 'Low');           // house rules never earn more than Low
  assert.equal(r.label, 'Provisional recommendation');
});

t('house rule on: humidity changes, temperature does not (12 % RH = 1 °C)', () => {
  const r = recommend({ shots: prior, rules: house, now: { ...now0, roomTemp: 20, humidity: 74 }, anchor: { kind: 'calibration', cal, current: 4.0 } });
  assert.ok(!envRow(r, 'Room temperature'));
  assert.equal(envRow(r, 'Humidity').move, '5 notches finer'); // +24 % RH ≈ 2 °C ≈ ½ number
});

t('house rule on: both change, the two effects add', () => {
  const r = recommend({ shots: prior, rules: house, now: { ...now0, roomTemp: 23, humidity: 74 }, anchor: { kind: 'calibration', cal, current: 4.0 } });
  assert.ok(envRow(r, 'Room temperature') && envRow(r, 'Humidity'));
});

t('default: a room change with no history yet is taken into account at what the shots show (nothing yet) and flagged as still learning', () => {
  const r = recommend({ shots: prior, rules: mazzer, now: { ...now0, roomTemp: 23, humidity: 70 }, anchor: { kind: 'calibration', cal, current: 4.0 } });
  assert.equal(r.dial.breakdown.length, 0);
  assert.equal(r.dial.moveShort, 'hold');
  assert.equal(r.label, 'Provisional recommendation'); // room change not yet measured: verify with a shot
  assert.equal(r.enoughHistory, false);
  assert.ok(r.uncertain.some(t => t.startsWith('Room temperature')));
});

t('whole physical steps only: smallest step of 1 subdivision', () => {
  // 2.5 s per subdivision, 31 s against 29–30 s → 0.6 subdivision → rounds to 1
  const shots = [{ setting: 6.5, time: 26, dose: 18, yield: 36, ts: day(0) }, { setting: 6.3, time: 31, dose: 18, yield: 36, ts: day(0) }];
  const r = recommend({ shots, rules: { ...mazzer, minStep: 1 }, now: { target: 29.5, targetLo: 29, targetHi: 30, dose: 18, yield: 36 }, anchor: { kind: 'shot', setting: 6.3, time: 31 } });
  assert.equal(r.dial.text, '6.4');
  // a grinder that sets half notches gets the smaller, closer move instead
  const half = recommend({ shots, rules: mazzer, now: { target: 29.5, targetLo: 29, targetHi: 30, dose: 18, yield: 36 }, anchor: { kind: 'shot', setting: 6.3, time: 31 } });
  assert.equal(half.dial.text, '6.3½');
});

t('first step is sized to the miss: ½ notch just outside the band, 2 notches only when far out', () => {
  const step = time => recommend({ shots: [{ setting: 6.5, dose: 18, yield: 36, time, ts: day(0) }], rules: mazzer, now: now0, anchor: { kind: 'shot', setting: 6.5, time } }).dial.moveShort;
  assert.equal(step(33), '½ notch coarser');
  assert.equal(step(36), '1 notch coarser');
  assert.equal(step(40), '2 notches coarser');
  assert.equal(step(26), '½ notch finer');
});

t('a missing reading is never filled in', () => {
  const noHum = prior.map(s => ({ ...s, humidity: undefined }));
  const r = recommend({ shots: noHum, rules: house, now: { ...now0, roomTemp: 20, humidity: 80 }, anchor: { kind: 'calibration', cal: { ...cal, humidity: undefined }, current: 4.0 } });
  assert.ok(!envRow(r, 'Humidity'));
});

t('no gauge: room conditions are ignored entirely', () => {
  const r = recommend({ shots: prior, rules: mazzer, gauge: false, now: { ...now0, roomTemp: 26, humidity: 80 }, anchor: { kind: 'calibration', cal, current: 4.0 } });
  assert.equal(r.dial.breakdown.length, 0);
  assert.equal(r.dial.moveShort, 'hold');
});

t('grinder moved since the calibration: prediction starts from where it is now', () => {
  const r = recommend({ shots: prior, rules: mazzer, now: { ...now0, roomTemp: 20, humidity: 50 }, anchor: { kind: 'calibration', cal, current: 4.2 } });
  assert.equal(r.dial.anchorText, '4.2');
  assert.ok(/finer/.test(r.dial.moveShort));    // 4.2 runs fast, so back towards 4.0
});

t('room effect becomes "measured" once temperature has varied on its own', () => {
  const shots = Array.from({ length: 10 }, (_, i) => {
    const T = 18 + (i % 5) * 1.2, H = i % 2 ? 45 : 60, s = 4.0 + (i % 3) * 0.1;
    return { setting: +s.toFixed(1), time: 30 - 25 * (s - 4.0) - 2.5 * (T - 20), dose: 18, yield: 36, roomTemp: T, humidity: H, ts: day(10 - i) };
  });
  const r = recommend({ shots, rules: mazzer, now: { ...now0, roomTemp: 24, humidity: 52 } });
  assert.equal(r.env.roomTemp.measured, true);
  const row = envRow(r, 'Room temperature');
  assert.equal(row.status, 'measured');
});

t('doser time holds the target dose (18 g)', () => {
  const shots = [{ setting: 6.5, dose: 18.4, doserTime: 6.0, yield: 36, time: 30, ts: day(0) }];
  const r = recommend({ shots, rules: mazzer, now: now0, anchor: { kind: 'shot', setting: 6.5, time: 30 } });
  assert.equal(r.dose.seconds, 5.9);           // 18 ÷ (18.4 ÷ 6.0)
});

t('grinder dropped short and barista topped up: doser rate uses what the grinder dropped', () => {
  // E6 doser 7.0 s dropped 16.8 g, topped up to 18.0 g in the basket
  assert.deepEqual(doserFor(18, 16.8, 7.0).seconds, 7.5);
  const shots = [{ setting: 6.5, dose: 18, ground: 16.8, doserTime: 7.0, yield: 36, time: 30, ts: day(0) }];
  const r = recommend({ shots, rules: mazzer, now: now0, anchor: { kind: 'shot', setting: 6.5, time: 30 } });
  assert.equal(r.dose.seconds, 7.5);
  assert.equal(r.dose.lastGrams, 16.8);
});

t('doser adjustment per notch is learned from weighed drops at two settings', () => {
  // finer (lower number) drops slower: 6.5 → 2.6 g/s, 6.3 → 2.4 g/s
  const shots = [
    { setting: 6.5, dose: 18, ground: 18.2, doserTime: 7.0, yield: 36, time: 26, ts: day(0) },
    { setting: 6.3, dose: 18, ground: 16.8, doserTime: 7.0, yield: 36, time: 31, ts: day(0) },
  ];
  const r = recommend({ shots, rules: mazzer, now: now0, anchor: { kind: 'shot', setting: 6.3, time: 34 } });
  assert.equal(r.dose.perNotchSource, 'learned from your weighed drops');
  assert.ok(r.dose.perNotch > 0);           // finer needs more doser time
  assert.ok(!r.dose.unknownPerNotch);
  assert.ok(r.dose.seconds < 7.5);          // going coarser from 6.3: shorter than the 7.5 s that 16.8 g implies at 6.3
});

t('brief §3 example recorded as a step: 25 s → 29 s, 2 subdivisions finer = 2 s per subdivision', () => {
  const st = stepResponse({ setting: 6.3, time: 29 }, { setting: 6.5, time: 25 }, mazzer);
  assert.equal(st.stepsFiner, 2);
  assert.equal(st.secPerSubdivision, 2);
});

t('invalid shots are set aside with a reason, and ignored by the engine', () => {
  const run = { dose: 18, tol: 0.3, yield: 36 };
  assert.ok(/outside 18.0 ± 0.3 g/.test(checkShot({ dose: 17.2, yield: 36, setting: 6.5 }, null, run)));
  assert.ok(/more than 1 g/.test(checkShot({ dose: 18, yield: 38.5, setting: 6.5 }, null, run)));
  assert.ok(/jumped/.test(checkShot({ dose: 18, yield: 36, setting: 9.5 }, { setting: 6.5 }, run)));
  assert.equal(checkShot({ dose: 18, yield: 36, setting: 6.7 }, { setting: 6.5 }, run), null);
  // a typo shot (65 instead of 6.5) excluded: the engine still sees a single valid shot → guided step
  const shots = [{ setting: 6.5, time: 38, dose: 18, yield: 36, ts: day(0) }, { setting: 65, time: 20, dose: 18, yield: 36, ts: day(0), excluded: true }];
  const r = recommend({ shots, rules: mazzer, now: now0 });
  assert.equal(r.label, 'Insufficient data');
});

t('dose checks without an extraction still teach the grind rate', () => {
  const shots = [
    { setting: 6.5, ground: 18.0, doserTime: 7.0, ts: day(0) },                       // dose check only
    { setting: 6.3, ground: 17.0, doserTime: 7.0, ts: day(0) },                       // dose check only
    { setting: 6.5, time: 30, dose: 18, ground: 18.0, doserTime: 7.0, yield: 36, ts: day(0) },
    { setting: 6.3, time: 34, dose: 18, ground: 17.0, doserTime: 7.0, yield: 36, ts: day(0) },
  ];
  const r = recommend({ shots, rules: mazzer, now: now0, anchor: { kind: 'shot', setting: 6.3, time: 34 } });
  assert.equal(r.dose.drops.n, 4);
});

t('insights separate temperature and humidity', () => {
  const ins = insights({ shots: prior, rules: mythos });
  assert.ok(ins.effects.some(e => e.label.startsWith('Room temperature')));
  assert.ok(ins.effects.some(e => e.label.startsWith('Humidity')));
});

t('membership', () => {
  assert.deepEqual(reconcileGrinders('pro', [{ id: 'a' }, { id: 'b' }]), { mustChoose: true, restore: [] });
  assert.deepEqual(reconcileGrinders('business', [{ id: 'a' }, { id: 'b', archived: true }]), { mustChoose: false, restore: ['b'] });
  assert.equal(usageText('free', [{ id: 'a' }], Array.from({ length: 12 }, (_, i) => ({ id: 's' + i }))), 'Shots used: 12 / 20');
  assert.equal(usageText('free', [{ id: 'a' }], [{ id: 'x', sample: true }, { id: 'y' }]), 'Shots used: 1 / 20');
});

t('doser time follows the grinder\'s timer steps', () => {
  // 18.1 g on 9.0 s: exact correction is 8.95 s
  assert.equal(doserFor(18, 18.1, 9.0, { doserStep: 0.1 }).seconds, 9.0);   // 0.1 s timer: can't get closer
  assert.equal(doserFor(18, 18.1, 9.0, { doserStep: 0.01 }).seconds, 8.95); // 0.01 s timer: registers the change
  assert.equal(doserFor(18, 18.4, 9.0, { doserStep: 0.1 }).seconds, 8.8);   // bigger miss corrects in 0.1 s steps
  assert.equal(doserStepOf(rulesFor({ model: 'Mythos One' })), 0.1);
  assert.equal(roundDoser(8.954, { doserStep: 0.01 }), 8.95);
  const shots = [{ setting: 6.5, time: 35, dose: 18, ground: 18.1, doserTime: 9, yield: 36, ts: day(0) }];
  const r = recommend({ shots, rules: { ...mazzer, doserStep: 0.01 }, now: now0, anchor: { kind: 'shot', setting: 6.5, time: 35 } });
  assert.equal(r.dose.seconds, 8.95);
});

t('a long shot always goes coarser and a short shot finer, even when noisy shots disagree', () => {
  // Mazzer: finer = lower number. These noisy shots wrongly suggest lower number = faster.
  const noisy = [
    { setting: 6.5, time: 30, dose: 18, yield: 36, ts: day(0) },
    { setting: 6.3, time: 27, dose: 18, yield: 36, ts: day(0) },
    { setting: 6.4, time: 36, dose: 18, yield: 36, ts: day(0) },
  ];
  const long = recommend({ shots: noisy, rules: mazzer, now: now0, anchor: { kind: 'shot', setting: 6.4, time: 36 } });
  assert.ok(long.dial.value > 64 - 1e-9 || long.dial.entry > 6.4, 'long shot must move to a higher (coarser) number');
  assert.ok(/coarser/.test(long.dial.moveShort));
  const short = recommend({ shots: noisy, rules: mazzer, now: now0, anchor: { kind: 'shot', setting: 6.4, time: 24 } });
  assert.ok(Number(short.dial.entry) < 6.4 && /finer/.test(short.dial.moveShort));
  // a well-behaved grinder still goes coarser on a long shot
  const good = [
    { setting: 6.5, time: 30, dose: 18, yield: 36, ts: day(0) },
    { setting: 6.3, time: 34, dose: 18, yield: 36, ts: day(0) },
    { setting: 6.1, time: 38, dose: 18, yield: 36, ts: day(0) },
  ];
  const g = recommend({ shots: good, rules: mazzer, now: now0, anchor: { kind: 'shot', setting: 6.1, time: 38 } });
  assert.ok(Number(g.dial.entry) > 6.1 && /coarser/.test(g.dial.moveShort));
});

// ---- micro-adjustments and evidence-based room effects ----
const noise = [0.2, -0.2, 0.1, -0.1, 0, 0.15, -0.15, 0.05, -0.05, 0.1, -0.1, 0];
const roomShots = effectPerC => {
  const out = []; let i = 0;
  for (const T of [18, 19, 20, 21, 22, 23, 24]) for (const sgt of [6.3, 6.5, 6.7]) {
    out.push({ setting: sgt, roomTemp: T, humidity: 55, dose: 18, yield: 36, ts: day(0),
      time: +(30 + (6.5 - sgt) * 25 + effectPerC * (T - 20) + noise[i++ % noise.length]).toFixed(2) });
  }
  return out;
};
const calR = { setting: 6.5, time: 30, dose: 18, yield: 36, roomTemp: 20, humidity: 55, ts: day(0) };

t('room change the shots show has no real effect: no adjustment required', () => {
  const r = recommend({ shots: roomShots(0), rules: { ...mazzer, minStep: 0.1 }, now: { ...now0, roomTemp: 21, humidity: 55 }, anchor: { kind: 'calibration', cal: calR, current: 6.5 } });
  assert.equal(r.dial.moveShort, 'hold');
  assert.ok(r.uncertain.some(x => x.startsWith('Room temperature'))); // used, but flagged: no consistent effect yet
  assert.equal(r.micro, false);
});

t('consistent room effect + stepless grinder: smallest justified micro-adjustment', () => {
  // the data shows +1 °C runs 1 s faster here; 20 → 22 °C puts the shot at 28 s
  const r = recommend({ shots: roomShots(-1), rules: { ...mazzer, minStep: 0.1 }, now: { ...now0, roomTemp: 22, humidity: 55 }, anchor: { kind: 'calibration', cal: calR, current: 6.5 } });
  assert.equal(r.micro, true);
  assert.ok(/finer/.test(r.dial.moveShort));                 // warmer ran faster, so finer
  const e = Number(r.dial.entry);                              // 2 s ÷ 25 s per number ≈ 0.08 → about 6.42, not a whole subdivision
  assert.ok(e >= 6.41 && e <= 6.44, `got ${r.dial.entry}`);
  assert.ok(Math.abs(r.predictedTime - 30) < 0.5);
});

t('same room effect, but the grinder only steps in whole subdivisions: leave it', () => {
  // one subdivision = 2.5 s here, more than the 2 s drift, so moving would overshoot: no adjustment
  const r = recommend({ shots: roomShots(-1), rules: { ...mazzer, minStep: 1 }, now: { ...now0, roomTemp: 22, humidity: 55 }, anchor: { kind: 'calibration', cal: calR, current: 6.5 } });
  assert.equal(r.dial.moveShort, 'hold');
});

t('stepless settings read and write to 0.01', () => {
  assert.equal(toEntry(fromDial(6.52, 10), 10), '6.52');
  assert.equal(fmtDial(fromDial(6.52, 10), 10), '6.52');
  assert.equal(fmtDial(fromDial(6.55, 10), 10), '6.5½');      // quarter steps keep their usual look
});

t('professional: room readings count from the first shots, flagged while evidence is thin', () => {
  // only 4 shots (under the 5 needed), but they show warmer = faster
  const few = [
    { setting: 6.5, roomTemp: 19, humidity: 55, time: 31.0 }, { setting: 6.3, roomTemp: 20, humidity: 55, time: 35.0 },
    { setting: 6.7, roomTemp: 20, humidity: 55, time: 25.0 }, { setting: 6.5, roomTemp: 22, humidity: 55, time: 28.1 },
  ].map(x => ({ ...x, dose: 18, yield: 36, ts: day(0) }));
  const r = recommend({ shots: few, rules: mazzer, now: { ...now0, roomTemp: 24, humidity: 55 }, anchor: { kind: 'calibration', cal: calR, current: 6.5 } });
  assert.ok(r.ifUnchanged < 30, `room taken into account: expected faster than 30 s, got ${r.ifUnchanged}`);
  assert.ok(r.uncertain.some(x => x.startsWith('Room temperature')));
  assert.equal(r.tier, 'provisional');
  assert.equal(r.env.roomTemp.measured, false);
});

t('5 shots across 3 °C (3 to dial in + 2 to confirm) are enough to call the room effect measured', () => {
  const five = [
    { setting: 6.5, roomTemp: 19, humidity: 55, time: 31.0 }, { setting: 6.3, roomTemp: 20, humidity: 55, time: 35.0 },
    { setting: 6.7, roomTemp: 20, humidity: 55, time: 25.0 }, { setting: 6.5, roomTemp: 21, humidity: 55, time: 29.0 },
    { setting: 6.5, roomTemp: 22, humidity: 55, time: 28.0 },
  ].map(x => ({ ...x, dose: 18, yield: 36, ts: day(0) }));
  const r = recommend({ shots: five, rules: mazzer, now: { ...now0, roomTemp: 24, humidity: 55 }, anchor: { kind: 'calibration', cal: calR, current: 6.5 } });
  assert.equal(r.env.roomTemp.measured, true);
  assert.ok(!r.uncertain.some(x => x.startsWith('Room temperature')));
  assert.ok(r.ifUnchanged < 28.5, `got ${r.ifUnchanged}`);   // 4 °C warmer ≈ 4 s faster on this grinder
});

t('home barista (no gauge): room readings are not used', () => {
  const r = recommend({ shots: roomShots(-1), rules: mazzer, gauge: false, now: { ...now0, roomTemp: 24, humidity: 55 }, anchor: { kind: 'calibration', cal: calR, current: 6.5 } });
  assert.ok(!r.dial.breakdown.some(b => b.label.startsWith('Room')));
  assert.equal(r.dial.moveShort, 'hold');
});

t('doser: what each second is worth in grams is learned against temperature and humidity', () => {
  // same setting; each +1 °C the grinder drops 0.05 g/s more (humidity steady)
  const drops = [18, 19, 20, 21, 22, 23, 24].map(T => ({ setting: 6.5, roomTemp: T, humidity: 55, doserTime: 7, ground: +(7 * (18 / 7 + 0.05 * (T - 20))).toFixed(2), ts: day(0) }));
  const rr = roomRate(drops.map(d => ({ ...d, setting: fromDial(d.setting, 10) })));
  assert.ok(Math.abs(rr.perC - 0.05) < 0.01, `perC ${rr.perC}`);
  const shots = [...drops, { setting: 6.5, time: 30, dose: 18, ground: 18, doserTime: 7, roomTemp: 20, humidity: 55, yield: 36, ts: day(0) }];
  const r = recommend({ shots, rules: { ...mazzer, doserStep: 0.01 }, now: { ...now0, roomTemp: 24, humidity: 55 }, anchor: { kind: 'shot', setting: 6.5, time: 30 } });
  // at 24 °C the grinder drops 18/7 + 0.2 ≈ 2.77 g/s, so 18 g needs about 6.5 s, not 7.0
  assert.ok(Math.abs(r.dose.seconds - 6.49) <= 0.05, `doser ${r.dose.seconds}`);
  assert.ok(r.dose.roomSec < 0);
});

t('workload button: 5 shots with 2+ quiet and 2+ busy count as measured, and busier burrs are corrected for', () => {
  const compak = rulesFor({ model: 'Compak E6' }); // fan-cooled, finer = lower number
  // busy burrs warm up and run faster: 2 s quicker at "busy" at the same setting
  const shots = [
    { setting: 6.5, workload: 0, time: 30.0 }, { setting: 6.3, workload: 0, time: 35.0 }, { setting: 6.5, workload: 2, time: 28.0 },
    { setting: 6.7, workload: 2, time: 23.0 }, { setting: 6.5, workload: 1, time: 29.0 },
  ].map(x => ({ ...x, dose: 18, yield: 36, ts: day(0) }));
  const r = recommend({ shots, rules: compak, gauge: false, now: { ...now0, workload: 2 }, anchor: { kind: 'calibration', cal: { ...calR, workload: 0 }, current: 6.5 } });
  assert.equal(r.env.workload.measured, true);
  assert.ok(r.ifUnchanged < 29.5, `busy should run faster, got ${r.ifUnchanged}`);
  const few = recommend({ shots: shots.slice(0, 4), rules: compak, gauge: false, now: { ...now0, workload: 2 }, anchor: { kind: 'calibration', cal: { ...calR, workload: 0 }, current: 6.5 } });
  assert.equal(few.env.workload.measured, false);
});

t('big shifts ask for a re-dial, small ones do not', () => {
  const cal = { roomTemp: 20, humidity: 50, workload: 0 };
  assert.equal(redialCheck(cal, { roomTemp: 22, humidity: 55, workload: 1 }, rulesFor({ model: 'Compak E6' })), null);
  assert.ok(/room/.test(redialCheck(cal, { roomTemp: 25 }, mazzer)));
  assert.ok(/busy/.test(redialCheck(cal, { workload: 2 }, rulesFor({ model: 'Compak E6' }))));
  assert.equal(redialCheck(cal, { workload: 2 }, mythos), null);           // temperature-controlled burrs ignore workload
  assert.equal(redialCheck({ roomTemp: null }, { roomTemp: 30 }, mazzer), null); // never compares a missing reading
});

t('warm-up: first dial-in of the day, over 10 minutes idle, or last shot out of range', () => {
  const now = Date.parse('2026-10-16T09:00:00Z');
  const at = m => new Date(now - m * 60000).toISOString();
  const shot = (m, time) => ({ setting: 6.5, time, targetLo: 28, targetHi: 32, ts: at(m) });
  assert.equal(warmUpReason([], null, now).kind, 'first');                                   // nothing logged
  assert.equal(warmUpReason([{ ...shot(0, 30), ts: '2026-10-15T17:00:00Z' }], null, now).kind, 'first'); // only yesterday
  assert.equal(warmUpReason([shot(25, 30)], null, now).kind, 'idle');                         // 25 min since last shot
  assert.equal(warmUpReason([shot(5, 35)], null, now).kind, 'out');                            // last shot too slow
  assert.equal(warmUpReason([shot(5, 30)], null, now), null);                                  // recent and in range
  assert.equal(warmUpReason([shot(5, 35)], at(2), now), null);                                 // warmed up since that shot
  assert.equal(warmUpReason([shot(25, 30)], at(3), now), null);                                // warmed up 3 min ago
  assert.equal(warmUpReason([{ kind: 'dose', ground: 18, ts: at(1) }, shot(25, 30)], null, now).kind, 'idle'); // dose checks aren't shots
});

console.log(`All ${passed} engine tests passed.`);
