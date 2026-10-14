import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { C, S } from '../theme';
import { Card, Field, Grid, Label, Segmented, H2, Body, Chips, Button } from '../components/ui';
import { rulesFor } from '../engine';

const MARKS = [10, 8, 6, 5, 4, 3, 2];
const REASONS = ['Burr change', 'Service', 'Dial zero reset', 'Other'];
const STEPS = [{ value: 1, label: '1 subdivision' }, { value: 0.5, label: '½' }, { value: 0.25, label: '¼' }];

/** Grinder settings: dial layout, smallest step, gauge, optional house rules, recalibration. */
export default function Rules({ grinder, onChange, readOnly, onGauge, onRecalibrate }) {
  const r = rulesFor(grinder);
  const set = k => v => onChange({ ...r, [k]: v });
  const [reason, setReason] = useState(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <View style={{ gap: S.lg }}>
      <Card>
        <H2>{grinder.name}</H2>
        <Body muted>{readOnly ? 'This grinder is archived, so its settings are read-only.' : 'How this grinder\'s dial works.'}</Body>

        <View>
          <Label>Subdivisions between numbers on the dial</Label>
          <Chips items={MARKS.map(m => ({ key: String(m), label: m === 10 ? '10 (tenths)' : String(m) }))}
            value={String(r.marks)} onChange={readOnly ? () => {} : set('marks')} />
        </View>
        <View style={{ gap: S.sm }}>
          <Label>Smallest step you can set reliably</Label>
          <Segmented disabled={readOnly} options={STEPS} value={Number(r.minStep) || 1} onChange={set('minStep')} />
          <Body muted style={{ fontSize: 12 }}>Instructions are always given in steps this size, so the app never asks for a move you can't make.</Body>
        </View>
        <View style={{ gap: S.sm }}>
          <Label>Finer on this grinder is</Label>
          <Segmented disabled={readOnly} options={[{ value: 'lower', label: 'A lower number' }, { value: 'higher', label: 'A higher number' }]} value={r.dir} onChange={set('dir')} />
        </View>
        <View style={{ gap: S.sm }}>
          <Label>Burrs</Label>
          <Segmented disabled={readOnly} options={[{ value: 'fan', label: 'Fan-cooled' }, { value: 'controlled', label: 'Temp-controlled' }]} value={r.burr} onChange={set('burr')} />
          <Body muted>{r.burr === 'fan' ? 'The app records how busy the grinder is and learns whether that changes the grind (e.g. Compak E6).' : 'Workload is not expected to change these burrs (e.g. Mythos One).'}</Body>
        </View>
        <View style={{ gap: S.sm }}>
          <Label>Temperature and humidity gauge</Label>
          <Segmented disabled={readOnly} options={[{ value: true, label: 'Yes, I can measure' }, { value: false, label: "No, I don't" }]} value={grinder.gauge} onChange={onGauge} />
          <Body muted>{grinder.gauge === false ? 'Room corrections are off. The app works from grind and extraction time only.' : 'Room readings are logged with every shot. Their effect on this grinder is only used once it has been measured.'}</Body>
        </View>
        <View style={{ gap: S.sm }}>
          <Label>Dose time</Label>
          <Grid>
            <Field label="Saved doser presets (s)" value={r.presets} onChangeText={set('presets')} keyboardType="default" placeholder="e.g. 5.8, 6.0, 6.2" editable={!readOnly} width="full" />
          </Grid>
          <Body muted style={{ fontSize: 12 }}>The doser time is worked out from the drops your baristas weigh. Nothing to enter.</Body>
        </View>
      </Card>

      <Card>
        <H2>House rules</H2>
        <Body muted>Off by default. Dial In works out every figure from this grinder's own measurements. A manager can switch on fixed rules of thumb here; anything based on them is labelled "house rule" and never shown as verified.</Body>
        <Segmented disabled={readOnly} options={[{ value: false, label: 'Off (measured only)' }, { value: true, label: 'On' }]} value={!!r.houseRules} onChange={set('houseRules')} />
        {r.houseRules ? (
          <>
            <Grid>
              <Field label="Extraction seconds per number" value={r.step} onChangeText={set('step')} editable={!readOnly} />
              <Field label="Room °C per number" value={r.deg} onChangeText={set('deg')} editable={!readOnly} />
              <Field label="% RH that equals 1 °C" value={r.humEq} onChangeText={set('humEq')} editable={!readOnly} />
              {r.burr === 'fan' ? <Field label="Busier step: subdivisions coarser" value={r.loadMarks} onChangeText={set('loadMarks')} editable={!readOnly} /> : null}
              <Field label="Doser seconds per subdivision" value={r.doserNotch} onChangeText={set('doserNotch')} placeholder="Blank: learned" editable={!readOnly} />
            </Grid>
            <View style={{ gap: S.sm }}>
              <Label>When the room warms up</Label>
              <Segmented disabled={readOnly} options={[{ value: 'finer', label: 'Go finer' }, { value: 'coarser', label: 'Go coarser' }]} value={r.warm} onChange={set('warm')} />
            </View>
          </>
        ) : null}
      </Card>

      {!readOnly && onRecalibrate ? (
        <Card tone="warn">
          <H2>Recalibrate this grinder</H2>
          <Body muted>After new burrs, a service or a reset of the dial's zero, old settings no longer apply. Recalibrating starts a fresh history for this grinder. Earlier shots stay in History but are no longer used, and each coffee is dialled in again.</Body>
          <Chips items={REASONS.map(x => ({ key: x, label: x }))} value={reason} onChange={x => { setReason(x); setConfirm(false); }} />
          {!confirm ? <Button title="Recalibrate grinder" kind="secondary" disabled={!reason} onPress={() => setConfirm(true)} />
            : (
              <View style={{ gap: S.sm }}>
                <Text style={{ color: C.warn }}>Start a fresh calibration for {grinder.name}? Saved coffee settings on this grinder will need dialling in again.</Text>
                <Button title={`Yes, recalibrate (${reason.toLowerCase()})`} onPress={() => onRecalibrate(reason.toLowerCase())} />
                <Button title="Cancel" kind="link" onPress={() => setConfirm(false)} />
              </View>
            )}
        </Card>
      ) : null}
    </View>
  );
}
