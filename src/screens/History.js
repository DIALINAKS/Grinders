import React from 'react';
import { View, Text, Pressable, Alert, Platform, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Card, H2, Body } from '../components/ui';
import { fmt } from '../engine';

const LOADS = ['Quiet', 'Steady', 'Busy'];
const TASTE_COLOR = { sour: C.warn, balanced: C.good, bitter: C.bad };

export default function History({ shots, epochStart, onDelete, readOnly }) {
  const list = [...shots].reverse();
  const confirmDelete = s => {
    if (Platform.OS === 'web') { if (typeof window !== 'undefined' && window.confirm('Delete this shot?')) onDelete(s.id); return; }
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
            {s.taste ? <Text style={[st.pill, { color: TASTE_COLOR[s.taste], borderColor: TASTE_COLOR[s.taste] }]}>{s.taste}</Text> : null}
          </View>
          <Text style={st.main}>
            Dial <Text style={st.b}>{s.setting}</Text> · {fmt(s.time)} s · {fmt(s.dose)} g → {fmt(s.yield)} g
            {s.dose ? ` (1:${fmt(s.yield / s.dose)})` : ''}
          </Text>
          {s.predTime != null ? <Text style={st.sub}>Predicted {fmt(s.predTime)} s · off by {fmt(Math.abs(s.time - s.predTime))} s</Text> : null}
          <Text style={st.sub}>
            Doser {s.doserTime != null ? fmt(s.doserTime) + ' s' : '–'} · Room {s.roomTemp != null ? fmt(s.roomTemp) + ' °C' : '–'} · {s.humidity != null ? fmt(s.humidity, 0) + '%' : '–'} RH{s.workload != null ? ' · ' + LOADS[s.workload] : ''}
          </Text>
          {epochStart && s.ts < epochStart ? <Text style={st.sub}>Before the grinder was recalibrated · not used</Text> : null}
          {s.notes ? <Text style={st.sub}>{s.notes}</Text> : null}
          {!readOnly ? <Pressable onPress={() => confirmDelete(s)} hitSlop={8}><Text style={st.del}>Delete</Text></Pressable> : null}
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
  b: { fontWeight: '800', color: C.accentBright },
  sub: { color: C.muted, fontSize: 12 },
  del: { color: C.bad, fontSize: 12, marginTop: 2 },
});
