import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Note } from './ui';
import { Gauge, Pill } from './visuals';
import { fmt, rulesFor, fmtDoser } from '../engine';

const CONF_TONE = { High: 'good', Moderate: 'accent', Low: 'warn' };
const LABEL_TONE = { 'Verified recommendation': 'good', 'Provisional recommendation': 'accent', 'Insufficient data': 'warn' };

/** Confidence level and what the advice is based on. Always shown with a recommendation. */
export function Basis({ r, compact }) {
  return (
    <View style={st.basis}>
      <View style={st.pills}>
        {r.label ? <Pill tone={LABEL_TONE[r.label]}>{r.label}</Pill> : null}
        {!r.guided ? <Pill tone={CONF_TONE[r.confidence]}>Confidence: {r.confidence}</Pill> : null}
      </View>
      <Text style={st.basisText}>Based on: {r.sourceText}</Text>
      {r.guided ? <Text style={st.note}>This grinder hasn't been measured on this coffee yet, so this is a fixed step of 2 notches, not a prediction. The next shot measures how this grinder responds.</Text>
        : r.dial.conservative ? <Text style={st.note}>Using a house rule until this grinder is measured.</Text> : null}
      {r.tier === 'provisional' ? <Text style={st.note}>Limited data so far: confirm it with the next shot.</Text> : null}
      {r.micro ? <Text style={st.note}>Micro-adjustment: still inside your band, but your recorded shots show this change moves it clearly off {fmt(r.target, 0)} s. This is the smallest step that brings it back.</Text> : null}
      {!compact && r.uncertain && r.uncertain.length ? <Text style={st.note}>Still learning how {r.uncertain.join('; ')} affects this grinder. The prediction uses what your shots show so far: every result sharpens it.</Text> : null}
    </View>
  );
}

/** Grind setting on the dial, the move, doser time and why. */
export default function Recommendation({ r, M, grinder, onChangeRules, compact }) {
  if (r.status === 'no-shots') return <Note>Pull your first shot, then the app tells you what to change.</Note>;
  if (r.status === 'need-more') return <Note>Insufficient data: pull a shot at the current setting and record it. Dial In measures this grinder from your shots.</Note>;
  if (r.status === 'no-target') return <Note>Set your target time band.</Note>;
  if (r.status === 'flat') return <Note tone="warn">Changing the grind isn't moving the time much yet. Try shots further apart on the dial.</Note>;
  const d = r.dial, ds = r.dose;
  const rules = rulesFor(grinder), fd = v => fmtDoser(v, rules);
  const rawRule = (grinder.rules || {}).doserNotch;
  let doseWhy;
  const learned = ds.perNotchSource === 'learned from your weighed drops';
  if (ds.seconds == null) doseWhy = 'Enter the doser time with your shot and Dial In works this out.';
  else if (ds.unknownPerNotch) doseWhy = `Based on your last drop. If the next drop isn't ${fmt(ds.target)} g, choose "No" and enter what it weighed: Dial In corrects the doser and, after drops at two grind settings, adjusts it for every grind move by itself.`;
  else if (Math.abs(ds.gapNotches || 0) < 1e-6) doseWhy = ds.lastGrams != null && ds.target != null && Math.abs(ds.lastGrams - ds.target) > 0.05
    ? (ds.change ? `Last drop was ${fmt(ds.lastGrams)} g on ${fd(ds.lastSeconds)} s. This time drops ${fmt(ds.target)} g.`
      : `Last drop was ${fmt(ds.lastGrams)} g on ${fd(ds.lastSeconds)} s: within one doser step of ${fmt(ds.target)} g, so the time stays the same.`)
    : `Drops your ${fmt(ds.target)} g dose.`;
  else if (!ds.change) doseWhy = `Grind move too small to change the doser time.`;
  else doseWhy = `${ds.change > 0 ? '+' : '−'}${fd(Math.abs(ds.change))} s for the grind move, so it still drops ${fmt(ds.target)} g${learned ? ` (learned from ${ds.drops ? ds.drops.n : 'your'} weighed drops)` : ' (house rule)'}.`;

  return (
    <View style={{ gap: S.md }}>
      <Gauge value={d.value} anchor={d.anchorValue} M={M}>
        <Text style={st.big}>{d.text}</Text>
        <Text style={st.words}>{d.words}</Text>
      </Gauge>
      <Pill tone="accent">{d.moveShort === 'hold' ? `Stay on ${d.anchorText}` : `From ${d.anchorText} · ${d.moveShort}`}</Pill>
      {d.reason ? <Text style={st.reason}>{d.reason}</Text> : null}
      {d.capped ? <Text style={[st.reason, { color: C.warn }]}>{d.conservative ? 'Capped at half a number until this grinder is measured.' : 'Capped at one number. Pull a shot here and check before going further.'}</Text> : null}
      <Basis r={r} compact={compact} />

      <View style={st.doseTile}>
        <Text style={st.tileLabel}>DOSE TIME</Text>
        <Text style={st.doseBig}>{ds.seconds != null ? fd(ds.seconds) : '–'}<Text style={st.unit}>{ds.seconds != null ? ' s' : ''}</Text></Text>
        {ds.preset ? <Text style={st.tileSub}>{ds.preset.text}</Text> : null}
        <Text style={st.tileSub}>{doseWhy}</Text>
        {ds.rateNow ? <Text style={st.tileSub}>1 s of doser ≈ {fmt(ds.rateNow, 2)} g{ds.room && (ds.room.perC || ds.room.perRH) ? ' in today\'s room' : ''}</Text> : null}
        {ds.roomSec && Math.abs(ds.roomSec) >= 0.05 ? <Text style={st.tileSub}>Room: {ds.roomSec > 0 ? '+' : '−'}{fd(Math.abs(ds.roomSec))} s for today's temperature and humidity{ds.room && !(ds.room.roomTemp.measured || ds.room.humidity.measured) ? ' (still learning from your weighed drops)' : ''}.</Text> : null}
      </View>

      <View style={st.tiles}>
        <View style={st.tile}>
          <Text style={st.tileLabel}>EXPECTED TIME</Text>
          <Text style={st.tileValue}>{r.predictedTime != null ? `${fmt(r.predictedTime)} s` : '–'}</Text>
          <Text style={st.tileSub}>{r.predictedTime == null ? 'not predicted yet' : d.range ? `± ${d.range}` : 'at the new setting'}</Text>
        </View>
        <View style={st.tile}>
          <Text style={st.tileLabel}>PER NOTCH</Text>
          <Text style={st.tileValue}>{r.secondsPerMark != null ? `${fmt(r.secondsPerMark)} s` : '–'}</Text>
          <Text style={st.tileSub}>{r.secondsPerMark == null ? 'measured from the next shot' : r.slopeSource === 'benchmark' ? 'house rule' : r.slopeSource === 'grinder' ? 'measured on other coffees' : 'measured'}</Text>
        </View>
      </View>

      {d.breakdown.length ? (
        <View style={{ gap: S.sm }}>
          <Text style={st.tileLabel}>WHY THIS SETTING</Text>
          {d.breakdown.map((b, i) => (
            <View key={i} style={st.why}>
              <Text style={st.whyLabel}>{b.label}{b.status ? ` · ${b.status}` : ''}</Text>
              <Pill tone={/coarser/.test(b.move) ? 'warn' : b.move === 'hold' ? undefined : 'accent'}>{b.move}</Pill>
            </View>
          ))}
        </View>
      ) : null}
      {r.tasteHint ? <Text style={st.reason}>{r.tasteHint}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  big: { color: C.teal, fontSize: 64, fontWeight: '800', letterSpacing: -1 },
  words: { color: C.muted, fontSize: 14, marginTop: -4 },
  reason: { color: C.muted, fontSize: 13, textAlign: 'center' },
  basis: { alignItems: 'center', gap: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  basisText: { color: C.ink, fontSize: 13, textAlign: 'center' },
  note: { color: C.muted, fontSize: 12, textAlign: 'center' },
  doseTile: { backgroundColor: C.accentSoft, borderRadius: R.md, borderWidth: 1, borderColor: C.accentLine, padding: S.lg, alignItems: 'center', gap: 4 },
  doseBig: { color: C.white, fontSize: 48, fontWeight: '800' },
  unit: { color: C.muted, fontSize: 18, fontWeight: '600' },
  perNotchBox: { alignSelf: 'stretch', marginTop: S.sm, gap: 4, borderTopWidth: 1, borderTopColor: C.accentLine, paddingTop: S.md },
  perNotchTitle: { color: C.ink, fontSize: 14, fontWeight: '700' },
  perNotchHelp: { color: C.muted, fontSize: 12 },
  perNotch: { alignSelf: 'stretch', flexDirection: 'row', marginTop: 4 },
  tiles: { flexDirection: 'row', gap: S.md },
  tile: { flex: 1, backgroundColor: C.surface2, borderRadius: R.md, padding: S.md, gap: 2, alignItems: 'center' },
  tileLabel: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  tileValue: { color: C.ink, fontSize: 24, fontWeight: '700' },
  tileSub: { color: C.muted, fontSize: 12, textAlign: 'center' },
  why: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.md },
  whyLabel: { color: C.muted, fontSize: 13, flexShrink: 1 },
});
