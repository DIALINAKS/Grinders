import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Card, Body, Note } from '../components/ui';
import { Bars, Pill } from '../components/visuals';
import { insights, rulesFor, fmt } from '../engine';

export default function Insights({ grinder, shots, grinderShots }) {
  if (shots.length < 3) return <Note>Insights appear after a few shots on this grinder and coffee. Keep logging and they'll fill in.</Note>;
  const ins = insights({ shots, grinderShots, rules: rulesFor(grinder), gauge: grinder.gauge === true });
  const predOff = ins.predictions.length ? ins.predictions.reduce((t, p) => t + Math.abs(p.actual - p.pred), 0) / ins.predictions.length : null;
  const maxEff = Math.max(0.1, ...ins.effects.map(e => Math.abs(e.seconds)));
  const day = ts => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return (
    <View style={{ gap: S.lg }}>
      <Card>
        <View style={st.rowBetween}>
          <Text style={st.h}>GETTING CLOSER</Text>
          {ins.improvementPct != null ? <Pill tone={ins.improvementPct <= 0 ? 'accent' : 'warn'}>{ins.improvementPct > 0 ? '+' : ''}{ins.improvementPct} %</Pill> : null}
        </View>
        <Bars items={ins.accuracy.map(a => ({ value: a.off, top: '±' + fmt(a.off), label: day(a.week) }))} />
        <Body muted style={{ fontSize: 12 }}>Average seconds away from the target time, week by week.</Body>
      </Card>

      <Card>
        <Text style={st.h}>WHAT MOVES YOUR SHOT</Text>
        <Body muted style={{ fontSize: 12 }}>Seconds of extraction for a typical change on this grinder. "Measured" means learned from your shots; "not yet" means there isn't enough varied data on this grinder to say.</Body>
        {ins.tangled ? <Body style={{ fontSize: 12, color: C.warn }}>Temperature and humidity have moved together in your shots so far, so their effects can't be told apart yet.</Body> : null}
        {ins.effects.map(e => (
          <View key={e.label} style={{ gap: 4 }}>
            <View style={st.rowBetween}>
              <Text style={st.effLabel}>{e.label}{e.status ? <Text style={{ color: e.status === 'measured' ? C.good : C.faint }}>{` · ${e.status}`}</Text> : null}</Text>
              <Text style={st.effVal}>{e.status === 'not measured' ? 'not yet' : `${e.seconds >= 0 ? '+' : '−'}${fmt(Math.abs(e.seconds))} s`}</Text>
            </View>
            <View style={st.track}><View style={[st.fill, { width: e.status === 'not measured' ? '0%' : `${Math.min(100, (Math.abs(e.seconds) / maxEff) * 100)}%` }]} /></View>
          </View>
        ))}
      </Card>

      {predOff != null ? (
        <Card>
          <Text style={st.h}>PREDICTION ACCURACY</Text>
          <Body>{ins.predictions.length === 1 ? `The last predicted shot was off by ${fmt(predOff)} s.` : `The last ${ins.predictions.length} predicted shots were off by ±${fmt(predOff)} s on average.`}</Body>
          <Body muted style={{ fontSize: 12 }}>Each shot pulled on a recommended setting is checked against what the app expected.</Body>
        </Card>
      ) : null}

      <View style={st.stats}>
        <Stat label="Avg off target" value={ins.avgOff != null ? '±' + fmt(ins.avgOff) + ' s' : '–'} />
        <Stat label="Balanced" value={ins.balancedPct != null ? ins.balancedPct + ' %' : '–'} />
        <Stat label="Shots" value={String(shots.length)} />
      </View>
    </View>
  );
}

function Stat({ label, value }) {
  return <View style={st.stat}><Text style={st.statLabel}>{label}</Text><Text style={st.statVal}>{value}</Text></View>;
}

const st = StyleSheet.create({
  h: { color: C.ink, fontSize: 15, fontWeight: '800', letterSpacing: 0.8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  effLabel: { color: C.ink, fontSize: 13 },
  effVal: { color: C.ink, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, backgroundColor: C.surface2, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: C.accent },
  stats: { flexDirection: 'row', gap: S.sm },
  stat: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.md },
  statLabel: { color: C.muted, fontSize: 11 },
  statVal: { color: C.ink, fontSize: 17, fontWeight: '700', marginTop: 2 },
});
