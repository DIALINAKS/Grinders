/**
 * Local storage for the testing build.
 *
 * Everything is kept on the phone with AsyncStorage. For launch, replace load/save with a
 * hosted backend (e.g. Supabase or Firebase) tied to the user's account, so data survives
 * a new phone and Business teams can share a log. The shape below is the one described in
 * the specification (section 7) and can be moved across as-is.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'grind-dial-in/v1';

export const EMPTY = {
  tier: null,          // 'free' | 'pro' | 'business'  (testing: chosen freely, no payment)
  bill: 'month',       // 'month' | 'year', for showing prices
  grinders: [],        // { id, name, model, rules:{}, archived, createdAt }
  shots: [],           // { id, grinderId, bean, setting, doserTime, dose, yield, time, groupTemp, roomTemp, humidity, workload, taste, notes, roast, ts }
  grinderId: null,     // selected grinder
  coffee: {},          // selected coffee per grinder: { [grinderId]: 'Bean name' }
};

export async function load() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
  } catch (e) {
    return { ...EMPTY };
  }
}

export async function save(state) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* best effort */ }
}

export const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
