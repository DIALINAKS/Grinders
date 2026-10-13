import React from 'react';
import { View } from 'react-native';
import { S } from '../theme';
import { Card, Field, Grid, Label, Segmented, H2, Body, Chips } from '../components/ui';
import { rulesFor } from '../engine';

const MARKS = [10, 8, 6, 5, 4, 3, 2];

/** Grinder rules: the barista's starting points. Logged shots refine them over time. */
export default function Rules({ grinder, onChange, readOnly }) {
  const r = rulesFor(grinder);
  const set = k => v => onChange({ ...r, [k]: v });
  return (
    <Card>
      <H2>Rules for {grinder.name}</H2>
      <Body muted>These are your starting points. The app refines them as you log shots.{readOnly ? ' This grinder is archived, so its rules are read-only.' : ''}</Body>

      <View>
        <Label>Marks between numbers on the dial</Label>
        <Chips items={MARKS.map(m => ({ key: String(m), label: m === 10 ? '10 (tenths)' : String(m) }))}
          value={String(r.marks)} onChange={readOnly ? () => {} : set('marks')} />
      </View>
      <Grid>
        <Field label="Extraction seconds per notch" value={r.step} onChangeText={set('step')} editable={!readOnly} />
        <Field label="Room climate °C per notch" value={r.deg} onChangeText={set('deg')} editable={!readOnly} />
        <Field label="Humidity that equals 1 °C (% RH)" value={r.humEq} onChangeText={set('humEq')} editable={!readOnly} />
        <Field label="Dose time per notch finer (s)" value={r.doserNotch} onChangeText={set('doserNotch')} placeholder="Blank = learn it" editable={!readOnly} />
        <Field label="Saved doser presets (s)" value={r.presets} onChangeText={set('presets')} keyboardType="default" placeholder="e.g. 5.8, 6.0, 6.2" width="full" editable={!readOnly} />
      </Grid>
      <View style={{ gap: S.sm }}>
        <Label>Finer on this grinder is</Label>
        <Segmented disabled={readOnly} options={[{ value: 'lower', label: 'A lower number' }, { value: 'higher', label: 'A higher number' }]} value={r.dir} onChange={set('dir')} />
      </View>
      <View style={{ gap: S.sm }}>
        <Label>When the room warms up</Label>
        <Segmented disabled={readOnly} options={[{ value: 'finer', label: 'Go finer' }, { value: 'coarser', label: 'Go coarser' }]} value={r.warm} onChange={set('warm')} />
      </View>
      <View style={{ gap: S.sm }}>
        <Label>Burrs</Label>
        <Segmented disabled={readOnly} options={[{ value: 'fan', label: 'Fan-cooled' }, { value: 'controlled', label: 'Temp-controlled' }]} value={r.burr} onChange={set('burr')} />
        <Body muted>{r.burr === 'fan' ? 'Workload heats and expands the burrs, so the app corrects coarser when it gets busy (e.g. Compak E6).' : 'Workload has no effect on these burrs (e.g. Mythos One).'}</Body>
      </View>
      {r.burr === 'fan' ? (
        <Field label="Each step busier: marks coarser (0.25 = ¼ mark)" value={r.loadMarks} onChangeText={set('loadMarks')} placeholder="Blank = learn it" width="full" editable={!readOnly} />
      ) : null}
    </Card>
  );
}
