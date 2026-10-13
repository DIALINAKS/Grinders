// Run with: node tests/engine.test.mjs
// Checks the engine against results produced by the web prototype for the same shots.
import { recommend, rulesFor, fromDial, fmtDial, checkDialEntry, reconcileGrinders, usageText } from '../src/engine/index.js';
import assert from 'node:assert/strict';

const mythos = rulesFor({ model: 'Mythos One' });
const e6 = rulesFor({ model: 'Compak E6' });
const base = { groupTemp: 93, yield: 36 };

export const SCENARIOS = [
  {
    name: 'Mythos One, warmer and more humid room',
    rules: mythos, model: 'Mythos One',
    shots: [
      { setting: 4.3, doserTime: 6.0, dose: 17.6, yield: 36, time: 26,   roomTemp: 20, humidity: 50, groupTemp: 93 },
      { setting: 4.2, doserTime: 6.0, dose: 17.6, yield: 36, time: 27.5, roomTemp: 20, humidity: 50, groupTemp: 93 },
      { setting: 4.1, doserTime: 6.2, dose: 18,   yield: 36, time: 29,   roomTemp: 21, humidity: 55, groupTemp: 93 },
    ],
    now: { target: 28, dose: 18, yield: 36, roomTemp: 23, humidity: 58, groupTemp: 93, workload: 1 },
  },
  {
    name: 'Compak E6, getting busy',
    rules: e6, model: 'Compak E6',
    shots: [
      { setting: 5.0, doserTime: 8.0, dose: 18, yield: 36, time: 27, roomTemp: 19, humidity: 48, groupTemp: 93, workload: 0 },
      { setting: 4.8, doserTime: 8.2, dose: 18, yield: 36, time: 29, roomTemp: 20, humidity: 50, groupTemp: 93, workload: 1 },
      { setting: 4.9, doserTime: 8.1, dose: 18, yield: 36, time: 28.5, roomTemp: 21, humidity: 52, groupTemp: 93, workload: 1 },
    ],
    now: { target: 28, dose: 18, yield: 36, roomTemp: 22, humidity: 55, groupTemp: 93, workload: 2 },
  },
];

if (process.argv[1] && process.argv[1].endsWith('engine.test.mjs')) {
  // dial notation
  assert.equal(fromDial(4.3, 6), 4.5);
  assert.equal(fmtDial(fromDial(4.225, 6), 6), '4.2¼');
  assert.equal(fmtDial(fromDial(4.25, 6), 6), '4.2½');
  assert.ok(checkDialEntry(4.7, 6));
  assert.equal(checkDialEntry(4.35, 6), null);
  // known result from the web prototype (same shots, same inputs)
  const r = recommend({ shots: SCENARIOS[0].shots, rules: mythos, now: SCENARIOS[0].now });
  assert.equal(r.status, 'ready');
  assert.equal(r.dial.text, '3.4¼');
  assert.equal(r.dial.range, '1½ marks');
  assert.equal(r.dial.move, '2¾ marks finer (4.1 → 3.4¼)');
  assert.equal(r.dose.seconds, 6.2);
  assert.equal(r.dose.preset.text, 'Use preset 6.2 s');
  // known result from the web prototype: Compak E6 with workload
  const e = recommend({ shots: SCENARIOS[1].shots, rules: e6, now: SCENARIOS[1].now });
  assert.equal(e.dial.text, '4.8');
  assert.equal(e.dial.range, '3½ marks');
  assert.equal(e.dial.move, '1 mark finer (4.9 → 4.8)');
  assert.equal(e.dose.seconds, 8.1);
  assert.equal(e.dose.unknownPerNotch, true);
  // membership
  assert.deepEqual(reconcileGrinders('pro', [{ id: 'a' }, { id: 'b' }]), { mustChoose: true, restore: [] });
  assert.deepEqual(reconcileGrinders('business', [{ id: 'a' }, { id: 'b', archived: true }]), { mustChoose: false, restore: ['b'] });
  assert.equal(usageText('free', [{ id: 'a' }], Array.from({ length: 12 }, (_, i) => ({ id: 's' + i }))), 'Shots used: 12 / 20');
  // sample shots never count towards the Free limit
  assert.equal(usageText('free', [{ id: 'a' }], [{ id: 'x', sample: true }, { id: 'y' }]), 'Shots used: 1 / 20');
  for (const s of SCENARIOS) {
    const x = recommend({ shots: s.shots, rules: s.rules, now: s.now });
    console.log(`${s.name}: dial ${x.dial.text} (${x.dial.move}) · dose ${x.dose.seconds} s · ${x.dose.preset ? x.dose.preset.text : 'no presets'}`);
  }
  console.log('All engine tests passed.');
}
