// Run with: npm test   (node tests/engine.test.mjs)
// Checks the Dial In calibration engine (v2).
import { recommend, rulesFor, fromDial, fmtDial, checkDialEntry, reconcileGrinders, usageText, insights } from '../src/engine/index.js';
import assert from 'node:assert/strict';

const mazzer = rulesFor({ model: 'Mazzer' });          // 10 marks, finer = lower number, benchmarks 10 s/number, 1 number per 4 °C
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

t('first shot, grinder response unknown: conservative move, Low confidence, guidance', () => {
  // brief example: 6.5, 18 g → 36 g, 38 s against 30 s
  const shots = [{ setting: 6.5, dose: 18, yield: 36, time: 38, ts: day(0) }];
  const r = recommend({ shots, rules: mazzer, now: now0, anchor: { kind: 'shot', setting: 6.5, time: 38 } });
  assert.equal(r.status, 'ready');
  assert.equal(r.source, 'guidance');
  assert.equal(r.confidence, 'Low');
  assert.equal(r.dial.conservative, true);
  assert.ok(/coarser/.test(r.dial.moveShort));
  // benchmark says 0.8 of a number; conservative step is half of that
  assert.equal(r.dial.text, '6.9');
});

t('second shot measures the grind response (brief: 6.5 → 38 s, 6.7 → 33 s)', () => {
  const shots = [
    { setting: 6.5, dose: 18, yield: 36, time: 38, ts: day(0) },
    { setting: 6.7, dose: 18, yield: 36, time: 33, ts: day(0) },
  ];
  const r = recommend({ shots, rules: mazzer, now: now0, anchor: { kind: 'shot', setting: 6.7, time: 33 } });
  assert.equal(r.model.slopeSource, 'measured');
  assert.equal(Math.round(r.secondsPerNotch), 25);   // 0.2 of a number took 5 s off
  assert.equal(r.dial.text, '6.8¼');
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

t('temperature changes, humidity does not: 1 number per 4 °C benchmark', () => {
  const r = recommend({ shots: prior, rules: mazzer, now: { ...now0, roomTemp: 23, humidity: 50 }, anchor: { kind: 'calibration', cal, current: 4.0 } });
  const row = envRow(r, 'Room temperature');
  assert.ok(row && /finer/.test(row.move));
  assert.equal(row.move, '7½ marks finer');       // 3 °C ÷ 4 °C per number = ¾ number
  assert.equal(row.status, 'benchmark');
  assert.ok(!envRow(r, 'Humidity'));
  assert.equal(r.confidence, 'Low');
  assert.equal(r.enoughHistory, false);
});

t('humidity changes, temperature does not: 12 % RH = 1 °C benchmark', () => {
  const r = recommend({ shots: prior, rules: mazzer, now: { ...now0, roomTemp: 20, humidity: 74 }, anchor: { kind: 'calibration', cal, current: 4.0 } });
  assert.ok(!envRow(r, 'Room temperature'));
  assert.equal(envRow(r, 'Humidity').move, '5 marks finer'); // +24 % RH ≈ 2 °C ≈ ½ number
});

t('both change: the two effects add', () => {
  const r = recommend({ shots: prior, rules: mazzer, now: { ...now0, roomTemp: 23, humidity: 74 }, anchor: { kind: 'calibration', cal, current: 4.0 } });
  assert.ok(envRow(r, 'Room temperature') && envRow(r, 'Humidity'));
});

t('a missing reading is never filled in', () => {
  const noHum = prior.map(s => ({ ...s, humidity: undefined }));
  const r = recommend({ shots: noHum, rules: mazzer, now: { ...now0, roomTemp: 20, humidity: 80 }, anchor: { kind: 'calibration', cal: { ...cal, humidity: undefined }, current: 4.0 } });
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
