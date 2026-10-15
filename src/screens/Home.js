import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Card, Button, Body, Note } from '../components/ui';
import { coffeeLine } from '../components/CoffeeForm';
import { fmt } from '../engine';

const when = ts => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Dashboard: the two operating modes, plus this grinder's saved calibrations. */
export default function Home({ grinder, simple, items, run, runCoffee, runCount, onNew, onAdjust, onMaintain, onContinue, onGauge, onArchiveCoffee }) {
  const [archiving, setArchiving] = useState(null); // coffee id waiting for 'Yes, archive'
  return (
    <View style={{ gap: S.lg }}>
      {!simple && grinder.gauge == null ? (
        <Card tone="accent">
          <Text style={st.h}>DO YOU HAVE A TEMPERATURE AND HUMIDITY GAUGE?</Text>
          <Body muted>Room readings sharpen predictions, but Dial In works fully without them. You can change this later in the grinder's rules.</Body>
          <Button title="Yes, I can measure temperature and humidity" onPress={() => onGauge(true)} />
          <Button title="No, I don't have one" kind="secondary" onPress={() => onGauge(false)} />
        </Card>
      ) : null}

      {run ? (
        <Card tone="warn">
          <Text style={st.h}>CALIBRATION IN PROGRESS</Text>
          <Body>{runCoffee ? runCoffee.name : 'Coffee'} · {runCount} shot{runCount === 1 ? '' : 's'} so far · {fmt(run.dose)} g dose</Body>
          <Button title="Continue" onPress={onContinue} />
        </Card>
      ) : null}

      <Pressable onPress={() => (items.length ? onAdjust(null) : onNew())} style={({ pressed }) => [st.mode, pressed && { opacity: 0.85 }]} accessibilityRole="button">
        <Text style={st.modeTitle}>DIAL IN A COFFEE</Text>
        <Text style={st.modeSub}>Opening up, or a new coffee.</Text>
        <Text style={st.modeBody}>Dial In tells you the grind and doser time. You pull the shot and enter the time.</Text>
      </Pressable>

      <Pressable onPress={() => onMaintain(null)} disabled={!items.length} style={({ pressed }) => [st.mode, st.mode2, !items.length && { opacity: 0.5 }, pressed && { opacity: 0.85 }]} accessibilityRole="button">
        <Text style={st.modeTitle}>MAINTAIN CALIBRATION</Text>
        <Text style={st.modeSub}>During service.</Text>
        <Text style={st.modeBody}>{items.length ? 'Getting busy or warmer? Check whether the grinder needs a change.' : 'Save a calibration first, then this unlocks.'}</Text>
      </Pressable>

      <Card>
        <Text style={st.h}>SAVED ON {grinder.name.toUpperCase()}</Text>
        {grinder.epochStart ? <Text style={st.small}>Recalibrated {when(grinder.epochStart)}{grinder.epochReason ? ` (${grinder.epochReason})` : ''}. Earlier calibrations are kept in history but not used.</Text> : null}
        {items.length ? items.map(({ coffee, cal }) => (
          <View key={coffee.id} style={st.row}>
            <Pressable onPress={() => onAdjust(coffee.id)} style={{ gap: 2 }}>
              <View style={st.rowTop}><Text style={st.rowTitle}>{coffee.name}</Text><Text style={st.rowSet}>{cal.setting}</Text></View>
              <Text style={st.small}>{fmt(cal.dose)} g → {fmt(cal.yield)} g · {fmt(cal.time)} s{cal.roomTemp != null ? ` · ${fmt(cal.roomTemp)} °C` : ''}{cal.humidity != null ? ` · ${fmt(cal.humidity, 0)} %` : ''} · {when(cal.ts)}</Text>
              {coffeeLine(coffee) ? <Text style={st.small}>{coffeeLine(coffee)}</Text> : null}
            </Pressable>
            {archiving === coffee.id ? (
              <View style={st.confirm}>
                <Text style={st.small}>Archive {coffee.name}? Its history is kept.</Text>
                <View style={{ flexDirection: 'row', gap: S.lg }}>
                  <Pressable onPress={() => { setArchiving(null); onArchiveCoffee(coffee.id); }} hitSlop={8}><Text style={st.yes}>Yes, archive</Text></Pressable>
                  <Pressable onPress={() => setArchiving(null)} hitSlop={8}><Text style={st.no}>Cancel</Text></Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => setArchiving(coffee.id)} hitSlop={8} style={{ alignSelf: 'flex-end', marginTop: S.sm }}><Text style={st.archive}>Archive</Text></Pressable>
            )}
          </View>
        )) : <Body muted>No saved calibrations yet. Dial in a coffee and save it, and it appears here.</Body>}
      </Card>

      {!simple && grinder.gauge === false ? <Note>Dial In works without environmental measurements. For more detailed predictions, consider a digital thermometer and humidity gauge.</Note> : null}
    </View>
  );
}

const st = StyleSheet.create({
  h: { color: C.ink, fontSize: 15, fontWeight: '800', letterSpacing: 0.8 },
  small: { color: C.muted, fontSize: 13 },
  mode: { backgroundColor: C.accent, borderRadius: R.lg, padding: S.xl, gap: 6 },
  mode2: { backgroundColor: C.surface, borderWidth: 2, borderColor: C.accent },
  modeTitle: { color: C.white, fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  modeSub: { color: C.white, fontSize: 15, fontWeight: '700' },
  modeBody: { color: '#D6E2FF', fontSize: 15, lineHeight: 21 },
  row: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: S.md, gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { color: C.ink, fontWeight: '700', fontSize: 16 },
  rowSet: { color: C.accentBright, fontWeight: '800', fontSize: 18 },
  archive: { color: C.faint, fontSize: 13 },
  confirm: { gap: 6, marginTop: S.sm, padding: S.sm, borderRadius: R.md, borderWidth: 1, borderColor: C.warn },
  yes: { color: C.warn, fontWeight: '700', fontSize: 14 },
  no: { color: C.accentBright, fontWeight: '700', fontSize: 14 },
});
