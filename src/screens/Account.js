import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Card, H2, Label, Body, Segmented, Button } from '../components/ui';
import { TIERS, tierOf, activeGrinders, priceText } from '../engine';

export default function Account({ tier, bill, grinders: allG, shots: allS, onBill, onTier, onBack, hasSample, onRemoveSample }) {
  const grinders = allG.filter(g => !g.sample), shots = allS.filter(s => !s.sample);
  const t = tierOf(tier), act = activeGrinders(grinders).length, arch = grinders.length - act;
  const money = v => '£' + v.toFixed(2);
  return (
    <View style={{ gap: S.lg }}>
      <Card>
        <H2>Account</H2>
        <View style={st.stats}>
          <Stat label="Membership" value={`${t.label}${t.month ? ` · ${money(t.month)}/mo at launch` : ' · £0'}`} />
          <Stat label="Grinders" value={`${act} active${t.grinders !== Infinity ? ` of ${t.grinders}` : ''}${arch ? ` · ${arch} archived` : ''}`} />
          <Stat label="Saved shots" value={t.shots !== Infinity ? `${shots.length} / ${t.shots}` : String(shots.length)} />
        </View>
      </Card>

      <Card style={{ borderStyle: 'dashed', borderColor: C.accent }}>
        <Label>Testing mode · change plan</Label>
        <Body muted>While we test, any plan can be chosen for free. No payment is taken. Your grinders and shots are kept whichever plan you choose.</Body>
        <View style={{ width: 220 }}>
          <Segmented options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Annual' }]} value={bill} onChange={onBill} />
        </View>
        {Object.values(TIERS).map(x => {
          const cur = x.id === tier, p = priceText(x.id, bill);
          return (
            <Pressable key={x.id} disabled={cur} onPress={() => onTier(x.id)} style={[st.tier, cur && st.tierOn]}>
              <Text style={st.tierName}>{x.label}</Text>
              <Text style={st.tierSub}>{x.grinders === Infinity ? 'Unlimited grinders' : '1 grinder'} · {x.shots === Infinity ? 'unlimited shots' : `${x.shots} shots`}</Text>
              <Text style={st.tierPrice}>{p.main}</Text>
              <Text style={st.cta}>{cur ? 'Current plan' : `Switch to ${x.label}`}</Text>
            </Pressable>
          );
        })}
      </Card>

      {hasSample ? (
        <Card>
          <Label>Sample shots</Label>
          <Body muted>The sample Mythos One and its 16 shots don't count towards your plan.</Body>
          <Button title="Remove sample shots" kind="secondary" onPress={onRemoveSample} />
        </Card>
      ) : null}

      <Card>
        <Label>Subscription management</Label>
        <Body muted>Not active in the testing version. At launch, subscriptions will be bought and managed through the App Store.</Body>
      </Card>
    </View>
  );
}

function Stat({ label, value }) {
  return (
    <View style={st.stat}>
      <Text style={st.statLabel}>{label}</Text>
      <Text style={st.statValue}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  stat: { flexGrow: 1, flexBasis: '45%', backgroundColor: C.accentSoft, borderRadius: R.md, padding: S.md },
  statLabel: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  statValue: { color: C.ink, fontWeight: '700', marginTop: 2 },
  tier: { borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.md, gap: 2 },
  tierOn: { borderColor: C.accent, backgroundColor: C.accentSoft },
  tierName: { color: C.ink, fontSize: 17, fontWeight: '800' },
  tierSub: { color: C.muted, fontSize: 13 },
  tierPrice: { color: C.ink, fontSize: 16, fontWeight: '700', marginTop: 4 },
  cta: { color: C.accentBright, fontWeight: '700', marginTop: 4 },
});
