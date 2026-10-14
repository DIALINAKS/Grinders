import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Note } from './ui';
import { Gauge, Pill, Stepper } from './visuals';
import { fmt } from '../engine';

const CONF_TONE = { High: 'good', Moderate: 'accent', Low: 'warn' };

/** Confidence level and what the advice is based on. Always shown with a recommendation. */
export function Basis({ r }) {
  return (
    <View style={st.basis}>
      <Pill tone={CONF_TONE[r.confidence]}>Confidence: {r.confidence}</Pill>
      <Text style={st.basisText}>Based on: {r.sourceText}</Text>
      {r.dial.conservative ? <Text style={st.note}>This grinder's response isn't measured yet, so this is a small, safe step. The next shot measures it.</Text> : null}
    </View>
  );
}

/** Grind setting on the dial, the move, doser time and why. */
export default function Recommendation({ r, M, grinder, onChangeRules, compact }) {
  if (r.status === 'no-shots') return <Note>Pull your first shot, then the app tells you what to change.</Note>;
  if (r.status === 'need-more') return <Note>Log a second shot at a different grind setting so the app can measure this grinder.</Note>;
  if (r.status === 'no-target') return <Note>Set your target time band.</Note>;
  if (r.status === 'flat') return <Note tone="warn">Changing the grind isn't moving the time much yet. Try shots further apart on the dial.</Note>;
  const d = r.dial, ds = r.dose;
  const rawRule = (grinder.rules || {}).doserNotch;
  let doseWhy;
  if (ds.seconds == null) doseWhy = 'Enter a doser time with your shot to get this.';
  else if (ds.unknownPerNotch) doseWhy = `Kept at ${fmt(ds.seconds)} s for now. A finer grind comes out slower, so the doser usually needs a little longer. Dial In learns how much from your weighed doses, or you can set it in the box just below.`;
  else if (Math.abs(ds.gapNotches || 0) < 1e-6) doseWhy = `Keeps ${fmt(ds.lastGrams)} g → your target dose.`;
  else if (!ds.change) doseWhy = `Grind move too small to change the dose time (${fmt(ds.perNotch, 2)} s per notch, ${ds.perNotchSource}).`;
  else doseWhy = `${ds.change > 0 ? '+' : ''}${fmt(ds.change)} s for the grind move (${fmt(ds.perNotch, 2)} s per notch, ${ds.perNotchSource}).`;

  return (
    <View style={{ gap: S.md }}>
      <Gauge value={d.value} anchor={d.anchorValue} M={M}>
        <Text style={st.big}>{d.text}</Text>
        <Text style={st.words}>{d.words}</Text>
      </Gauge>
      <Pill tone="accent">{d.moveShort === 'hold' ? `Stay on ${d.anchorText}` : `From ${d.anchorText} · ${d.moveShort}`}</Pill>
      {d.reason ? <Text style={st.reason}>{d.reason}</Text> : null}
      {d.capped ? <Text style={[st.reason, { color: C.warn }]}>{d.conservative ? 'Capped at half a number until this grinder is measured.' : 'Capped at one notch. Pull a shot here and check before going further.'}</Text> : null}
      <Basis r={r} />

      <View style={st.doseTile}>
        <Text style={st.tileLabel}>DOSE TIME</Text>
        <Text style={st.doseBig}>{ds.seconds != null ? fmt(ds.seconds) : '–'}<Text style={st.unit}>{ds.seconds != null ? ' s' : ''}</Text></Text>
        {ds.preset ? <Text style={st.tileSub}>{ds.preset.text}</Text> : null}
        <Text style={st.tileSub}>{doseWhy}</Text>
        {!compact && onChangeRules ? (
          <View style={st.perNotchBox}>
            <Text style={st.perNotchTitle}>Doser adjustment for each notch finer</Text>
            <Text style={st.perNotchHelp}>Seconds to add to the doser time per notch finer (taken off when going coarser). Example: 0.2 means 1 notch finer → doser +0.2 s. Tap the number to type, or use − / +.</Text>
            <View style={st.perNotch}>
              <Stepper label="SECONDS PER NOTCH" unit={rawRule ? 'your setting' : ds.perNotch ? `blank = ${fmt(ds.perNotch, 2)} s learned` : 'not set yet · learning'}
                value={rawRule || ''} onChange={v => onChangeRules({ ...(grinder.rules || {}), doserNotch: v })} step={0.1} decimals={1} />
            </View>
            {rawRule ? <Text style={st.perNotchHelp}>Clear the box to go back to the learned value.</Text> : null}
          </View>
        ) : null}
      </View>

      <View style={st.tiles}>
        <View style={st.tile}>
          <Text style={st.tileLabel}>EXPECTED TIME</Text>
          <Text style={st.tileValue}>{fmt(r.predictedTime)} s</Text>
          <Text style={st.tileSub}>{d.range ? `± ${d.range}` : 'at the new setting'}</Text>
        </View>
        <View style={st.tile}>
          <Text style={st.tileLabel}>PER MARK</Text>
          <Text style={st.tileValue}>{fmt(r.secondsPerMark)} s</Text>
          <Text style={st.tileSub}>{r.slopeSource === 'benchmark' ? 'benchmark' : 'measured'}</Text>
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
  big: { color: C.white, fontSize: 64, fontWeight: '800', letterSpacing: -1 },
  words: { color: C.muted, fontSize: 14, marginTop: -4 },
  reason: { color: C.muted, fontSize: 13, textAlign: 'center' },
  basis: { alignItems: 'center', gap: 4 },
  basisText: { color: C.ink, fontSize: 13, textAlign: 'center' },
  note: { color: C.muted, fontSize: 12, textAlign: 'center' },
  doseTile: { backgroundColor: C.accentSoft, borderRadius: R.md, borderWidth: 1, borderColor: '#1D3B7A', padding: S.lg, alignItems: 'center', gap: 4 },
  doseBig: { color: C.white, fontSize: 48, fontWeight: '800' },
  unit: { color: C.muted, fontSize: 18, fontWeight: '600' },
  perNotchBox: { alignSelf: 'stretch', marginTop: S.sm, gap: 4, borderTopWidth: 1, borderTopColor: '#1D3B7A', paddingTop: S.md },
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
