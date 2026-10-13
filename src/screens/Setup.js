import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, S } from '../theme';
import { Card, Field, Label, Chips, Button, Body, Note, Segmented } from '../components/ui';
import { MODELS, tierOf, canRegisterGrinder } from '../engine';

/** First run, and "Register a grinder": set up a grinder, or explore with sample shots. */
export default function Setup({ tier, grinders, hasSample, onRegister, onSample, onClose, onSeePlans, first }) {
  const [model, setModel] = useState('Mythos One');
  const [name, setName] = useState('');
  const [gauge, setGauge] = useState(null);
  const [err, setErr] = useState('');
  const allowed = canRegisterGrinder(tier, grinders);

  const add = () => {
    const n = name.trim() || (model === 'Other' ? '' : model);
    if (!n) { setErr('Give this grinder a name, e.g. Mahlkönig E65S.'); return; }
    if (grinders.some(g => g.name.trim().toLowerCase() === n.toLowerCase())) {
      setErr(`You already have a grinder called ${n}. Give this one a different name, e.g. "${n} – bar 2".`); return;
    }
    if (gauge === null) { setErr('Tell us whether you have a temperature and humidity gauge.'); return; }
    onRegister(n, model, gauge);
  };

  return (
    <View style={{ gap: S.lg }}>
      <Card>
        <Text style={st.h}>{first ? 'SET UP YOUR GRINDER' : 'REGISTER A GRINDER'}</Text>
        {!allowed ? (
          <>
            <Note><Text style={{ fontWeight: '700' }}>The {tierOf(tier).label} plan includes 1 grinder. </Text>Every plan uses the same calibration engine. Business lets you register as many grinders as you need, each with its own coffees and calibration history.</Note>
            <Button title="See plans" onPress={onSeePlans} />
          </>
        ) : (
          <>
            <Body muted>Register the grinder you dial in on. Each grinder keeps its own calibration history, even two of the same model.</Body>
            <View><Label>Model</Label><Chips items={MODELS.map(m => ({ key: m, label: m }))} value={model} onChange={setModel} /></View>
            <Field label="Name" value={name} onChangeText={setName} keyboardType="default" width="full"
              placeholder={model === 'Other' ? 'e.g. Mahlkönig E65S' : `e.g. ${model} – bar 1`} />
            <View style={{ gap: 6 }}>
              <Label>Do you have a temperature and humidity gauge?</Label>
              <Segmented options={[{ value: true, label: 'Yes, I can measure' }, { value: false, label: "No, I don't" }]} value={gauge} onChange={setGauge} />
              <Body muted style={{ fontSize: 12 }}>Dial In works fully without one. You can change this later.</Body>
            </View>
            {err ? <Text style={{ color: C.bad }}>{err}</Text> : null}
            <Button title="Register grinder" onPress={add} />
            <Body muted style={{ fontSize: 12 }}>Mythos One and Compak E6 start with their known dial layout. Settings are always worked out from your own grinder, never from another one.</Body>
          </>
        )}
        {!first ? <Button title="Close" kind="secondary" onPress={onClose} /> : null}
      </Card>

      {!hasSample ? (
        <Card>
          <Text style={st.h}>JUST LOOKING?</Text>
          <Body muted>Load 16 sample shots on a Mythos One to see the app working. Sample shots don't count towards your plan, and you can remove them in Account.</Body>
          <Button title="Explore with sample shots" kind="secondary" onPress={onSample} />
        </Card>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  h: { color: C.ink, fontSize: 15, fontWeight: '800', letterSpacing: 0.8 },
});
