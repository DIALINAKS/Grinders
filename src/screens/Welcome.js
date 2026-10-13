import React from 'react';
import { View, Text, Image, ScrollView, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Button, Segmented } from '../components/ui';
import { priceText } from '../engine';

const CARDS = [
  { id: 'free', name: 'FREE', sub: 'Discover Dial In', limits: '1 Grinder | 20 Shots', cta: 'Get Started' },
  { id: 'pro', name: 'PRO', sub: 'Perfect your home espresso', limits: '1 Grinder | Unlimited Shots', cta: 'Choose Pro' },
  { id: 'business', name: 'BUSINESS', sub: 'Professional espresso calibration', limits: 'Unlimited Grinders | Unlimited Shots', cta: 'Choose Business' },
];

export default function Welcome({ bill, onBill, onChoose }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={st.wrap}>
      <View style={st.glow} />
      <Image source={require('../../assets/logo.png')} style={st.logo} accessibilityIgnoresInvertColors />
      <Text style={st.title}>DIAL IN</Text>
      <Text style={st.tag}>Precision in every shot.</Text>
      <Text style={st.choose}>Choose your experience</Text>
      <View style={{ width: 220, marginBottom: S.lg }}>
        <Segmented options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Annual' }]} value={bill} onChange={onBill} />
      </View>
      {CARDS.map(c => {
        const p = priceText(c.id, bill);
        return (
          <View key={c.id} style={st.card}>
            <Text style={st.cardName}>{c.name}</Text>
            <Text style={st.cardSub}>{c.sub}</Text>
            <Text style={st.cardLimits}>{c.limits}</Text>
            <Text style={st.price}>{p.main}</Text>
            <Text style={st.priceSub}>{p.sub}</Text>
            <Button title={c.cta} onPress={() => onChoose(c.id)} style={{ alignSelf: 'stretch', marginTop: S.md }} />
          </View>
        );
      })}
      <Text style={st.note}><Text style={{ fontWeight: '700', color: C.ink }}>Testing version: </Text>every plan is free while we test. No payment is taken and nothing will be charged. You can change plan at any time from Account.</Text>
      <Text style={st.note}>Every plan uses the same calibration engine. Plans differ only in how many grinders and shots you can save.</Text>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: S.lg, paddingTop: 64, paddingBottom: 48 },
  glow: { position: 'absolute', top: -160, width: 420, height: 320, borderRadius: 210, backgroundColor: '#0A3A9E', opacity: 0.35 },
  logo: { width: 96, height: 96, borderRadius: 22 },
  title: { color: C.white, fontSize: 34, fontWeight: '800', letterSpacing: 2, marginTop: S.lg },
  tag: { color: '#9FB4D9', fontSize: 17, fontStyle: 'italic', marginTop: 4 },
  choose: { color: C.white, fontSize: 18, fontWeight: '600', marginTop: 28, marginBottom: S.md },
  card: { alignSelf: 'stretch', maxWidth: 440, width: '100%', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
    borderRadius: R.lg, padding: 22, marginBottom: S.md },
  cardName: { color: C.white, fontWeight: '800', letterSpacing: 2.5, fontSize: 16 },
  cardSub: { color: '#B7C5E0', marginTop: 6 },
  cardLimits: { color: '#B7C5E0', fontSize: 13, marginTop: 2 },
  price: { color: C.white, fontSize: 30, fontWeight: '800', marginTop: S.md },
  priceSub: { color: '#9FB4D9', fontSize: 12 },
  note: { color: '#9FB4D9', fontSize: 13, textAlign: 'center', maxWidth: 440, marginTop: S.md, lineHeight: 19 },
});

