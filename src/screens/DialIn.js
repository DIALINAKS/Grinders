import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Card, Label, Segmented, Note, Button, Field, Grid } from '../components/ui';
import { Gauge, ShotsChart, Stepper, Pill } from '../components/visuals';
import { recommend, rulesFor, dialMarks, checkDialEntry, fmt } from '../engine';

const LOADS = [{ value: 0, label: 'Quiet' }, { value: 1, label: 'Steady' }, { value: 2, label: 'Busy' }];
const TASTES = [{ value: 'sour', label: 'Sour' }, { value: 'balanced', label: 'Balanced' }, { value: 'bitter', label: 'Bitter' }];
const STEPS = [{ key: 'before', label: 'Before' }, { key: 'shot', label: 'Run it' }, { key: 'result', label: 'Change' }];
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const str = v => (v == null || v === '' ? '' : String(v));

/**
 * The barista's loop, one step at a time:
 *   1. Before the shot: what the grinder reads now, dose time, dose weight and the room.
 *   2. Run it: extraction time, yield and taste. Saving logs the shot.
 *   3. Change: the grind setting and dose time for the next shot, and why.
 */
export default function DialIn({ grinder, coffee, shots, blocked, onSaveShot, onChangeRules, onOpenRules, onSeePlans }) {
  const rules = rulesFor(grinder);
  const M = dialMarks(rules);
  const last = shots[shots.length - 1];
  const [step, setStep] = useState('before');
  const [f, setF] = useState(() => formFrom(last, coffee));
  const [err, setErr] = useState('');

  const justSaved = useRef(false);
  const profileKey = grinder ? grinder.id + '|' + coffee : '';
  useEffect(() => {
    if (justSaved.current) { justSaved.current = false; return; } // saving a new coffee's first shot switches profile; stay on the result
    setF(formFrom(last, coffee)); setStep('before'); setErr('');
  }, [profileKey]);
  const set = k => v => setF(p => ({ ...p, [k]: v }));

  const now = { target: f.target, dose: f.dose, yield: f.yieldTarget, roomTemp: f.roomTemp, humidity: f.humidity, groupTemp: f.groupTemp, workload: f.workload };
  const r = useMemo(() => recommend({ shots, rules, now }), [shots, grinder, f.target, f.dose, f.yieldTarget, f.roomTemp, f.humidity, f.groupTemp, f.workload]);

  const toShot = () => {
    if (!f.bean.trim()) return setErr('Add the coffee name.');
    if (num(f.setting) === null) return setErr('Add what the grinder reads now.');
    const dialErr = checkDialEntry(num(f.setting), M);
    if (dialErr) return setErr(dialErr);
    if (num(f.dose) === null) return setErr('Add the dose weight.');
    setErr(''); setF(p => ({ ...p, time: '', taste: '', yieldOut: p.yieldOut || p.yieldTarget })); setStep('shot');
  };
  const saveShot = () => {
    if (num(f.time) === null) return setErr('Add the extraction time.');
    setErr('');
    justSaved.current = f.bean.trim() !== coffee;
    onSaveShot({
      bean: f.bean.trim(), roast: '', setting: num(f.setting), doserTime: num(f.doserTime), dose: num(f.dose),
      yield: num(f.yieldOut) ?? num(f.yieldTarget), time: num(f.time), groupTemp: num(f.groupTemp), roomTemp: num(f.roomTemp),
      humidity: num(f.humidity), workload: f.workload, taste: f.taste, notes: '', target: num(f.target),
    });
    setStep('result');
  };
  const nextShot = () => {
    if (r.status === 'ready') {
      setF(p => ({ ...p, setting: toEntry(r.dial.value, M), doserTime: r.dose.seconds != null ? String(r.dose.seconds) : p.doserTime, time: '', taste: '', yieldOut: '' }));
    }
    setStep('before');
  };

  return (
    <View style={{ gap: S.lg }}>
      <Steps step={step} onStep={k => { if (k === 'before' || (k === 'result' && shots.length)) setStep(k); }} />

      {step === 'before' ? (
        <Card>
          <Text style={st.h}>1 · BEFORE THE SHOT</Text>
          <Text style={st.small}>Enter what's set on the grinder right now and weigh your dose.</Text>
          {blocked ? <BlockedNote blocked={blocked} onSeePlans={onSeePlans} /> : null}

          <View style={st.hero2}>
            <View style={st.bigField}>
              <Text style={st.tileLabel}>GRINDER READS</Text>
              <TextInput value={f.setting} onChangeText={set('setting')} keyboardType="decimal-pad" placeholder="4.1"
                placeholderTextColor={C.faint} style={st.bigInput} />
              <Text style={st.tileSub}>{M}-mark dial · 4.3 = mark 3</Text>
            </View>
            <View style={st.bigField}>
              <Text style={st.tileLabel}>DOSE TIME</Text>
              <View style={st.inline}>
                <TextInput value={f.doserTime} onChangeText={set('doserTime')} keyboardType="decimal-pad" placeholder="6.2"
                  placeholderTextColor={C.faint} style={st.bigInput} />
                <Text style={st.unit}>s</Text>
              </View>
              <Presets presets={rules.presets} value={f.doserTime} onPick={set('doserTime')} />
            </View>
          </View>

          <View style={st.steppers}>
            <Stepper label="DOSE WEIGHT" unit="g" value={f.dose} onChange={set('dose')} step={0.1} />
            <Stepper label="TARGET YIELD" unit="g" value={f.yieldTarget} onChange={set('yieldTarget')} step={0.5} />
            <Stepper label="TARGET TIME" unit="s" value={f.target} onChange={set('target')} step={0.5} />
            <Stepper label="ROOM" unit="°C" value={f.roomTemp} onChange={set('roomTemp')} step={0.1} />
            <Stepper label="HUMIDITY" unit="% RH" value={f.humidity} onChange={set('humidity')} step={1} decimals={0} />
            <Stepper label="GROUP HEAD" unit="°C" value={f.groupTemp} onChange={set('groupTemp')} step={1} decimals={0} />
          </View>
          <View style={{ gap: 6 }}>
            <Label>Workload now</Label>
            <Segmented options={LOADS} value={Number(f.workload)} onChange={set('workload')} />
          </View>
          <Grid>
            <Field label="Coffee" value={f.bean} onChangeText={set('bean')} keyboardType="default" placeholder="e.g. Ethiopia Guji" width="full" />
          </Grid>
          <Button title="Next: run the shot" onPress={toShot} disabled={!!blocked} />
          {err ? <Text style={st.err}>{err}</Text> : null}
        </Card>
      ) : null}

      {step === 'shot' ? (
        <Card>
          <Text style={st.h}>2 · RUN THE SHOT</Text>
          <Text style={st.small}>On {f.setting} · {f.doserTime || '–'} s dose · {f.dose} g. Pull it, then enter the result.</Text>
          <View style={st.timeBox}>
            <Text style={st.tileLabel}>EXTRACTION TIME</Text>
            <View style={st.inline}>
              <TextInput value={f.time} onChangeText={set('time')} keyboardType="decimal-pad" placeholder={String(f.target || 28)}
                placeholderTextColor={C.faint} style={st.timeInput} autoFocus />
              <Text style={st.unit}>s</Text>
            </View>
          </View>
          <View style={st.steppers}>
            <Stepper label="YIELD IN THE CUP" unit="g" value={f.yieldOut} onChange={set('yieldOut')} step={0.5} />
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
          <Button title="Save and tell me what to change" onPress={saveShot} />
          <Button title="‹ Back" kind="link" onPress={() => setStep('before')} />
          {err ? <Text style={st.err}>{err}</Text> : null}
        </Card>
      ) : null}

      {step === 'result' ? (
        <Card style={{ alignItems: 'stretch' }}>
          <Text style={st.h}>3 · CHANGE FOR YOUR NEXT SHOT</Text>
          {last ? <Text style={st.small}>Last shot: {fmt(last.time)} s on {last.setting} against your {fmt(num(f.target))} s target.</Text> : null}
          <Result r={r} M={M} grinder={grinder} onChangeRules={onChangeRules} />
          {r.status === 'ready' ? <Button title="Pull the next shot with these settings" onPress={nextShot} /> : <Button title="Log another shot" onPress={nextShot} />}
          <Pressable onPress={onOpenRules}><Text style={st.link}>All grinder rules for {grinder.name}</Text></Pressable>
        </Card>
      ) : null}

      {step === 'result' && r.status === 'ready' && r.dial.breakdown.length ? (
        <Card>
          <Text style={st.h}>WHY THIS SETTING</Text>
          {r.dial.breakdown.map((b, i) => (
            <View key={i} style={st.why}>
              <Text style={st.whyLabel}>{b.label}</Text>
              <Pill tone={/coarser/.test(b.move) ? 'warn' : b.move === 'hold' ? undefined : 'accent'}>{b.move}</Pill>
            </View>
          ))}
        </Card>
      ) : null}

      {shots.length >= 2 ? (
        <Card>
          <View style={st.rowBetween}>
            <Text style={st.h}>LAST {Math.min(12, shots.length)} SHOTS</Text>
            <Text style={st.small}>target band {fmt(num(f.target) - 1, 0)}–{fmt(num(f.target) + 1, 0)} s</Text>
          </View>
          <ShotsChart shots={shots.slice(-12)} target={num(f.target) || 28} />
          <View style={st.legend}>
            <Dot color={C.warn} label="Sour" /><Dot color={C.good} label="Balanced" /><Dot color={C.bad} label="Bitter" />
          </View>
        </Card>
      ) : null}
    </View>
  );
}

function Steps({ step, onStep }) {
  const at = STEPS.findIndex(s => s.key === step);
  return (
    <View style={st.steps}>
      {STEPS.map((s, i) => (
        <Pressable key={s.key} onPress={() => onStep(s.key)} style={[st.stepPill, i === at && st.stepOn, i < at && st.stepDone]}>
          <Text style={[st.stepText, i <= at && { color: C.white }]}>{i + 1} {s.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Presets({ presets, value, onPick }) {
  const list = String(presets || '').split(/[,\s]+/).map(parseFloat).filter(v => Number.isFinite(v) && v > 0);
  if (!list.length) return <Text style={st.tileSub}>seconds on the doser</Text>;
  return (
    <View style={st.presetRow}>
      {list.map(p => {
        const on = Math.abs(p - parseFloat(value)) < 0.01;
        return (
          <Pressable key={p} onPress={() => onPick(String(p))} style={[st.preset, on && st.presetOn]} hitSlop={4}>
            <Text style={[st.presetText, on && { color: C.white }]}>{fmt(p)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BlockedNote({ blocked, onSeePlans }) {
  return (
    <View style={{ gap: S.sm }}>
      <Note tone="warn">{blocked === 'limit'
        ? "You've saved 20 shots, the limit on the Free plan. Everything is still here. Move to Pro to keep logging. It's free while we test."
        : 'This grinder is archived (read-only). Your plan includes 1 active grinder. Move to Business to use it again.'}</Note>
      <Button title="See plans" onPress={onSeePlans} />
    </View>
  );
}

function Result({ r, M, grinder, onChangeRules }) {
  if (r.status === 'no-shots') return <Note>Log a shot first, then the app tells you what to change.</Note>;
  if (r.status === 'need-more') return <Note>Fill in this grinder's rules, or log a second shot at a different grind setting.</Note>;
  if (r.status === 'no-target') return <Note>Set a target extraction time in step 1.</Note>;
  if (r.status === 'flat') return <Note tone="warn">Changing the grind isn't moving the time much in your shots yet. Try shots further apart on the dial.</Note>;
  const d = r.dial, ds = r.dose;
  const rawRule = (grinder.rules || {}).doserNotch;
  const setPerNotch = v => onChangeRules({ ...(grinder.rules || {}), doserNotch: v });
  let doseWhy;
  if (ds.seconds == null) doseWhy = 'Enter a dose time in step 1 to get this.';
  else if (ds.unknownPerNotch) doseWhy = 'Holding your last dose time: set "dose time per notch" below so it follows the grind.';
  else if (Math.abs(ds.gapNotches || 0) < 1e-6) doseWhy = 'Grind isn\'t moving, so the dose time stays.';
  else if (!ds.change) doseWhy = `This grind move is too small to change the dose time (${fmt(ds.perNotch, 2)} s per notch, ${ds.perNotchSource}).`;
  else doseWhy = `${ds.change > 0 ? '+' : ''}${fmt(ds.change)} s for the grind move (${fmt(ds.perNotch, 2)} s per notch, ${ds.perNotchSource}).`;

  return (
    <View style={{ gap: S.md }}>
      <Gauge value={d.value} anchor={d.anchorValue} M={M}>
        <Text style={st.big}>{d.text}</Text>
        <Text style={st.words}>{d.words}</Text>
      </Gauge>
      <Pill tone="accent">{d.moveShort === 'hold' ? `Stay on ${d.anchorText}` : `Was ${d.anchorText} · ${d.moveShort}`}</Pill>
      {d.reason ? <Text style={st.reason}>{d.reason}</Text> : null}
      {d.capped ? <Text style={[st.reason, { color: C.warn }]}>Capped at one notch. Pull a shot here and check before going further.</Text> : null}

      <View style={st.doseTile}>
        <Text style={st.tileLabel}>DOSE TIME</Text>
        <Text style={st.doseBig}>{ds.seconds != null ? fmt(ds.seconds) : '–'}<Text style={st.unit}>{ds.seconds != null ? ' s' : ''}</Text></Text>
        {ds.preset ? <Text style={st.tileSub}>{ds.preset.text}</Text> : null}
        <Text style={[st.tileSub, ds.unknownPerNotch && { color: C.warn }]}>{doseWhy}</Text>
        <View style={st.perNotch}>
          <Stepper label="DOSE TIME PER NOTCH FINER" unit={rawRule ? 'seconds · your setting' : ds.perNotch ? `seconds · blank uses ${fmt(ds.perNotch, 2)} learned` : 'seconds · not set yet'}
            value={rawRule || ''} onChange={setPerNotch} step={0.1} decimals={1} />
        </View>
      </View>

      <View style={st.tiles}>
        <View style={st.tile}>
          <Text style={st.tileLabel}>IF YOU DON'T MOVE IT</Text>
          <Text style={st.tileValue}>{fmt(r.ifUnchanged)} s</Text>
          <Text style={st.tileSub}>{d.range ? `Confidence ± ${d.range}` : 'Log a 3rd shot for a confidence range'}</Text>
        </View>
        <View style={st.tile}>
          <Text style={st.tileLabel}>PER MARK</Text>
          <Text style={st.tileValue}>{fmt(r.secondsPerMark)} s</Text>
          <Text style={st.tileSub}>{fmt(r.secondsPerQuarter, 2)} s per ¼ mark</Text>
        </View>
      </View>
      {r.tasteHint ? <Text style={st.reason}>{r.tasteHint}</Text> : null}
    </View>
  );
}

/** Dial reading in a form the barista can type back in: 4.2½ → "4.25". */
function toEntry(x, M) {
  const w = Math.floor(x + 1e-9), d = Math.round((x - w) * M * 4) / 4;
  return String(+(w + d / 10).toFixed(3));
}

function Dot({ color, label }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} /><Text style={st.small}>{label}</Text></View>;
}

function formFrom(last, coffee) {
  const l = last || {};
  return {
    bean: coffee || l.bean || '',
    setting: str(l.setting), doserTime: str(l.doserTime), dose: str(l.dose ?? 18),
    yieldTarget: str(l.yield ?? 36), target: str(l.target ?? 28),
    roomTemp: str(l.roomTemp), humidity: str(l.humidity), groupTemp: str(l.groupTemp ?? 93),
    workload: l.workload ?? 1, time: '', taste: '', yieldOut: '',
  };
}

const st = StyleSheet.create({
  h: { color: C.ink, fontSize: 15, fontWeight: '800', letterSpacing: 0.8 },
  small: { color: C.muted, fontSize: 13 },
  err: { color: C.bad },
  steps: { flexDirection: 'row', gap: S.sm },
  stepPill: { flex: 1, paddingVertical: 8, borderRadius: R.pill, borderWidth: 1, borderColor: C.line, alignItems: 'center', backgroundColor: C.surface },
  stepOn: { backgroundColor: C.accent, borderColor: C.accent },
  stepDone: { backgroundColor: C.accentSoft, borderColor: '#1D3B7A' },
  stepText: { color: C.muted, fontWeight: '700', fontSize: 13 },
  hero2: { flexDirection: 'row', gap: S.md },
  bigField: { flex: 1, backgroundColor: C.accentSoft, borderRadius: R.md, borderWidth: 1, borderColor: '#1D3B7A', padding: S.md, alignItems: 'center', gap: 4 },
  bigInput: { color: C.white, fontSize: 38, fontWeight: '800', minWidth: 90, textAlign: 'center', paddingVertical: 2 },
  inline: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  presetRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  preset: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  presetOn: { backgroundColor: C.accent, borderColor: C.accent },
  presetText: { color: C.ink, fontWeight: '700', fontSize: 13 },
  timeBox: { backgroundColor: C.accentSoft, borderRadius: R.md, borderWidth: 1, borderColor: '#1D3B7A', padding: S.lg, alignItems: 'center' },
  timeInput: { color: C.white, fontSize: 56, fontWeight: '800', minWidth: 120, textAlign: 'center', paddingVertical: 2 },
  tastes: { flexDirection: 'row', gap: S.sm },
  taste: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingVertical: 14, alignItems: 'center', backgroundColor: C.surface2 },
  tasteText: { color: C.ink, fontWeight: '700', fontSize: 15 },
  big: { color: C.white, fontSize: 64, fontWeight: '800', letterSpacing: -1 },
  words: { color: C.muted, fontSize: 14, marginTop: -4 },
  reason: { color: C.muted, fontSize: 13, textAlign: 'center' },
  doseTile: { backgroundColor: C.accentSoft, borderRadius: R.md, borderWidth: 1, borderColor: '#1D3B7A', padding: S.lg, alignItems: 'center', gap: 4 },
  doseBig: { color: C.white, fontSize: 48, fontWeight: '800' },
  unit: { color: C.muted, fontSize: 18, fontWeight: '600' },
  perNotch: { alignSelf: 'stretch', flexDirection: 'row', marginTop: S.sm },
  tiles: { flexDirection: 'row', gap: S.md },
  tile: { flex: 1, backgroundColor: C.surface2, borderRadius: R.md, padding: S.md, gap: 2, alignItems: 'center' },
  tileLabel: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  tileValue: { color: C.ink, fontSize: 24, fontWeight: '700' },
  tileSub: { color: C.muted, fontSize: 12, textAlign: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  steppers: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  why: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.md },
  whyLabel: { color: C.muted, fontSize: 13, flexShrink: 1 },
  link: { color: C.accentBright, fontWeight: '700', textDecorationLine: 'underline', textAlign: 'center' },
  legend: { flexDirection: 'row', gap: S.lg },
});
