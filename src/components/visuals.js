import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText, Rect, Polyline } from 'react-native-svg';
import { C, S, R } from '../theme';

/* ---------- dial gauge: the setting drawn like the grinder's own dial ---------- */

const rad = d => (d * Math.PI) / 180;

export function Gauge({ value, anchor, M, size = 270, children }) {
  const a = anchor == null ? value : anchor;
  let lo = Math.floor(Math.min(value, a) - 0.5);
  let hi = Math.ceil(Math.max(value, a) + 0.5);
  if (hi - lo < 2) hi = lo + 2;
  const cx = size / 2, cy = size / 2, r = size * 0.4;
  const A0 = 150, A1 = 390; // open at the bottom, like a grinder collar
  const ang = v => A0 + ((v - lo) / (hi - lo)) * (A1 - A0);
  const pt = (rr, deg) => [cx + rr * Math.cos(rad(deg)), cy + rr * Math.sin(rad(deg))];
  const arc = (from, to, rr) => {
    const [x0, y0] = pt(rr, from), [x1, y1] = pt(rr, to);
    return `M ${x0} ${y0} A ${rr} ${rr} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const ticks = [];
  for (let i = 0; i <= (hi - lo) * M; i++) {
    const v = lo + i / M, major = i % M === 0, d = ang(v);
    const [x0, y0] = pt(r - (major ? 22 : 14), d), [x1, y1] = pt(r - 6, d);
    ticks.push(<Line key={'t' + i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={major ? C.ink : C.faint} strokeWidth={major ? 2.5 : 1.5} strokeLinecap="round" />);
    if (major) {
      const [lx, ly] = pt(r - 38, d);
      ticks.push(<SvgText key={'l' + i} x={lx} y={ly + 5} fill={C.muted} fontSize="14" fontWeight="600" textAnchor="middle">{String(Math.round(v))}</SvgText>);
    }
  }
  const [mx, my] = pt(r, ang(value));
  const [ax0, ay0] = pt(r - 4, ang(a)), [ax1, ay1] = pt(r + 12, ang(a));
  const from = Math.min(ang(a), ang(value)), to = Math.max(ang(a), ang(value));
  return (
    <View style={{ width: size, height: size * 0.82, alignSelf: 'center' }}>
      <Svg width={size} height={size * 0.82}>
        <Path d={arc(A0, A1, r)} stroke={C.surface2} strokeWidth={16} fill="none" strokeLinecap="round" />
        {to - from > 0.5 ? <Path d={arc(from, to, r)} stroke={C.accent} strokeWidth={16} fill="none" strokeLinecap="round" /> : null}
        {ticks}
        {anchor != null && Math.abs(anchor - value) > 1e-6
          ? <Line x1={ax0} y1={ay0} x2={ax1} y2={ay1} stroke={C.muted} strokeWidth={2} strokeDasharray="3,3" /> : null}
        <Circle cx={mx} cy={my} r={13} fill={C.bg} stroke={C.accentBright} strokeWidth={5} />
        <Circle cx={mx} cy={my} r={4} fill={C.accentBright} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingTop: size * 0.06 }]} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

/* ---------- last shots chart ---------- */

const TASTE = { sour: C.warn, balanced: C.good, bitter: C.bad };

export function ShotsChart({ shots, target = 28, lo, hi, height = 180 }) {
  const bLo = Number.isFinite(lo) ? lo : target - 1, bHi = Number.isFinite(hi) ? hi : target + 1;
  const [w, setW] = useState(0);
  const pad = { l: 38, r: 12, t: 12, b: 26 };
  const times = shots.map(s => s.time);
  const yMin = Math.floor(Math.min(target - 6, ...times) / 3) * 3, yMax = Math.ceil(Math.max(target + 6, ...times) / 3) * 3;
  const X = i => pad.l + (shots.length < 2 ? (w - pad.l - pad.r) / 2 : (i / (shots.length - 1)) * (w - pad.l - pad.r));
  const Y = v => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (height - pad.t - pad.b);
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Rect x={pad.l} y={Y(bHi)} width={w - pad.l - pad.r} height={Y(bLo) - Y(bHi)} fill={C.accentSoft} />
          <Line x1={pad.l} x2={w - pad.r} y1={Y(target)} y2={Y(target)} stroke={C.muted} strokeDasharray="4,4" strokeWidth={1} />
          {yTicks.map(t => (
            <SvgText key={t} x={pad.l - 6} y={Y(t) + 4} fill={C.muted} fontSize="11" textAnchor="end">{`${Math.round(t)}s`}</SvgText>
          ))}
          <Polyline points={shots.map((s, i) => `${X(i)},${Y(s.time)}`).join(' ')} fill="none" stroke={C.muted} strokeWidth={2} />
          {shots.map((s, i) => (
            <Circle key={s.id || i} cx={X(i)} cy={Y(s.time)} r={i === shots.length - 1 ? 7 : 5} fill={TASTE[s.taste] || C.surface2} stroke={TASTE[s.taste] || C.muted} strokeWidth={2} />
          ))}
          <SvgText x={pad.l} y={height - 6} fill={C.faint} fontSize="11">older</SvgText>
          <SvgText x={w - pad.r} y={height - 6} fill={C.faint} fontSize="11" textAnchor="end">latest</SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

/* ---------- weekly bars ---------- */

export function Bars({ items, height = 150 }) {
  const [w, setW] = useState(0);
  const max = Math.max(1, ...items.map(i => i.value));
  const gap = 14, bw = items.length ? (w - gap * (items.length - 1)) / items.length : 0;
  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ height: height + 40 }}>
      {w > 0 ? (
        <Svg width={w} height={height + 40}>
          {items.map((it, i) => {
            const h = Math.max(4, (it.value / max) * height), x = i * (bw + gap), last = i === items.length - 1;
            return (
              <React.Fragment key={i}>
                <SvgText x={x + bw / 2} y={height - h + 12} fill={C.ink} fontSize="13" fontWeight="700" textAnchor="middle">{it.top}</SvgText>
                <Rect x={x} y={height - h + 18} width={bw} height={h} rx={6} fill={last ? C.accent : C.surface2} />
                <SvgText x={x + bw / 2} y={height + 36} fill={C.muted} fontSize="11" textAnchor="middle">{it.label}</SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

/* ---------- tab icons ---------- */

export function Icon({ name, color = C.muted, size = 22 }) {
  const p = { stroke: color, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'dial' ? <><Circle cx="12" cy="13" r="8" {...p} /><Line x1="12" y1="13" x2="16" y2="9" {...p} /><Line x1="12" y1="3" x2="12" y2="5" {...p} /></> : null}
      {name === 'cup' ? <><Path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z" {...p} /><Path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" {...p} /><Path d="M8 3v3M12 3v3" {...p} /></> : null}
      {name === 'list' ? <><Line x1="8" y1="6" x2="20" y2="6" {...p} /><Line x1="8" y1="12" x2="20" y2="12" {...p} /><Line x1="8" y1="18" x2="20" y2="18" {...p} /><Circle cx="4" cy="6" r="0.8" {...p} /><Circle cx="4" cy="12" r="0.8" {...p} /><Circle cx="4" cy="18" r="0.8" {...p} /></> : null}
      {name === 'bars' ? <><Line x1="4" y1="20" x2="20" y2="20" {...p} /><Line x1="7" y1="16" x2="7" y2="11" {...p} /><Line x1="12" y1="16" x2="12" y2="6" {...p} /><Line x1="17" y1="16" x2="17" y2="9" {...p} /></> : null}
      {name === 'user' ? <><Circle cx="12" cy="8" r="4" {...p} /><Path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" {...p} /></> : null}
    </Svg>
  );
}

/* ---------- stepper: − value + (big targets for wet hands) ---------- */

export function Stepper({ label, unit, value, onChange, step = 1, decimals = 1 }) {
  const n = parseFloat(value);
  const bump = d => onChange(String(+((Number.isFinite(n) ? n : 0) + d).toFixed(decimals)));
  return (
    <View style={st.stepper}>
      <Text style={st.stepLabel}>{label}</Text>
      <View style={st.stepRow}>
        <Pressable onPress={() => bump(-step)} style={st.stepBtn} hitSlop={6} accessibilityLabel={`Decrease ${label}`}><Text style={st.stepBtnText}>−</Text></Pressable>
        <TextInput value={value == null ? '' : String(value)} onChangeText={onChange} keyboardType="decimal-pad" style={st.stepValue}
          placeholder="–" placeholderTextColor={C.faint} />
        <Pressable onPress={() => bump(step)} style={st.stepBtn} hitSlop={6} accessibilityLabel={`Increase ${label}`}><Text style={st.stepBtnText}>+</Text></Pressable>
      </View>
      {unit ? <Text style={st.stepUnit}>{unit}</Text> : null}
    </View>
  );
}

export function Pill({ children, tone }) {
  const bg = tone === 'warn' ? '#3A2418' : tone === 'accent' ? C.accentSoft : tone === 'good' ? '#163330' : C.surface2;
  const fg = tone === 'warn' ? C.warn : tone === 'accent' ? C.accentBright : tone === 'good' ? C.good : C.ink;
  return <View style={[st.pill, { backgroundColor: bg }]}><Text style={[st.pillText, { color: fg }]}>{children}</Text></View>;
}

const st = StyleSheet.create({
  stepper: { flexBasis: '30%', flexGrow: 1, minWidth: 100, backgroundColor: C.surface2, borderRadius: R.md, padding: S.sm, gap: 4 },
  stepLabel: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 34, height: 34, borderRadius: 9, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: C.ink, fontSize: 20, fontWeight: '600', marginTop: -2 },
  stepValue: { color: C.ink, fontSize: 17, fontWeight: '700', textAlign: 'center', minWidth: 40, flex: 1, paddingVertical: 4 },
  stepUnit: { color: C.faint, fontSize: 11, textAlign: 'center' },
  pill: { alignSelf: 'center', borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 5 },
  pillText: { fontSize: 13, fontWeight: '700' },
});
