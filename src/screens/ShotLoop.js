import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Card, Label, Segmented, Note, Button } from '../components/ui';
import { ShotsChart, Stepper, Pill } from '../components/visuals';
import Recommendation from '../components/Recommendation';
import { recommend, rulesFor, dialMarks, checkDialEntry, fmt, num, doserFor } from '../engine';

const LOADS = [{ value: 0, label: 'Quiet' }, { value: 1, label: 'Steady' }, { value: 2, label: 'Busy' }];
const TASTES = [{ value: 'sour', label: 'Sour' }, { value: 'balanced', label: 'Balanced' }, { value: 'bitter', label: 'Bitter' }];
const str = v => (v == null || v === '' ? '' : String(v));
const diffText = d => { const r = Math.round(d * 10) / 10; return r > 0 ? `+${r.toFixed(1)}` : r.toFixed(1); };

/**
 * One calibration run, shot by shot (used by both modes):
 *   pull a shot → record time (and dose, room, taste) → the app gives the next grind setting and
 *   doser time → repeat until the shot lands in the target band → Save calibration.
 * The dose stays fixed for the whole run. Changing it starts a new run.
 */
export default function ShotLoop({ grinder, coffee, run, runShots, coffeeShots, grinderShots, first, blocked,
  onRecord, onSave, onRestart, onStop, onChangeRules, onSeePlans }) {
  const rules = rulesFor(grinder);
  const M = dialMarks(rules);
  const gauge = grinder.gauge === true;
  const last = runShots[runShots.length - 1];
  const mid = (run.tLo + run.tHi) / 2;
  const inBand = !!last && last.time >= run.tLo && last.time <= run.tHi;

  const r = useMemo(() => (last ? recommend({
    shots: coffeeShots, grinderShots, rules, gauge,
    now: { target: mid, targetLo: run.tLo, targetHi: run.tHi, dose: run.dose, yield: run.yield, roomTemp: last.roomTemp, humidity: last.humidity, groupTemp: last.groupTemp, workload: last.workload },
    anchor: { kind: 'shot', setting: last.setting, time: last.time },
  }) : null), [coffeeShots.length, grinderShots.length, grinder, run.id]);

  const fresh = () => {
    const recOk = r && r.status === 'ready';
    return {
      setting: recOk ? r.dial.entry : last ? str(last.setting) : str(first ? first.setting : grinder.lastSetting),
      doserTime: recOk && r.dose.seconds != null ? r.dose.seconds.toFixed(1) : last ? str(last.doserTime) : str(first ? first.doserTime : ''),
      dose: str(run.dose), dropOk: true, ground: '', diffDraft: null, topped: true, yieldOut: str(run.yield), time: '', taste: '',
      roomTemp: str(last ? last.roomTemp : first ? first.roomTemp : ''), humidity: str(last ? last.humidity : first ? first.humidity : ''),
      workload: last ? (last.workload ?? 1) : first && first.workload != null ? first.workload : 1,
    };
  };
  const [f, setF] = useState(fresh);
  const [err, setErr] = useState('');
  const [refine, setRefine] = useState(false);
  useEffect(() => { setF(fresh()); setErr(''); setRefine(false); }, [runShots.length, run.id]);
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  const timeRef = useRef(null);
  // − / + on extraction time: starts from the middle of the target band when empty
  const bumpTime = d => setF(p => {
    const n = num(p.time);
    return { ...p, time: String(Math.max(0, +((n === null ? mid : n) + d).toFixed(1))) };
  });

  // what the grinder dropped vs what went in the basket
  const groundG = f.dropOk ? run.dose : num(f.ground);
  const basketG = f.dropOk || f.topped ? run.dose : groundG;
  const doseOff = basketG !== null && Math.abs(basketG - run.dose) > run.tol + 1e-9;
  const fixDoser = !f.dropOk ? doserFor(run.dose, groundG, num(f.doserTime)) : null;

  const record = () => {
    const s = num(f.setting);
    if (s === null) return setErr('Enter what the grinder reads.');
    const de = checkDialEntry(s, M); if (de) return setErr(de);
    if (!f.dropOk && groundG === null) return setErr(`Enter what the grinder dropped before any top-up.`);
    if (num(f.time) === null) return setErr('Enter the extraction time.');
    setErr('');
    // remember what the app predicted, so its accuracy can be checked later
    let recSetting = null, predTime = null;
    if (r && r.status === 'ready' && !inBand && Math.abs(num(r.dial.entry) - s) < 1e-6) { recSetting = num(r.dial.entry); predTime = Math.round(r.predictedTime * 10) / 10; }
    else if (!last && first && first.predTime != null && Math.abs(num(first.setting) - s) < 1e-6) { recSetting = num(first.setting); predTime = first.predTime; }
    onRecord({
      setting: s, doserTime: num(f.doserTime), dose: basketG, ground: groundG, toppedUp: !f.dropOk && f.topped, yield: num(f.yieldOut) ?? run.yield, time: num(f.time),
      roomTemp: gauge ? num(f.roomTemp) : null, humidity: gauge ? num(f.humidity) : null,
      workload: rules.burr === 'fan' ? Number(f.workload) : null, taste: f.taste,
      target: mid, targetLo: run.tLo, targetHi: run.tHi, recSetting, predTime, doseOff,
    });
  };

  return (
    <View style={{ gap: S.lg }}>
      <Card tone="accent">
        <Text style={st.kicker}>{run.mode === 'adjust' ? 'ADJUSTING' : 'DIALLING IN'} · {grinder.name.toUpperCase()}</Text>
        <Text style={st.coffee}>{coffee.name}</Text>
        <View style={st.facts}>
          <Fact label="DOSE" value={`${fmt(run.dose)} g`} sub="fixed" />
          <Fact label="YIELD" value={`${fmt(run.yield)} g`} />
          <Fact label="TARGET" value={`${fmt(run.tLo, 0)}–${fmt(run.tHi, 0)} s`} sub="from pump on" />
        </View>
      </Card>

      {last ? (
        <Card>
          <View style={st.rowBetween}>
            <Text style={st.h}>SHOT {runShots.length}</Text>
            <Pill tone={inBand ? 'good' : 'warn'}>{fmt(last.time)} s · {inBand ? 'in band' : last.time > run.tHi ? 'too slow' : 'too fast'}</Pill>
          </View>
          <Text style={st.small}>Dial {last.setting} · {fmt(last.dose)} g → {fmt(last.yield)} g{last.doserTime != null ? ` · doser ${fmt(last.doserTime)} s` : ''}</Text>
          {last.predTime != null ? <Text style={st.small}>Predicted {fmt(last.predTime)} s · actual {fmt(last.time)} s ({last.time - last.predTime >= 0 ? '+' : '−'}{fmt(Math.abs(last.time - last.predTime))} s)</Text> : null}
          {last.ground != null && Math.abs(last.ground - run.dose) > 1e-6 ? (
            <Note>Grinder dropped {fmt(last.ground)} g on {fmt(last.doserTime)} s{last.toppedUp ? `, topped up to ${fmt(run.dose)} g in the basket` : ''}. The doser time below is worked out to drop {fmt(run.dose)} g next time.</Note>
          ) : null}
          {last.doseOff ? <Note tone="warn">The basket had {fmt(last.dose)} g, outside {fmt(run.dose)} ± {fmt(run.tol)} g, so part of the time change comes from the dose, not the grind.</Note> : null}

          {inBand && !refine ? (
            <View style={{ gap: S.md }}>
              <Note>In your target band. Taste it: extraction time is the calibration guide, taste decides the recipe.{last.taste === 'sour' ? ' It tasted sour, so you might aim a little longer.' : last.taste === 'bitter' ? ' It tasted bitter, so you might aim a little shorter.' : ''}</Note>
              <Button title="Save calibration" onPress={() => onSave(r && r.status === 'ready' ? r.confidence : 'Low')} />
              <Button title="Keep refining" kind="secondary" onPress={() => setRefine(true)} />
            </View>
          ) : r ? (
            <Recommendation r={r} M={M} grinder={grinder} onChangeRules={onChangeRules} />
          ) : null}
        </Card>
      ) : null}

      {!(inBand && !refine) ? (
        <Card>
          <Text style={st.h}>{last ? `PULL SHOT ${runShots.length + 1}` : 'FIRST SHOT'}</Text>
          {!last ? (
            <View style={{ gap: 4 }}>
              {['Check the grinder\'s current setting.', `Grind and weigh ${fmt(run.dose)} g.`, 'Prepare the espresso the same way each time.',
                'Start the timer when the pump starts.', `Stop at ${fmt(run.yield)} g in the cup.`, 'Record the time below.'].map((t, i) => (
                <Text key={i} style={st.small}>{i + 1}. {t}</Text>
              ))}
            </View>
          ) : <Text style={st.small}>Set the grinder and doser to the new figures, pull the shot, then record it.</Text>}
          {blocked ? (
            <View style={{ gap: S.sm }}>
              <Note tone="warn">{blocked === 'limit' ? "You've saved 20 shots, the limit on the Free plan. Move to Pro to keep logging. It's free while we test." : 'This grinder is archived (read-only).'}</Note>
              <Button title="See plans" onPress={onSeePlans} />
            </View>
          ) : null}

          <View style={st.hero2}>
            <View style={st.bigField}>
              <Text style={st.tileLabel}>GRINDER READS</Text>
              <TextInput value={f.setting} onChangeText={set('setting')} keyboardType="decimal-pad" placeholder="6.5" placeholderTextColor={C.faint} style={st.bigInput} />
              <Text style={st.tileSub}>{M === 10 ? 'tenths' : `${M}-mark dial · 4.3 = mark 3`}</Text>
            </View>
            <View style={st.bigField}>
              <Text style={st.tileLabel}>DOSER TIME</Text>
              <TextInput value={f.doserTime} onChangeText={set('doserTime')} keyboardType="decimal-pad" placeholder="–" placeholderTextColor={C.faint} style={st.bigInput} />
              <Text style={st.tileSub}>seconds · optional</Text>
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Label>Did the grinder drop {fmt(run.dose)} g?</Label>
            <Segmented options={[{ value: true, label: `Yes, ${fmt(run.dose)} g` }, { value: false, label: 'No' }]} value={f.dropOk}
              onChange={v => setF(p => ({ ...p, dropOk: v, diffDraft: null, ground: v ? '' : (p.ground || str(run.dose)) }))} />
          </View>
          {!f.dropOk ? (
            <View style={st.dropBox}>
              <View style={st.steppers}>
                <Stepper label="GRINDER DROPPED" unit="g · weigh before any top-up" value={f.ground} onChange={v => setF(p => ({ ...p, ground: v, diffDraft: null }))} step={0.1} />
                <Stepper label="OVER (+) / UNDER (−)" unit={groundG === null ? `g vs ${fmt(run.dose)} g` : groundG > run.dose ? `g over ${fmt(run.dose)} g` : groundG < run.dose ? `g under ${fmt(run.dose)} g` : `g · spot on`}
                  value={f.diffDraft != null ? (/^\d/.test(f.diffDraft) && num(f.diffDraft) > 0 ? '+' + f.diffDraft : f.diffDraft) : groundG === null ? '' : diffText(groundG - run.dose)}
                  onChange={v => { const d = num(v); setF(p => ({ ...p, diffDraft: v, ground: d === null ? p.ground : String(+(run.dose + d).toFixed(1)) })); }} step={0.1} />
              </View>
              <View style={{ gap: 6 }}>
                <Label>Did you top up or take out to {fmt(run.dose)} g?</Label>
                <Segmented options={[{ value: true, label: `Yes, basket ${fmt(run.dose)} g` }, { value: false, label: 'No, used as dropped' }]} value={f.topped} onChange={set('topped')} />
              </View>
              {fixDoser ? (
                <View style={st.fixBox}>
                  <Text style={st.tileLabel}>SET THE DOSER TO</Text>
                  <Text style={st.fixBig}>{fmt(fixDoser.seconds)} s</Text>
                  <Text style={st.tileSub}>{fmt(groundG)} g in {fmt(num(f.doserTime))} s = {fmt(fixDoser.rate, 2)} g per second · {fixDoser.seconds - num(f.doserTime) >= 0 ? '+' : '−'}{fmt(Math.abs(fixDoser.seconds - num(f.doserTime)))} s to drop {fmt(run.dose)} g</Text>
                </View>
              ) : (
                <Text style={st.small}>Enter the doser time above and the app works out the new setting.</Text>
              )}
              {doseOff ? <Text style={[st.small, { color: C.warn }]}>The basket is outside {fmt(run.dose)} ± {fmt(run.tol)} g, so this shot's time won't be a clean grind reading. Topping up to {fmt(run.dose)} g keeps it clean.</Text> : null}
            </View>
          ) : null}
          <View style={st.steppers}>
            <Stepper label="YIELD IN CUP" unit="g" value={f.yieldOut} onChange={set('yieldOut')} step={0.1} />
          </View>

          {gauge ? (
            <View style={st.steppers}>
              <Stepper label="ROOM" unit="°C" value={f.roomTemp} onChange={set('roomTemp')} step={0.5} />
              <Stepper label="HUMIDITY" unit="% RH" value={f.humidity} onChange={set('humidity')} step={1} decimals={0} />
            </View>
          ) : null}
          {rules.burr === 'fan' ? (
            <View style={{ gap: 6 }}>
              <Label>Workload now</Label>
              <Segmented options={LOADS} value={Number(f.workload)} onChange={set('workload')} />
            </View>
          ) : null}

          <Pressable style={st.timeBox} onPress={() => timeRef.current && timeRef.current.focus()} accessibilityLabel="Extraction time in seconds">
            <Text style={st.tileLabel}>EXTRACTION TIME (SECONDS)</Text>
            <View style={st.timeRow}>
              <Pressable onPress={() => bumpTime(-0.5)} style={st.timeBtn} hitSlop={6} accessibilityLabel="Half a second less">
                <Text style={st.timeBtnText}>−</Text>
              </Pressable>
              <TextInput ref={timeRef} value={f.time} onChangeText={set('time')} keyboardType="decimal-pad" inputMode="decimal"
                placeholder={`${fmt(run.tLo, 0)}–${fmt(run.tHi, 0)}`} placeholderTextColor={C.faint} style={st.timeInput}
                returnKeyType="done" selectTextOnFocus />
              <Pressable onPress={() => bumpTime(0.5)} style={st.timeBtn} hitSlop={6} accessibilityLabel="Half a second more">
                <Text style={st.timeBtnText}>+</Text>
              </Pressable>
            </View>
            <Text style={st.tileSub}>Tap the number to type it, or use − / +</Text>
          </Pressable>
          <View style={{ gap: 6 }}>
            <Label>How did it taste? (optional)</Label>
            <View style={st.tastes}>
              {TASTES.map(t => {
                const on = f.taste === t.value;
                const col = t.value === 'sour' ? C.warn : t.value === 'bitter' ? C.bad : C.good;
                return (
                  <Pressable key={t.value} onPress={() => set('taste')(on ? '' : t.value)} style={[st.taste, on && { borderColor: col, backgroundColor: col + '22' }]}>
                    <Text style={[st.tasteText, on && { color: col }]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Button title="Record shot" onPress={record} disabled={!!blocked} />
          {err ? <Text style={st.err}>{err}</Text> : null}
        </Card>
      ) : null}

      {runShots.length >= 2 ? (
        <Card>
          <Text style={st.h}>THIS RUN</Text>
          {runShots.map((s, i) => (
            <Text key={s.id} style={st.small}>{i + 1}. Dial {s.setting} → {fmt(s.time)} s{s.predTime != null ? ` (predicted ${fmt(s.predTime)} s)` : ''}</Text>
          ))}
          <ShotsChart shots={runShots} target={mid} lo={run.tLo} hi={run.tHi} />
        </Card>
      ) : null}

      <View style={{ gap: S.sm }}>
        <Button title={`Change dose (starts calibration again)`} kind="secondary" onPress={onRestart} />
        <Button title="Stop for now" kind="link" onPress={onStop} />
      </View>
    </View>
  );
}

function Fact({ label, value, sub }) {
  return (
    <View style={st.fact}>
      <Text style={st.tileLabel}>{label}</Text>
      <Text style={st.factVal}>{value}</Text>
      {sub ? <Text style={st.tileSub}>{sub}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  h: { color: C.ink, fontSize: 15, fontWeight: '800', letterSpacing: 0.8 },
  kicker: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  coffee: { color: C.white, fontSize: 22, fontWeight: '800' },
  small: { color: C.muted, fontSize: 13 },
  err: { color: C.bad },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  facts: { flexDirection: 'row', gap: S.sm },
  fact: { flex: 1, backgroundColor: C.surface, borderRadius: R.md, padding: S.sm, alignItems: 'center' },
  factVal: { color: C.ink, fontSize: 17, fontWeight: '700' },
  hero2: { flexDirection: 'row', gap: S.md },
  bigField: { flex: 1, backgroundColor: C.accentSoft, borderRadius: R.md, borderWidth: 1, borderColor: '#1D3B7A', padding: S.md, alignItems: 'center', gap: 4 },
  bigInput: { color: C.white, fontSize: 38, fontWeight: '800', minWidth: 90, textAlign: 'center', paddingVertical: 2 },
  inline: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  timeBox: { backgroundColor: C.accentSoft, borderRadius: R.md, borderWidth: 1, borderColor: '#1D3B7A', padding: S.lg, alignItems: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginVertical: 4 },
  timeInput: { color: C.white, fontSize: 48, fontWeight: '800', width: 170, height: 72, textAlign: 'center', padding: 0,
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: '#1D3B7A' },
  timeBtn: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  timeBtnText: { color: C.ink, fontSize: 26, fontWeight: '600', marginTop: -2 },
  unit: { color: C.muted, fontSize: 18, fontWeight: '600' },
  tastes: { flexDirection: 'row', gap: S.sm },
  dropBox: { gap: S.md, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.md, backgroundColor: C.surface2 },
  fixBox: { backgroundColor: C.accentSoft, borderRadius: R.md, borderWidth: 1, borderColor: '#1D3B7A', padding: S.md, alignItems: 'center', gap: 2 },
  fixBig: { color: C.white, fontSize: 36, fontWeight: '800' },
  taste: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingVertical: 14, alignItems: 'center', backgroundColor: C.surface2 },
  tasteText: { color: C.ink, fontWeight: '700', fontSize: 15 },
  tileLabel: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  tileSub: { color: C.muted, fontSize: 12, textAlign: 'center' },
  steppers: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
});
