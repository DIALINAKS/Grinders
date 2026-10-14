/**
 * App data helpers: pure functions on the saved state, no React. See store.js for the shape.
 */
import { sampleShots, num, ok } from './engine';

export const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const DEFAULTS = { dose: 18, tol: 0.3, yield: 36, tLo: 28, tHi: 32 };

/** Band for a shot or calibration: its own band, else target ± 1 s, else the default. */
export function bandOf(x) {
  if (x && ok(x.targetLo) && ok(x.targetHi)) return [x.targetLo, x.targetHi];
  if (x && ok(x.target)) return [x.target - 1, x.target + 1];
  return [DEFAULTS.tLo, DEFAULTS.tHi];
}
const inBand = s => { const [lo, hi] = bandOf(s); return ok(s.time) && s.time >= lo && s.time <= hi; };
const byTs = (a, b) => (a.ts < b.ts ? -1 : 1);

/** Upgrade saved data from the first testing build (coffee = free text on each shot). */
export function migrate(st) {
  if (st.v >= 2) return st;
  const coffees = [], idByName = {};
  st.shots.forEach(s => {
    const name = (s.bean || '').trim();
    if (!name || idByName[name.toLowerCase()]) return;
    const id = newId('c');
    idByName[name.toLowerCase()] = id;
    coffees.push({ id, name, roaster: '', origin: '', roastDate: s.roast || '', archived: false, sample: !!s.sample, createdAt: s.ts });
  });
  const shots = st.shots.map(s => ({ ...s, coffeeId: idByName[(s.bean || '').trim().toLowerCase()] || null }));
  const grinders = st.grinders.map(g => ({
    ...g,
    gauge: shots.some(s => s.grinderId === g.id && ok(num(s.roomTemp))) ? true : null,
    lastSetting: (shots.filter(s => s.grinderId === g.id).sort(byTs).slice(-1)[0] || {}).setting ?? null,
  }));
  // the latest shot inside its target band becomes the saved calibration for that grinder + coffee
  const calibrations = [];
  const pairs = new Set(shots.filter(s => s.coffeeId).map(s => s.grinderId + '|' + s.coffeeId));
  pairs.forEach(p => {
    const [grinderId, coffeeId] = p.split('|');
    const list = shots.filter(s => s.grinderId === grinderId && s.coffeeId === coffeeId).sort(byTs);
    const good = list.filter(inBand).slice(-1)[0];
    if (good) calibrations.push(calFromShot(good, grinderId, coffeeId, list, 'Moderate', true));
  });
  const coffee = {};
  Object.entries(st.coffee || {}).forEach(([g, name]) => { coffee[g] = idByName[String(name).toLowerCase()] || null; });
  return { ...st, v: 2, coffees, shots, grinders, calibrations, coffee, run: null };
}

function calFromShot(s, grinderId, coffeeId, history, confidence, imported) {
  const [lo, hi] = bandOf(s);
  return {
    id: newId('k'), grinderId, coffeeId, setting: s.setting, doserTime: s.doserTime ?? null, dose: s.dose, yield: s.yield,
    time: s.time, targetLo: lo, targetHi: hi, roomTemp: s.roomTemp ?? null, humidity: s.humidity ?? null, workload: s.workload ?? null,
    groupTemp: s.groupTemp ?? null, confidence, history: history.slice(-8).map(h => ({ setting: h.setting, time: h.time })),
    active: true, imported: !!imported, sample: !!s.sample, ts: s.ts,
  };
}

/** Shots for a grinder since its last recalibration (burr change, service…), oldest first. */
export function epochShots(st, grinder) {
  if (!grinder) return [];
  const from = grinder.epochStart || '';
  return st.shots.filter(s => s.grinderId === grinder.id && (!from || s.ts >= from)).sort(byTs);
}

export const coffeeById = (st, id) => st.coffees.find(c => c.id === id) || null;

/** The saved calibration for a grinder + coffee in the grinder's current epoch. */
export function activeCal(st, grinder, coffeeId) {
  if (!grinder) return null;
  const from = grinder.epochStart || '';
  return st.calibrations.filter(k => k.active && k.grinderId === grinder.id && k.coffeeId === coffeeId && (!from || k.ts >= from))
    .sort(byTs).slice(-1)[0] || null;
}

/** Coffees used on this grinder (shots or calibrations), newest first. Archived ones last. */
export function grinderCoffees(st, grinder) {
  if (!grinder) return [];
  const used = new Set([...st.shots.filter(s => s.grinderId === grinder.id).map(s => s.coffeeId),
    ...st.calibrations.filter(k => k.grinderId === grinder.id).map(k => k.coffeeId)]);
  return st.coffees.filter(c => used.has(c.id)).sort((a, b) => (a.archived - b.archived) || (a.createdAt < b.createdAt ? 1 : -1));
}

/** Save the latest shot of a run as the coffee's calibration on that grinder. */
export function saveCalibration(st, run, confidence) {
  const runShots = st.shots.filter(s => s.runId === run.id && s.time != null && !s.excluded).sort(byTs);
  const last = runShots[runShots.length - 1];
  if (!last) return st;
  const cal = calFromShot({ ...last, targetLo: run.tLo, targetHi: run.tHi }, run.grinderId, run.coffeeId, runShots, confidence, false);
  return {
    ...st,
    // the saved shot is the verified one; the others in the run stay as test shots
    shots: st.shots.map(s => (s.id === last.id ? { ...s, role: 'verified' } : s)),
    calibrations: [...st.calibrations.map(k => (k.grinderId === run.grinderId && k.coffeeId === run.coffeeId ? { ...k, active: false } : k)), cal],
    run: null,
    coffee: { ...st.coffee, [run.grinderId]: run.coffeeId },
  };
}

/** Start a fresh calibration epoch after a burr change, service or reset of the dial's zero. */
export function recalibrate(st, grinderId, reason) {
  return { ...st, grinders: st.grinders.map(g => (g.id === grinderId ? { ...g, epochStart: new Date().toISOString(), epochReason: reason } : g)),
    run: st.run && st.run.grinderId === grinderId ? null : st.run };
}

export function withSample(st) {
  const gid = 'g_sample', cid = 'c_sample';
  const shots = sampleShots(gid, cid).map(s => ({ ...s, targetLo: 27, targetHi: 29 }));
  const good = shots.filter(inBand).slice(-1)[0];
  return {
    ...st, grinderId: gid, coffee: { ...st.coffee, [gid]: cid },
    grinders: [...st.grinders.filter(g => g.id !== gid), { id: gid, name: 'Mythos One (sample)', model: 'Mythos One', rules: {}, gauge: true, sample: true, lastSetting: shots[shots.length - 1].setting, createdAt: new Date().toISOString() }],
    coffees: [...st.coffees.filter(c => c.id !== cid), { id: cid, name: 'Ethiopia Guji', roaster: 'Barista Life', origin: 'Ethiopia', roastDate: '', sample: true, archived: false, createdAt: new Date().toISOString() }],
    calibrations: [...st.calibrations.filter(k => !k.sample), calFromShot(good, gid, cid, shots, 'Moderate', false)],
    shots: [...st.shots.filter(x => !x.sample), ...shots],
  };
}

export function withoutSample(st) {
  return {
    ...st, grinders: st.grinders.filter(g => !g.sample), shots: st.shots.filter(x => !x.sample),
    coffees: st.coffees.filter(c => !c.sample), calibrations: st.calibrations.filter(k => !k.sample),
    run: st.run && st.run.grinderId === 'g_sample' ? null : st.run,
    grinderId: st.grinderId === 'g_sample' ? null : st.grinderId,
  };
}
