import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Card, Field, Grid, Label, Segmented, Button, Note } from '../components/ui';
import { checkDialEntry, dialMarks, rulesFor } from '../engine';

const LOADS = [{ value: 0, label: 'Quiet' }, { value: 1, label: 'Steady' }, { value: 2, label: 'Busy' }];
const TASTES = [{ value: 'sour', label: 'Sour' }, { value: 'balanced', label: 'Balanced' }, { value: 'bitter', label: 'Bitter' }];
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const str = v => (v == null || v === '' ? '' : String(v));

/**
 * Logging is two taps and one number in service: the extraction time, then how it tasted.
 * Everything else is pre-filled (from "Pull it and log the shot" or the last shot) under More details.
 */
export default function LogShot({ grinder, coffee, lastShot, prefill, blocked, onSave, onSeePlans }) {
  const M = dialMarks(rulesFor(grinder));
  const blank = () => {
    const p = prefill || {}, l = lastShot || {};
    return {
      time: '', taste: '',
      bean: coffee || '', setting: str(p.setting ?? l.setting), doserTime: str(p.doserTime ?? l.doserTime),
      dose: str(p.dose ?? l.dose ?? 18), yield: str(p.yield ?? l.yield ?? 36), groupTemp: str(p.groupTemp ?? l.groupTemp),
      roomTemp: str(p.roomTemp ?? l.roomTemp), humidity: str(p.humidity ?? l.humidity),
      workload: p.workload ?? l.workload ?? 1, roast: l.roast || '', notes: '', target: p.target ?? l.target ?? 28,
    };
  };
  const [f, setF] = useState(blank);
  const [more, setMore] = useState(!coffee);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { setF(blank()); setErr(''); setMore(!coffee); }, [grinder && grinder.id, coffee, prefill]);
  const set = k => v => setF(p => ({ ...p, [k]: v }));

  const save = () => {
    const shot = {
      bean: f.bean.trim(), roast: f.roast.trim(), setting: num(f.setting), doserTime: num(f.doserTime), dose: num(f.dose),
      yield: num(f.yield), time: num(f.time), groupTemp: num(f.groupTemp), roomTemp: num(f.roomTemp), humidity: num(f.humidity),
      workload: f.workload, taste: f.taste, notes: f.notes.trim(), target: num(f.target),
    };
    const missing = [['time', 'extraction time'], ['bean', 'coffee'], ['setting', 'grind setting'], ['dose', 'dose'], ['yield', 'yield']]
      .filter(([k]) => shot[k] === '' || shot[k] === null).map(x => x[1]);
    if (missing.length) { setErr('Add the ' + missing.join(', ') + ' to save this shot.'); if (missing[0] !== 'extraction time') setMore(true); return; }
    const dialErr = checkDialEntry(shot.setting, M);
    if (dialErr) { setErr(dialErr); setMore(true); return; }
    setErr('');
    onSave(shot);
    setF(p => ({ ...p, time: '', taste: '', notes: '' }));
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  return (
    <Card>
      <View style={st.head}>
        <Text style={st.h}>LOG A SHOT</Text>
        <Text style={st.small}>{grinder.name} · {M === 10 ? 'tenths' : `${M} marks`}</Text>
      </View>
      {blocked === 'limit' ? <Note tone="warn">You've saved 20 shots, the limit on the Free plan. Your shots, settings and predictions are all still here. Move to Pro to keep logging. It's free while we test.</Note> : null}
      {blocked === 'archived' ? <Note tone="warn">This grinder is archived (read-only). Your plan includes 1 active grinder. Move to Business to use it again.</Note> : null}
      {blocked ? <Button title="See plans" onPress={onSeePlans} /> : null}
      {prefill && prefill.note && !blocked ? <View style={st.prefill}><Text style={st.prefillText}>{prefill.note}</Text></View> : null}

      <View style={st.timeBox}>
        <Text style={st.timeLabel}>EXTRACTION TIME</Text>
        <View style={st.timeRow}>
          <TextInput value={f.time} onChangeText={set('time')} keyboardType="decimal-pad" placeholder={String(f.target || 28)}
            placeholderTextColor={C.faint} style={st.timeInput} autoFocus={!!prefill} editable={!blocked} />
          <Text style={st.timeUnit}>s</Text>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Label>How did it taste?</Label>
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

      <Button title={saved ? 'Saved ✓' : 'Save shot'} onPress={save} disabled={!!blocked} />
      {err ? <Text style={{ color: C.bad }}>{err}</Text> : null}

      <Pressable onPress={() => setMore(m => !m)} hitSlop={6}>
        <Text style={st.disclose}>{more ? '▾' : '▸'} More details · {f.bean || 'coffee'} · dial {f.setting || '–'} · {f.doserTime || '–'} s dose</Text>
      </Pressable>
      {more ? (
        <View style={{ gap: S.md }}>
          <Grid>
            <Field label="Coffee" value={f.bean} onChangeText={set('bean')} keyboardType="default" placeholder="e.g. Rusty's Roast" width="full" />
            <Field label="Grind setting (as the dial reads)" value={f.setting} onChangeText={set('setting')} />
            <Field label="Doser time (s)" value={f.doserTime} onChangeText={set('doserTime')} />
            <Field label="Dose (g)" value={f.dose} onChangeText={set('dose')} />
            <Field label="Yield (g)" value={f.yield} onChangeText={set('yield')} />
            <Field label="Room (°C)" value={f.roomTemp} onChangeText={set('roomTemp')} />
            <Field label="Humidity (% RH)" value={f.humidity} onChangeText={set('humidity')} />
            <Field label="Group head (°C)" value={f.groupTemp} onChangeText={set('groupTemp')} />
            <Field label="Roast date" value={f.roast} onChangeText={set('roast')} keyboardType="default" placeholder="Optional" />
          </Grid>
          <View style={{ gap: 6 }}><Label>Workload</Label><Segmented options={LOADS} value={f.workload} onChange={set('workload')} /></View>
          <Field label="Notes" value={f.notes} onChangeText={set('notes')} keyboardType="default" placeholder="Optional" width="full" />
          <Text style={st.small}>On a {M}-mark dial, type 4.3 for mark 3, or 4.35 for halfway past it.</Text>
        </View>
      ) : null}
    </Card>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h: { color: C.ink, fontSize: 15, fontWeight: '800', letterSpacing: 0.8 },
  small: { color: C.muted, fontSize: 12 },
  prefill: { backgroundColor: C.surface2, borderRadius: R.md, padding: S.md },
  prefillText: { color: C.ink, fontSize: 13 },
  timeBox: { backgroundColor: C.accentSoft, borderRadius: R.md, borderWidth: 1, borderColor: '#1D3B7A', padding: S.lg, alignItems: 'center' },
  timeLabel: { color: C.ink, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  timeInput: { color: C.white, fontSize: 56, fontWeight: '800', minWidth: 120, textAlign: 'center', paddingVertical: 2 },
  timeUnit: { color: C.muted, fontSize: 22, fontWeight: '600' },
  tastes: { flexDirection: 'row', gap: S.sm },
  taste: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingVertical: 14, alignItems: 'center', backgroundColor: C.surface2 },
  tasteText: { color: C.ink, fontWeight: '700', fontSize: 15 },
  disclose: { color: C.ink, fontWeight: '600' },
});
