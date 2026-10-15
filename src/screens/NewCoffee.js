import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Card, Button, Body, Label } from '../components/ui';
import { Stepper } from '../components/visuals';
import CoffeeForm, { coffeeLine } from '../components/CoffeeForm';
import { num, fmt } from '../engine';
import { DEFAULTS } from '../model';

const STEPS = ['Coffee', 'Dose', 'Targets'];

/**
 * Mode 1 · Dial in a new coffee. Choose the coffee, fix the dose, set targets, then the shot loop
 * takes over (ShotLoop) until the shot is in the band and the calibration is saved.
 */
export default function NewCoffee({ grinder, coffees, onCreateCoffee, onStart, onCancel, preset }) {
  const [step, setStep] = useState(preset && preset.coffeeId ? 1 : 0);
  const [coffeeId, setCoffeeId] = useState(preset && preset.coffeeId ? preset.coffeeId : null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ dose: String(preset?.dose ?? DEFAULTS.dose), tol: String(DEFAULTS.tol), yield: String(preset?.yield ?? DEFAULTS.yield), tLo: String(DEFAULTS.tLo), tHi: String(DEFAULTS.tHi) });
  const [err, setErr] = useState('');
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  const list = coffees.filter(c => !c.archived);
  const chosen = coffees.find(c => c.id === coffeeId);

  const start = () => {
    const dose = num(f.dose), tol = num(f.tol), y = num(f.yield), lo = num(f.tLo), hi = num(f.tHi);
    if (dose === null || dose <= 0) return setErr('Set a dose.');
    if (y === null || y <= 0) return setErr('Set a beverage yield.');
    if (lo === null || hi === null || hi <= lo) return setErr('Set a target band, e.g. 28 to 32 s.');
    onStart({ mode: 'new', coffeeId, dose, tol: tol ?? DEFAULTS.tol, yield: y, tLo: lo, tHi: hi });
  };

  return (
    <View style={{ gap: S.lg }}>
      <View style={st.steps}>
        {STEPS.map((s, i) => (
          <View key={s} style={[st.stepPill, i === step && st.stepOn, i < step && st.stepDone]}>
            <Text style={[st.stepText, i === step ? { color: C.onAccent } : i < step && { color: C.ink }]}>{i + 1} {s}</Text>
          </View>
        ))}
      </View>

      {step === 0 ? (
        <Card>
          <Text style={st.h}>WHICH COFFEE?</Text>
          <Body muted>Dialling in on {grinder.name}. Choose a saved coffee or add a new one.</Body>
          {adding || !list.length ? (
            <CoffeeForm existing={coffees} onSave={c => { const id = onCreateCoffee(c); setCoffeeId(id); setAdding(false); setStep(1); }}
              onCancel={list.length ? () => setAdding(false) : null} />
          ) : (
            <>
              {list.map(c => (
                <Pressable key={c.id} onPress={() => { setCoffeeId(c.id); setStep(1); }} style={[st.row, c.id === coffeeId && st.rowOn]}>
                  <Text style={st.rowTitle}>{c.name}</Text>
                  {coffeeLine(c) ? <Text style={st.small}>{coffeeLine(c)}</Text> : null}
                </Pressable>
              ))}
              <Button title="＋ Add a new coffee" kind="secondary" onPress={() => setAdding(true)} />
            </>
          )}
          <Button title="Cancel" kind="link" onPress={onCancel} />
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <Text style={st.h}>CONFIRM YOUR DOSE</Text>
          <Body>The dose stays the same for the whole dial-in. 18 g is a good start.</Body>
          <View style={st.steppers}>
            <Stepper label="DOSE" unit="g" value={f.dose} onChange={set('dose')} step={0.1} />
                      </View>
          <Button title="Next: targets" onPress={() => setStep(2)} />
          <Button title="‹ Back" kind="link" onPress={() => setStep(0)} />
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <Text style={st.h}>SET YOUR TARGETS</Text>
          <Body muted>{chosen ? chosen.name + ' · ' : ''}Change these if your recipe is different.</Body>
          <View style={st.steppers}>
            <Stepper label="YIELD" unit="g" value={f.yield} onChange={set('yield')} step={0.1} />
            <Stepper label="TIME FROM" unit="s" value={f.tLo} onChange={set('tLo')} step={1} decimals={0} />
            <Stepper label="TIME TO" unit="s" value={f.tHi} onChange={set('tHi')} step={1} decimals={0} />
          </View>
          <Body>Target: {fmt(num(f.dose))} g in → {fmt(num(f.yield))} g out (1:{fmt(num(f.yield) / num(f.dose))}) in {fmt(num(f.tLo), 0)}–{fmt(num(f.tHi), 0)} s.</Body>
          <Body muted style={{ fontSize: 13 }}>Time every shot from when the pump starts.</Body>
          {err ? <Text style={{ color: C.bad }}>{err}</Text> : null}
          <Button title="Start dialling in" onPress={start} />
          <Button title="‹ Back" kind="link" onPress={() => setStep(1)} />
        </Card>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  h: { color: C.ink, fontSize: 15, fontWeight: '800', letterSpacing: 0.8 },
  small: { color: C.muted, fontSize: 12 },
  steps: { flexDirection: 'row', gap: S.sm },
  stepPill: { flex: 1, paddingVertical: 8, borderRadius: R.pill, borderWidth: 1, borderColor: C.line, alignItems: 'center', backgroundColor: C.surface },
  stepOn: { backgroundColor: C.accent, borderColor: C.accent },
  stepDone: { backgroundColor: C.accentSoft, borderColor: C.accentLine },
  stepText: { color: C.muted, fontWeight: '700', fontSize: 13 },
  row: { borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.md, gap: 2, backgroundColor: C.surface2 },
  rowOn: { borderColor: C.accent },
  rowTitle: { color: C.ink, fontWeight: '700', fontSize: 16 },
  steppers: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
});
