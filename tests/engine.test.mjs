// Run with: npm test   (node tests/engine.test.mjs)
// Checks the Dial In calibration engine (v2).
import { doserFor, recommend, rulesFor, fromDial, fmtDial, checkDialEntry, reconcileGrinders, usageText, insights } from '../src/engine/index.js';
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
  assert.equal(r.label, 'Predicted setting');
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
  assert.equal(row.move, '7½ subdivisions finer');       // 3 °C ÷ 4 °C per number = ¾ number
  assert.equal(row.status, 'house rule');
  assert.ok(!envRow(r, 'Humidity'));
  assert.equal(r.confidence, 'Low');           // house rules never earn more than Low
  assert.equal(r.label, 'Predicted setting');
});

t('house rule on: humidity changes, temperature does not (12 % RH = 1 °C)', () => {
  const r = recommend({ shots: prior, rules: house, now: { ...now0, roomTemp: 20, humidity: 74 }, anchor: { kind: 'calibration', cal, current: 4.0 } });
  assert.ok(!envRow(r, 'Room temperature'));
  assert.equal(envRow(r, 'Humidity').move, '5 subdivisions finer'); // +24 % RH ≈ 2 °C ≈ ½ number
});

t('house rule on: both change, the two effects add', () => {
  const r = recommend({ shots: prior, rules: house, now: { ...now0, roomTemp: 23, humidity: 74 }, anchor: { kind: 'calibration', cal, current: 4.0 } });
  assert.ok(envRow(r, 'Room temperature') && envRow(r, 'Humidity'));
});

t('default (no house rules): an unmeasured room change is NOT applied, the verified setting stands', () => {
  const r = recommend({ shots: prior, rules: mazzer, now: { ...now0, roomTemp: 23, humidity: 70 }, anchor: { kind: 'calibration', cal, current: 4.0 } });
  assert.equal(r.dial.breakdown.length, 0);
  assert.equal(r.dial.moveShort, 'hold');
  assert.equal(r.label, 'Verified setting');
  assert.equal(r.enoughHistory, false);
  assert.ok(r.notApplied.some(t => t.startsWith('Room temperature')));
});

t('whole physical steps only: smallest step of 1 subdivision', () => {
  // 2.5 s per subdivision, 31 s against 29–30 s → 0.6 subdivision → rounds to 1
  const shots = [{ setting: 6.5, time: 26, dose: 18, yield: 36, ts: day(0) }, { setting: 6.3, time: 31, dose: 18, yield: 36, ts: day(0) }];
  const r = recommend({ shots, rules: mazzer, now: { target: 29.5, targetLo: 29, targetHi: 30, dose: 18, yield: 36 }, anchor: { kind: 'shot', setting: 6.3, time: 31 } });
  assert.equal(r.dial.text, '6.4');
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

console.log(`All ${passed} engine tests passed.`);
