import React, { useState } from 'react';
import { View, Text, Pressable, Alert, Platform, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Card, H2, Body } from '../components/ui';
import { fmt, fmtSec } from '../engine';

const LOADS = ['Quiet', 'Steady', 'Busy'];
const TASTE_COLOR = { sour: C.warn, balanced: C.good, bitter: C.bad };

export default function History({ shots, epochStart, onDelete, onToggleExclude, readOnly }) {
  const list = [...shots].reverse();
  const [armed, setArmed] = useState(null); // web: tap twice to delete (browser dialogs may be blocked)
  const confirmDelete = s => {
    if (Platform.OS === 'web') { if (armed === s.id) { setArmed(null); onDelete(s.id); } else setArmed(s.id); return; }
    Alert.alert('Delete this shot?', 'It will be removed from the calibration history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(s.id) },
    ]);
  };
  return (
    <Card>
      <H2>Shot history</H2>
      {!list.length ? <Body muted>No shots for this grinder and coffee yet.</Body> : null}
      {list.map(s => (
        <View key={s.id} style={[st.row, epochStart && s.ts < epochStart && { opacity: 0.55 }]}>
          <View style={st.top}>
            <Text style={st.date}>{new Date(s.ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {new Date(s.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}{s.mode === 'adjust' ? ' · adjust' : s.mode === 'new' ? ' · dial-in' : ''}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {s.kind === 'dose' ? <Text style={[st.pill, { color: C.muted, borderColor: C.line }]}>dose check</Text>
                : s.role === 'verified' ? <Text style={[st.pill, { color: C.good, borderColor: C.good }]}>verified</Text>
                : s.role === 'test' ? <Text style={[st.pill, { color: C.muted, borderColor: C.line }]}>test</Text> : null}
              {s.taste ? <Text style={[st.pill, { color: TASTE_COLOR[s.taste], borderColor: TASTE_COLOR[s.taste] }]}>{s.taste}</Text> : null}
            </View>
          </View>
          {s.kind === 'dose' ? (
            <Text style={st.main}>Dial <Text style={st.b}>{s.setting}</Text> · grinder dropped {fmt(s.ground)} g in {fmtSec(s.doserTime)} s</Text>
          ) : (
            <Text style={st.main}>
              Dial <Text style={st.b}>{s.setting}</Text> · {fmt(s.time)} s · {fmt(s.dose)} g → {fmt(s.yield)} g
              {s.dose ? ` (1:${fmt(s.yield / s.dose)})` : ''}
            </Text>
          )}
          {s.secPerSubdivision != null ? <Text style={st.sub}>From {s.prevSetting}: {Math.abs(s.stepsFiner)} notch{Math.abs(s.stepsFiner) === 1 ? '' : 'es'} {s.stepsFiner > 0 ? 'finer' : 'coarser'} · {fmt(Math.abs(s.secPerSubdivision), 2)} s per notch</Text> : null}
          {s.excluded ? (
            <View style={{ flexDirection: 'row', gap: S.md, alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={[st.sub, { color: C.warn, flexShrink: 1 }]}>Set aside: {s.excludedWhy || 'invalid'}</Text>
              {!readOnly && onToggleExclude ? <Pressable onPress={() => onToggleExclude(s.id)} hitSlop={8}><Text style={st.link}>Include again</Text></Pressable> : null}
            </View>
          ) : null}
          {s.ground != null && Math.abs(s.ground - s.dose) > 1e-6 ? <Text style={st.sub}>Grinder dropped {fmt(s.ground)} g{s.toppedUp ? `, topped up to ${fmt(s.dose)} g` : ''}</Text> : null}
          {s.predTime != null ? <Text style={st.sub}>Predicted {fmt(s.predTime)} s · off by {fmt(Math.abs(s.time - s.predTime))} s</Text> : null}
          <Text style={st.sub}>
            Doser {s.doserTime != null ? fmtSec(s.doserTime) + ' s' : '–'} · Room {s.roomTemp != null ? fmt(s.roomTemp) + ' °C' : '–'} · {s.humidity != null ? fmt(s.humidity, 0) + '%' : '–'} RH{s.workload != null ? ' · ' + LOADS[s.workload] : ''}
          </Text>
          {epochStart && s.ts < epochStart ? <Text style={st.sub}>Before the grinder was recalibrated · not used</Text> : null}
          {s.notes ? <Text style={st.sub}>{s.notes}</Text> : null}
          {!readOnly ? <Pressable onPress={() => confirmDelete(s)} hitSlop={8}><Text style={st.del}>{armed === s.id ? 'Tap again to delete' : 'Delete'}</Text></Pressable> : null}
        </View>
      ))}
    </Card>
  );
}

const st = StyleSheet.create({
  row: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: S.md, gap: 3 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { color: C.muted, fontSize: 12 },
  pill: { borderWidth: 1, borderRadius: R.pill, paddingHorizontal: 8, fontSize: 11, overflow: 'hidden' },
  main: { color: C.ink, fontSize: 15 },
  b: { fontWeight: '800', color: C.teal },
  sub: { color: C.muted, fontSize: 12 },
  del: { color: C.bad, fontSize: 12, marginTop: 2 },
  link: { color: C.accentBright, fontSize: 12, fontWeight: '700' },
});
