/**
 * Local storage for the testing build.
 *
 * Everything is kept on the phone with AsyncStorage. For launch, replace load/save with a
 * hosted backend (e.g. Supabase or Firebase) tied to the user's account, so data survives
 * a new phone and Business teams can share a log.
 *
 * Data model (v2):
 *   grinders      { id, name, model, rules, gauge (true|false|null = not asked), lastSetting,
 *                   epochStart, epochReason, archived, sample, createdAt }
 *   coffees       { id, name, roaster, origin, roastDate, producer, variety, process, roastLevel,
 *                   altitude, notes, archived, sample, createdAt }
 *   calibrations  { id, grinderId, coffeeId, setting, doserTime, dose, yield, time, targetLo, targetHi,
 *                   roomTemp, humidity, workload, confidence, history:[{setting,time}], active, ts, sample }
 *                   — a calibration belongs to ONE grinder and is never applied to another
 *   shots         { id, grinderId, coffeeId, bean, runId, mode, setting, doserTime, dose, yield, time,
 *                   target, targetLo, targetHi, groupTemp, roomTemp, humidity, workload, taste, notes,
 *                   recSetting, predTime, ts, sample }
 *   run           the calibration in progress: { id, mode, grinderId, coffeeId, dose, tol, yield,
 *                   tLo, tHi, startedAt, calId, current }
 * Room readings are null when not measured. They are never filled in.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { migrate } from './model';

const KEY = 'grind-dial-in/v1'; // kept so existing test data carries over

export const EMPTY = {
  v: 2,
  tier: null,          // 'free' | 'pro' | 'business'  (testing: chosen freely, no payment)
  bill: 'month',
  grinders: [],
  coffees: [],
  calibrations: [],
  shots: [],
  run: null,
  grinderId: null,     // selected grinder
  coffee: {},          // selected coffee per grinder: { [grinderId]: coffeeId }
};

export async function load() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const saved = JSON.parse(raw);
    return migrate({ ...EMPTY, ...saved, v: saved.v || 1 }); // data from the first build has no version
  } catch (e) {
    return { ...EMPTY };
  }
}

export async function save(state) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* best effort */ }
}

export { newId } from './model';
