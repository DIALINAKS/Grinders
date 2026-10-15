import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Card, Label, Segmented, Note, Button } from '../components/ui';
import { ShotsChart, Stepper, Pill } from '../components/visuals';
import Recommendation from '../components/Recommendation';
import { recommend, rulesFor, dialMarks, checkDialEntry, fmt, num, checkShot, stepResponse, doserFor, dropped, doserStepOf, doserDecimals, fmtDoser } from '../engine';

const LOADS = [{ value: 0, label: 'Quiet' }, { value: 1, label: 'Steady' }, { value: 2, label: 'Busy' }];
const TASTES = [{ value: 'sour', label: 'Sour' }, { value: 'balanced', label: 'Balanced' }, { value: 'bitter', label: 'Bitter' }];
const str = v => (v == null || v === '' ? '' : String(v));

/**
 * One calibration run on ONE screen:
 *   LAST SHOT  → what the previous shot did
 *   CHANGE TO  → the new grind setting and doser time ("Done, I've set it", no retyping)
 *   THIS SHOT  → enter the time, record
 * Simple mode (default) asks only for the time. Detail mode adds room readings and taste.
 * The dose stays fixed for the whole run. Changing it starts a new run.
 */
export default function ShotLoop({ grinder, coffee, run, runShots: allRunRows, coffeeShots, grinderShots, first, blocked, simple,
  onRecord, onToggleExclude, onSave, onRestart, onStop, onChangeRules, onSeePlans }) {
  const rules = rulesFor(grinder);
  const M = dialMarks(rules);
  const gauge = !simple && grinder.gauge === true;
  const fan = rules.burr === 'fan';
  const runShots = allRunRows.filter(x => num(x.time) !== null);   // extractions only
  const last = runShots[runShots.length - 1];
  const mid = (run.tLo + run.tHi) / 2;
  const inBand = !!last && !last.excluded && last.time >= run.tLo && last.time <= run.tHi;

  const r = useMemo(() => (last ? recommend({
    shots: coffeeShots, grinderShots, rules, gauge,
    now: { target: mid, targetLo: run.tLo, targetHi: run.tHi, dose: run.dose, yield: run.yield, roomTemp: last.roomTemp, humidity: last.humidity, groupTemp: last.groupTemp, workload: last.workload },
    anchor: { kind: 'shot', setting: last.setting, time: last.time },
  }) : null), [coffeeShots.length, grinderShots.length, grinder, run.id, last && last.excluded, gauge]);
  const ready = !!(r && r.status === 'ready' && last && !last.excluded);
  const dDec = doserDecimals(rules), fd = v => fmtDoser(v, rules);
  // the most recent weighed drop in this run: the doser always follows it, even with no grind recommendation yet
  const lastDrop = [...allRunRows].reverse().find(x => dropped(x) !== null && num(x.doserTime) > 0);
  const dropFix = lastDrop ? doserFor(run.dose, dropped(lastDrop), num(lastDrop.doserTime), rules) : null;

  const fresh = () => ({
    setting: ready ? r.dial.entry : last ? str(last.setting) : str(first ? first.setting : grinder.lastSetting),
    doserTime: ready && r.dose.seconds != null ? r.dose.seconds.toFixed(dDec) : dropFix ? dropFix.seconds.toFixed(dDec) : last ? str(last.doserTime) : str(first ? first.doserTime : ''),
    doseWrong: false, ground: str(run.dose), time: '', taste: '',
    roomTemp: str(last ? last.roomTemp : first ? first.roomTemp : ''), humidity: str(last ? last.humidity : first ? first.humidity : ''),
    workload: last ? (last.workload ?? 1) : first && first.workload != null ? first.workload : 1,
  });
  const [f, setF] = useState(fresh);
  const [confirmed, setConfirmed] = useState(false); // "Done, I've set it"
  const [custom, setCustom] = useState(false);       // "I set something else"
  const [why, setWhy] = useState(false);
  const [err, setErr] = useState('');
  const [refine, setRefine] = useState(false);
  const [sureRestart, setSureRestart] = useState(false);
  useEffect(() => { setF(fresh()); setErr(''); setRefine(false); setConfirmed(false); setCustom(false); setWhy(false); setSureRestart(false); }, [runShots.length, run.id]);
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  const timeRef = useRef(null);
  const bumpTime = d => setF(p => {
    const n = num(p.time);
    return { ...p, time: String(Math.max(0, +((n === null ? mid : n) + d).toFixed(1))) };
  });

  const showChange = ready && !inBand;                       // a recommendation to act on
  const showInputs = !showChange || custom;                  // first shot, no recommendation yet, or barista set something else
  const showShot = !(inBand && !refine) && (!showChange || confirmed || custom);
  const groundG = f.doseWrong ? num(f.ground) : run.dose;

  const record = () => {
    const s = num(f.setting);
    if (s === null) return setErr('Enter what the grinder reads.');
    const de = checkDialEntry(s, M); if (de) return setErr(de);
    if (f.doseWrong && groundG === null) return setErr('Enter what the dose weighed.');
    if (num(f.time) === null) return setErr('Enter the shot time.');
    // with a gauge (detail mode), the room is part of every result: it's how the app learns this grinder
    if (gauge && (num(f.roomTemp) === null || num(f.humidity) === null)) return setErr('Enter the room temperature and humidity.');
    setErr('');
    // remember what the app predicted, so its accuracy can be checked later
    let recSetting = null, predTime = null, recommended = null;
    // what the app recommended for this shot, followed or not
    if (ready && !inBand) recommended = num(r.dial.entry);
    else if (!last && first && first.recEntry != null) recommended = num(first.recEntry);
    if (ready && r.predictedTime != null && Math.abs(num(r.dial.entry) - s) < 1e-6) { recSetting = num(r.dial.entry); predTime = Math.round(r.predictedTime * 10) / 10; }
    else if (!last && first && first.predTime != null && Math.abs(num(first.setting) - s) < 1e-6) { recSetting = num(first.setting); predTime = first.predTime; }
    // a wrong drop is topped up or taken out to the run dose, so the shot stays a clean grind reading;
    // the weighed drop teaches the doser time for next time
    const shot = {
      setting: s, doserTime: num(f.doserTime), dose: run.dose, ground: groundG, toppedUp: f.doseWrong, yield: run.yield, time: num(f.time),
      roomTemp: gauge ? num(f.roomTemp) : null, humidity: gauge ? num(f.humidity) : null,
      workload: fan ? Number(f.workload) : null, taste: simple ? '' : f.taste,
      target: mid, targetLo: run.tLo, targetHi: run.tHi, recSetting, predTime, doseOff: false, role: 'test',
      recommended, followed: recommended === null ? null : Math.abs(recommended - s) < 1e-6,
    };
    const prevValid = [...runShots].reverse().find(x => !x.excluded);
    Object.assign(shot, stepResponse(shot, prevValid, rules) || {});
    const whyOut = checkShot(shot, last, run);
    if (whyOut) { shot.excluded = true; shot.excludedWhy = whyOut; }
    onRecord(shot);
  };

  const verdict = s => (s.excluded ? 'set aside' : s.time > run.tHi ? 'too slow' : s.time < run.tLo ? 'too fast' : 'in range');

  return (
    <View style={{ gap: S.md }}>
      {/* who / what / target, one line */}
      <View style={st.top}>
        <Text style={st.coffee}>{coffee.name}</Text>
        <Text style={st.topSub}>{grinder.name} · {fmt(run.dose)} g → {fmt(run.yield)} g · {fmt(run.tLo, 0)}–{fmt(run.tHi, 0)} s</Text>
      </View>

      {/* 1 · LAST SHOT */}
      {last ? (
        <Card>
          <View style={st.rowBetween}>
            <Text style={st.h}>LAST SHOT</Text>
            <Pill tone={inBand ? 'good' : 'warn'}>{fmt(last.time)} s · {verdict(last)}</Pill>
          </View>
          <View style={st.trio}>
            <Mini label="GRINDER" value={str(last.setting)} />
            <Mini label="DOSER" value={last.doserTime != null ? `${fd(last.doserTime)} s` : '–'} />
            <Mini label="TIME" value={`${fmt(last.time)} s`} />
          </View>
          {last.excluded ? (
            <View style={{ gap: S.sm }}>
              <Note tone="warn">{`Not used: ${last.excludedWhy}. Pull it again on the same setting.`}</Note>
              <Button title="Use it anyway" kind="secondary" onPress={() => onToggleExclude(last.id)} />
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* in range: save */}
      {inBand && !refine ? (
        <Card tone="accent">
          <Text style={st.h}>IN RANGE · TASTE IT</Text>
          <Text style={st.small}>Happy with the taste? Save it and Dial In remembers these settings.</Text>
          <Button title="Save calibration" onPress={() => onSave(ready ? r.confidence : 'Low')} />
          <Button title="Keep refining" kind="secondary" onPress={() => setRefine(true)} />
        </Card>
      ) : null}

      {/* 2 · CHANGE TO */}
      {showChange && !(inBand && !refine) ? (
        <Card tone="accent">
          <Text style={st.h}>CHANGE TO</Text>
          <View style={st.duo}>
            <Big label="GRINDER" value={r.dial.text} sub={r.dial.moveShort === 'hold' ? 'no change' : r.dial.moveShort} />
            <Big label="DOSER" value={r.dose.seconds != null ? `${fd(r.dose.seconds)} s` : '–'}
              sub={r.dose.seconds == null ? 'enter it below' : r.dose.change ? `${r.dose.change > 0 ? '+' : '−'}${fd(Math.abs(r.dose.change))} s` : 'no change'} />
          </View>
          {!confirmed && !custom ? (
            <>
              <Button title="Done, I've set it" onPress={() => setConfirmed(true)} />
              <Button title="I set something else" kind="link" onPress={() => setCustom(true)} />
            </>
          ) : (
            <Pressable onPress={() => { setConfirmed(false); setCustom(false); setF(fresh()); }} hitSlop={6}>
              <Text style={st.done}>{custom ? 'Using your own settings below · undo' : '✓ Set · undo'}</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setWhy(!why)} hitSlop={6}><Text style={st.why}>{why ? '▾ Hide why' : '▸ Why?'}</Text></Pressable>
          {why ? <Recommendation r={r} M={M} grinder={grinder} onChangeRules={onChangeRules} /> : null}
        </Card>
      ) : last && r && !ready && !last.excluded && !inBand ? (
        <Recommendation r={r} M={M} grinder={grinder} onChangeRules={onChangeRules} />
      ) : null}

      {/* 3 · THIS SHOT */}
      {showShot ? (
        <Card>
          <Text style={st.h}>{last ? `SHOT ${runShots.length + 1}` : 'FIRST SHOT'}</Text>
          {!last ? <Text style={st.small}>Pull a shot to {fmt(run.yield)} g. Time it from when the pump starts.</Text> : null}
          {blocked ? (
            <View style={{ gap: S.sm }}>
              <Note tone="warn">{blocked === 'limit' ? "You've used the 20 shots on the Free plan. Move to Pro to keep going. It's free while we test." : 'This grinder is archived (read-only).'}</Note>
              <Button title="See plans" onPress={onSeePlans} />
            </View>
          ) : null}

          {showInputs ? (
            <View style={st.duo}>
              <View style={st.bigField}>
                <Text style={st.tileLabel}>GRINDER READS</Text>
                <TextInput value={f.setting} onChangeText={set('setting')} keyboardType="decimal-pad" placeholder="6.5" placeholderTextColor={C.faint}
                  style={st.bigInput} accessibilityLabel="Grinder setting" />
              </View>
              <View style={st.bigField}>
                <Text style={st.tileLabel}>DOSER</Text>
                <TextInput value={f.doserTime} onChangeText={set('doserTime')} keyboardType="decimal-pad" placeholder="–" placeholderTextColor={C.faint}
                  style={st.bigInput} accessibilityLabel="Doser time in seconds" />
                <Text style={st.tileSub}>seconds</Text>
              </View>
            </View>
          ) : null}

          <Pressable style={st.timeBox} onPress={() => timeRef.current && timeRef.current.focus()} accessibilityLabel="Shot time in seconds">
            <Text style={st.tileLabel}>SHOT TIME (SECONDS)</Text>
            <View style={st.timeRow}>
              <Pressable onPress={() => bumpTime(-0.5)} style={st.timeBtn} hitSlop={6} accessibilityLabel="Half a second less"><Text style={st.timeBtnText}>−</Text></Pressable>
              <TextInput ref={timeRef} value={f.time} onChangeText={set('time')} keyboardType="decimal-pad" inputMode="decimal"
                placeholder={`${fmt(run.tLo, 0)}–${fmt(run.tHi, 0)}`} placeholderTextColor={C.faint} style={st.timeInput} returnKeyType="done" selectTextOnFocus />
              <Pressable onPress={() => bumpTime(0.5)} style={st.timeBtn} hitSlop={6} accessibilityLabel="Half a second more"><Text style={st.timeBtnText}>+</Text></Pressable>
            </View>
          </Pressable>

          {fan ? (
            <View style={{ gap: 6 }}>
              <Label>How busy?</Label>
              <Segmented options={LOADS} value={Number(f.workload)} onChange={set('workload')} />
            </View>
          ) : null}

          {/* dose: only asked when it went wrong */}
          {!f.doseWrong ? (
            <Pressable onPress={() => setF(p => ({ ...p, doseWrong: true }))} hitSlop={6}>
              <Text style={st.why}>Dose wasn't {fmt(run.dose)} g?</Text>
            </Pressable>
          ) : (
            <View style={st.dropBox}>
              <Stepper label="THE DOSE WEIGHED" unit="g" value={f.ground} onChange={set('ground')} step={0.1} />
              <Text style={st.small}>Top up or take out to {fmt(run.dose)} g, then pull the shot. Dial In corrects the doser time for next time.</Text>
              <Button title="Dose was fine" kind="link" onPress={() => setF(p => ({ ...p, doseWrong: false, ground: str(run.dose) }))} />
            </View>
          )}

          {!simple ? (
            <>
              {gauge ? (
                <View style={st.steppers}>
                  <Stepper label="ROOM" unit="°C" value={f.roomTemp} onChange={set('roomTemp')} step={0.5} />
                  <Stepper label="HUMIDITY" unit="%" value={f.humidity} onChange={set('humidity')} step={1} decimals={0} />
                </View>
              ) : null}
              <View style={{ gap: 6 }}>
                <Label>Taste (optional)</Label>
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
            </>
          ) : null}

          {err ? <Text style={st.err}>{err}</Text> : null}
          <Button title="Record shot" onPress={record} disabled={!!blocked} />
        </Card>
      ) : null}

      {/* the record of this run */}
      {runShots.length >= 2 ? (
        <Card>
          <Text style={st.h}>THIS RUN</Text>
          {runShots.map((s, i) => (
            <View key={s.id} style={st.runRow}>
              <Text style={st.runText}>{i + 1}. Grinder {s.setting}{s.doserTime != null ? ` · doser ${fd(s.doserTime)} s` : ''}</Text>
              <Text style={[st.runText, { color: verdict(s) === 'in range' ? C.good : C.warn }]}>{fmt(s.time)} s</Text>
            </View>
          ))}
          {!simple ? <ShotsChart shots={runShots} target={mid} lo={run.tLo} hi={run.tHi} /> : null}
        </Card>
      ) : null}

      <View style={{ gap: S.sm }}>
        {!sureRestart ? (
          <Button title="Change dose" kind="secondary" onPress={() => setSureRestart(true)} />
        ) : (
          <Card tone="warn">
            <Text style={st.small}>Changing the dose starts this calibration again from the first shot. Your shots so far are kept in History.</Text>
            <Button title="Yes, start again" onPress={onRestart} />
            <Button title="Cancel" kind="link" onPress={() => setSureRestart(false)} />
          </Card>
        )}
        <Button title="Stop for now" kind="link" onPress={onStop} />
      </View>
    </View>
  );
}

function Mini({ label, value }) {
  return (
    <View style={st.mini}>
      <Text style={st.tileLabel}>{label}</Text>
      <Text style={st.miniVal}>{value}</Text>
    </View>
  );
}

function Big({ label, value, sub }) {
  return (
    <View style={st.bigTile}>
      <Text style={st.tileLabel}>{label}</Text>
      <Text style={st.bigVal}>{value}</Text>
      {sub ? <Text style={st.tileSub}>{sub}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  top: { gap: 2 },
  coffee: { color: C.white, fontSize: 22, fontWeight: '800' },
  topSub: { color: C.muted, fontSize: 14 },
  h: { color: C.ink, fontSize: 15, fontWeight: '800', letterSpacing: 0.8 },
  small: { color: C.muted, fontSize: 14, lineHeight: 20 },
  err: { color: C.bad, fontSize: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trio: { flexDirection: 'row', gap: S.sm },
  mini: { flex: 1, backgroundColor: C.surface2, borderRadius: R.md, padding: S.sm, alignItems: 'center', gap: 2 },
  miniVal: { color: C.ink, fontSize: 20, fontWeight: '800' },
  duo: { flexDirection: 'row', gap: S.md },
  bigTile: { flex: 1, backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.accentLine, padding: S.md, alignItems: 'center', gap: 2 },
  bigVal: { color: C.white, fontSize: 40, fontWeight: '800' },
  done: { color: C.good, fontWeight: '700', fontSize: 15, textAlign: 'center' },
  why: { color: C.accentBright, fontWeight: '700', fontSize: 15 },
  bigField: { flex: 1, backgroundColor: C.accentSoft, borderRadius: R.md, borderWidth: 1, borderColor: C.accentLine, padding: S.md, alignItems: 'center', gap: 4 },
  bigInput: { color: C.white, fontSize: 36, fontWeight: '800', minWidth: 90, textAlign: 'center', paddingVertical: 2 },
  timeBox: { backgroundColor: C.accentSoft, borderRadius: R.md, borderWidth: 1.5, borderColor: C.papaya, padding: S.lg, alignItems: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginVertical: 4 },
  timeInput: { color: C.white, fontSize: 48, fontWeight: '800', width: 170, height: 72, textAlign: 'center', padding: 0,
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.accentLine },
  timeBtn: { width: 56, height: 56, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  timeBtnText: { color: C.ink, fontSize: 28, fontWeight: '600', marginTop: -2 },
  dropBox: { gap: S.sm, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.md, backgroundColor: C.surface2 },
  steppers: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  tastes: { flexDirection: 'row', gap: S.sm },
  taste: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingVertical: 14, alignItems: 'center', backgroundColor: C.surface2 },
  tasteText: { color: C.ink, fontWeight: '700', fontSize: 15 },
  runRow: { flexDirection: 'row', justifyContent: 'space-between' },
  runText: { color: C.muted, fontSize: 14 },
  tileLabel: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  tileSub: { color: C.muted, fontSize: 13, textAlign: 'center' },
});
