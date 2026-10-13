import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { C, S } from '../theme';
import { Field, Grid, Button } from './ui';

export const COFFEE_FIELDS = [
  ['producer', 'Producer / farm'], ['variety', 'Variety'], ['process', 'Process'],
  ['roastLevel', 'Roast level'], ['altitude', 'Altitude'], ['notes', 'Notes'],
];

/** New coffee profile. Only the name is required; roaster, origin and roast date are asked up front. */
export default function CoffeeForm({ onSave, onCancel, existing }) {
  const [f, setF] = useState({ name: '', roaster: '', origin: '', roastDate: '' });
  const [more, setMore] = useState(false);
  const [err, setErr] = useState('');
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  const save = () => {
    const name = f.name.trim();
    if (!name) return setErr('Give the coffee a name, e.g. Rusty\'s Roast.');
    if (existing.some(c => !c.archived && c.name.trim().toLowerCase() === name.toLowerCase())) return setErr(`You already have ${name}. Pick it from the list, or add a version, e.g. "${name} – new crop".`);
    const out = {};
    Object.entries(f).forEach(([k, v]) => { out[k] = typeof v === 'string' ? v.trim() : v; });
    onSave({ ...out, name });
  };
  return (
    <View style={{ gap: S.md }}>
      <Grid>
        <Field label="Coffee name" value={f.name} onChangeText={set('name')} keyboardType="default" width="full" placeholder="e.g. Rusty's Roast" />
        <Field label="Roaster" value={f.roaster} onChangeText={set('roaster')} keyboardType="default" placeholder="e.g. Barista Life" />
        <Field label="Origin" value={f.origin} onChangeText={set('origin')} keyboardType="default" placeholder="e.g. Ethiopia" />
        <Field label="Roast date" value={f.roastDate} onChangeText={set('roastDate')} keyboardType="default" placeholder="e.g. 6 Oct" width="full" />
      </Grid>
      <Pressable onPress={() => setMore(!more)}><Text style={st.disc}>{more ? '▾' : '▸'} More details (optional)</Text></Pressable>
      {more ? (
        <Grid>{COFFEE_FIELDS.map(([k, l]) => (
          <Field key={k} label={l} value={f[k] || ''} onChangeText={set(k)} keyboardType="default" width={k === 'notes' ? 'full' : 'half'} />
        ))}</Grid>
      ) : null}
      <Text style={st.hint}>Roast date matters most: shots tend to slow down as beans age off roast.</Text>
      {err ? <Text style={{ color: C.bad }}>{err}</Text> : null}
      <Button title="Save coffee" onPress={save} />
      {onCancel ? <Button title="Cancel" kind="link" onPress={onCancel} /> : null}
    </View>
  );
}

export function coffeeLine(c) {
  return [c.roaster, c.origin, c.roastDate ? `roasted ${c.roastDate}` : ''].filter(Boolean).join(' · ');
}

const st = StyleSheet.create({
  disc: { color: C.ink, fontWeight: '700', fontSize: 14 },
  hint: { color: C.muted, fontSize: 12 },
});
