import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Card, Label, Segmented, Body, Note, Button, Field, Grid } from '../components/ui';
import { Gauge, ShotsChart, Stepper, Pill } from '../components/visuals';
import { recommend, rulesFor, fmt, fromDial } from '../engine';

const LOADS = [{ value: 0, label: 'Quiet' }, { value: 1, label: 'Steady' }, { value: 2, label: 'Busy' }];

/** Main screen: the grinder dial and dose time for the next shot. */
export default function DialIn({ grinder, coffee, shots, onPull, onOpenRules }) {
  const last = shots[shots.length - 1];
  const [now, setNow] = useState(() => defaultsFrom(last));
  const [quick, setQuick] = useState({ setting: '', time: '' });
  const [showQuick, setShowQuick] = useState(false);

  const profileKey = grinder ? grinder.id + '|' + coffee : '';
  useEffect(() => { setNow(defaultsFrom(last)); setQuick({ setting: last ? String(last.setting) : '', time: '' }); setShowQuick(false); }, [profileKey]);

  const rules = rulesFor(grinder);
  const r = useMemo(() => recommend({ shots, rules, now, quick: showQuick ? quick : null }), [shots, grinder, now, quick, showQuick]);
  const set = k => v => setNow(p => ({ ...p, [k]: v }));

  return (
    <View style={{ gap: S.lg }}>
      <Card style={{ alignItems: 'stretch' }}>
        <Text style={st.kicker}>SETTINGS FOR YOUR NEXT SHOT · {grinder.name.toUpperCase()}{coffee ? ' · ' + coffee.toUpperCase() : ''}</Text>
        <Hero r={r} M={r.M} />
        {r.status === 'ready' ? (
          <Button title="Pull it and log the shot" onPress={() => onPull({
            setting: toEntry(r.dial.value, r.M),
            doserTime: r.dose.seconds != null ? String(r.dose.seconds) : '',
            dose: now.dose, yield: now.yield, roomTemp: now.roomTemp, humidity: now.humidity, groupTemp: now.groupTemp,
            workload: Number(now.workload), target: parseFloat(now.target),
            note: `Pre-filled with the recommended ${r.dial.text}${r.dose.seconds != null ? ` and ${fmt(r.dose.seconds)} s dose time` : ''}. Change anything you did differently.`,
          })} />
        ) : null}
      </Card>

      <Card>
        <View style={st.rowBetween}>
          <Text style={st.h}>RIGHT NOW</Text>
          <Text style={st.small}>compared with your last shot</Text>
        </View>
        <View style={st.steppers}>
          <Stepper label="TARGET" unit="s" value={now.target} onChange={set('target')} step={0.5} />
          <Stepper label="DOSE" unit="g" value={now.dose} onChange={set('dose')} step={0.1} />
          <Stepper label="YIELD" unit="g" value={now.yield} onChange={set('yield')} step={0.5} />
          <Stepper label="ROOM" unit="°C" value={now.roomTemp} onChange={set('roomTemp')} step={0.5} />
          <Stepper label="HUMIDITY" unit="% RH" value={now.humidity} onChange={set('humidity')} step={1} decimals={0} />
          <Stepper label="GROUP HEAD" unit="°C" value={now.groupTemp} onChange={set('groupTemp')} step={0.5} />
        </View>
        <View style={{ gap: 6 }}>
          <Label>Workload now</Label>
          <Segmented options={LOADS} value={Number(now.workload)} onChange={set('workload')} />
          <Body muted style={{ fontSize: 12 }}>{rules.burr === 'fan'
            ? 'Fan-cooled burrs: a busier spell expands them, so the app corrects coarser.'
            : 'Temperature-controlled burrs: workload doesn\'t change this grinder.'}</Body>
        </View>
        <Pressable onPress={() => setShowQuick(v => !v)} hitSlop={6}>
          <Text style={st.disclose}>{showQuick ? '▾' : '▸'} Quick adjust from a shot you just pulled</Text>
        </Pressable>
        {showQuick ? (
          <Grid>
            <Field label="Grinder on now" value={quick.setting} onChangeText={v => setQuick(q => ({ ...q, setting: v }))} />
            <Field label="Shot just pulled (s)" value={quick.time} onChangeText={v => setQuick(q => ({ ...q, time: v }))} placeholder="e.g. 31" />
          </Grid>
        ) : null}
      </Card>

      {r.status === 'ready' && r.dial.breakdown.length ? (
        <Card>
          <Text style={st.h}>WHY THIS SETTING</Text>
          {r.dial.breakdown.map((b, i) => (
            <View key={i} style={st.why}>
              <Text style={st.whyLabel}>{b.label}</Text>
              <Pill tone={/coarser/.test(b.move) ? 'warn' : b.move === 'hold' ? undefined : 'accent'}>{b.move}</Pill>
            </View>
          ))}
          <Pressable onPress={onOpenRules}><Text style={st.link}>Grinder rules for {grinder.name}</Text></Pressable>
        </Card>
      ) : null}

      {shots.length >= 2 ? (
        <Card>
          <View style={st.rowBetween}>
            <Text style={st.h}>LAST {Math.min(12, shots.length)} SHOTS</Text>
            <Text style={st.small}>target band {fmt(parseFloat(now.target) - 1, 0)}–{fmt(parseFloat(now.target) + 1, 0)} s</Text>
          </View>
          <ShotsChart shots={shots.slice(-12)} target={parseFloat(now.target) || 28} />
          <View style={st.legend}>
            <Dot color={C.warn} label="Sour" /><Dot color={C.good} label="Balanced" /><Dot color={C.bad} label="Bitter" />
          </View>
        </Card>
      ) : null}
    </View>
  );
}

/** Dial reading in a form the barista can type back in: 4.2½ → "4.25". */
function toEntry(x, M) {
  const w = Math.floor(x + 1e-9), d = Math.round((x - w) * M * 4) / 4;
  return String(+(w + d / 10).toFixed(3));
}

function Hero({ r, M }) {
  if (r.status === 'no-shots') return <Note>Log your first shot on this grinder and coffee. The app gives a first recommendation straight away and learns from every shot.</Note>;
  if (r.status === 'need-more') return <Note>Fill in this grinder's rules, or log a second shot at a different grind setting.</Note>;
  if (r.status === 'no-target') return <Note>Set a target extraction time below.</Note>;
  if (r.status === 'flat') return <Note tone="warn">Changing the grind isn't moving the time much in your shots yet. Try shots further apart on the dial.</Note>;
  const d = r.dial, ds = r.dose;
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
        <Text style={st.tileSub}>{ds.preset ? ds.preset.text : ds.seconds != null ? `For ${fmt(ds.lastGrams)} g → target dose` : 'Log a shot with its doser time to get this.'}</Text>
        {ds.unknownPerNotch ? <Text style={[st.tileSub, { color: C.warn }]}>Add "dose time per notch" in Rules so this follows the grind.</Text> : null}
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
      {r.tasteHint ? <Text style={st.reason}>{r.tasteHint}</Text> : <Text style={st.reason}>Last shot tasted balanced. Keep the target where it is.</Text>}
    </View>
  );
}

function Dot({ color, label }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} /><Text style={st.small}>{label}</Text></View>;
}

function defaultsFrom(last) {
  return {
    target: last && last.target != null ? String(last.target) : '28',
    dose: last && last.dose != null ? String(last.dose) : '18',
    yield: last && last.yield != null ? String(last.yield) : '36',
    roomTemp: last && last.roomTemp != null ? String(last.roomTemp) : '',
    humidity: last && last.humidity != null ? String(last.humidity) : '',
    groupTemp: last && last.groupTemp != null ? String(last.groupTemp) : '93',
    workload: last && last.workload != null ? last.workload : 1,
  };
}

const st = StyleSheet.create({
  kicker: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textAlign: 'center' },
  big: { color: C.white, fontSize: 64, fontWeight: '800', letterSpacing: -1 },
  words: { color: C.muted, fontSize: 14, marginTop: -4 },
  reason: { color: C.muted, fontSize: 13, textAlign: 'center' },
  doseTile: { backgroundColor: C.accentSoft, borderRadius: R.md, borderWidth: 1, borderColor: '#1D3B7A', padding: S.lg, alignItems: 'center', gap: 2 },
  doseBig: { color: C.white, fontSize: 48, fontWeight: '800' },
  unit: { color: C.muted, fontSize: 18, fontWeight: '600' },
  tiles: { flexDirection: 'row', gap: S.md },
  tile: { flex: 1, backgroundColor: C.surface2, borderRadius: R.md, padding: S.md, gap: 2, alignItems: 'center' },
  tileLabel: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  tileValue: { color: C.ink, fontSize: 24, fontWeight: '700' },
  tileSub: { color: C.muted, fontSize: 12, textAlign: 'center' },
  h: { color: C.ink, fontSize: 15, fontWeight: '800', letterSpacing: 0.8 },
  small: { color: C.muted, fontSize: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  steppers: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  disclose: { color: C.ink, fontWeight: '700' },
  why: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.md },
  whyLabel: { color: C.muted, fontSize: 13, flexShrink: 1 },
  link: { color: C.accentBright, fontWeight: '700', textDecorationLine: 'underline' },
  legend: { flexDirection: 'row', gap: S.lg },
});
