import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Card, H2, Body, Button } from '../components/ui';
import { activeGrinders, tierOf } from '../engine';

/** Shown after a downgrade: keep one grinder active, archive the rest read-only. */
export default function ArchivePick({ tier, grinders, shots, onKeep }) {
  const act = activeGrinders(grinders);
  const [keep, setKeep] = useState(act[0] ? act[0].id : null);
  return (
    <Card>
      <H2>Choose your active grinder</H2>
      <Body muted>The {tierOf(tier).label} plan includes 1 active grinder. Choose the one to keep using. The others are archived read-only, with all their shots and settings kept, and come back if you move to Business.</Body>
      {act.map(g => {
        const on = g.id === keep;
        return (
          <Pressable key={g.id} onPress={() => setKeep(g.id)} style={[st.row, on && st.rowOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
            <View style={[st.dot, on && st.dotOn]} />
            <Text style={st.name}>{g.name}</Text>
            <Text style={st.count}>{shots.filter(s => s.grinderId === g.id).length} shots</Text>
          </Pressable>
        );
      })}
      <Button title="Keep this grinder active" onPress={() => keep && onKeep(keep)} />
    </Card>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.md },
  rowOn: { borderColor: C.accent, backgroundColor: C.accentSoft },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.muted },
  dotOn: { borderColor: C.accentBright, backgroundColor: C.accentBright },
  name: { color: C.ink, fontWeight: '700', flex: 1 },
  count: { color: C.muted },
});
