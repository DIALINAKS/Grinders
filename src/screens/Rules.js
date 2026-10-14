import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { C, S } from '../theme';
import { Card, Field, Grid, Label, Segmented, H2, Body, Chips, Button } from '../components/ui';
import { rulesFor } from '../engine';

const MARKS = [10, 8, 6, 5, 4, 3, 2];
const REASONS = ['Burr change', 'Service', 'Dial zero reset', 'Other'];

/** Grinder settings: dial layout, benchmarks (replaced by measured values as shots build), gauge, recalibration. */
export default function Rules({ grinder, onChange, readOnly, onGauge, onRecalibrate }) {
  const r = rulesFor(grinder);
  const set = k => v => onChange({ ...r, [k]: v });
  const [reason, setReason] = useState(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <View style={{ gap: S.lg }}>
      <Card>
        <H2>{grinder.name}</H2>
        <Body muted>{readOnly ? 'This grinder is archived, so its settings are read-only.' : 'How this grinder\'s dial works, and the benchmarks the app starts from.'}</Body>

        <View>
          <Label>Marks between numbers on the dial</Label>
          <Chips items={MARKS.map(m => ({ key: String(m), label: m === 10 ? '10 (tenths)' : String(m) }))}
            value={String(r.marks)} onChange={readOnly ? () => {} : set('marks')} />
        </View>
        <View style={{ gap: S.sm }}>
          <Label>Finer on this grinder is</Label>
          <Segmented disabled={readOnly} options={[{ value: 'lower', label: 'A lower number' }, { value: 'higher', label: 'A higher number' }]} value={r.dir} onChange={set('dir')} />
        </View>
        <View style={{ gap: S.sm }}>
          <Label>Burrs</Label>
          <Segmented disabled={readOnly} options={[{ value: 'fan', label: 'Fan-cooled' }, { value: 'controlled', label: 'Temp-controlled' }]} value={r.burr} onChange={set('burr')} />
          <Body muted>{r.burr === 'fan' ? 'Workload heats and expands the burrs, so the app corrects coarser when it gets busy (e.g. Compak E6).' : 'Workload has no effect on these burrs (e.g. Mythos One).'}</Body>
        </View>
        <View style={{ gap: S.sm }}>
          <Label>Temperature and humidity gauge</Label>
          <Segmented disabled={readOnly} options={[{ value: true, label: 'Yes, I can measure' }, { value: false, label: "No, I don't" }]} value={grinder.gauge} onChange={onGauge} />
          <Body muted>{grinder.gauge === false ? 'Room corrections are off. The app works from grind and extraction time only.' : 'Room readings are logged with each shot and used once there is enough evidence.'}</Body>
        </View>
      </Card>

      <Card>
        <H2>Benchmarks</H2>
        <Body muted>Starting values only. Each is replaced by this grinder's measured figure as shots build up; recommendations say whether they rest on a benchmark or on measured data.</Body>
        <Grid>
          <Field label="Extraction seconds per number" value={r.step} onChangeText={set('step')} editable={!readOnly} />
          <Field label="Room °C per number" value={r.deg} onChangeText={set('deg')} editable={!readOnly} />
          <Field label="% RH that equals 1 °C" value={r.humEq} onChangeText={set('humEq')} editable={!readOnly} />
          {r.burr === 'fan' ? <Field label="Busier step: marks coarser" value={r.loadMarks} onChangeText={set('loadMarks')} placeholder="Blank = learn it" editable={!readOnly} /> : null}
        </Grid>
        <View style={{ gap: S.sm }}>
          <Label>When the room warms up</Label>
          <Segmented disabled={readOnly} options={[{ value: 'finer', label: 'Go finer' }, { value: 'coarser', label: 'Go coarser' }]} value={r.warm} onChange={set('warm')} />
        </View>
        <View style={{ gap: S.sm }}>
          <Label>Dose time</Label>
          <Grid>
            <Field label="Doser seconds per notch (optional)" value={r.doserNotch} onChangeText={set('doserNotch')} placeholder="Leave blank: learned" editable={!readOnly} />
            <Field label="Saved doser presets (s)" value={r.presets} onChangeText={set('presets')} keyboardType="default" placeholder="e.g. 5.8, 6.0, 6.2" editable={!readOnly} />
          </Grid>
          <Body muted style={{ fontSize: 12 }}>Leave "doser seconds per notch" blank: Dial In learns it from the drops your baristas weigh. Only fill it in to override, e.g. a figure from the grinder's manufacturer.</Body>
        </View>
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
