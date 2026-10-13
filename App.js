import LOGO from './src/logo';
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Image, ScrollView, Pressable, SafeAreaView, StatusBar, Platform, KeyboardAvoidingView, StyleSheet } from 'react-native';
import { C, S, R } from './src/theme';
import { load, save, newId } from './src/store';
import { Chips, Label } from './src/components/ui';
import { Icon } from './src/components/visuals';
import { tierOf, usageText, activeGrinders, reconcileGrinders, shotLimitReached, sampleShots } from './src/engine';
import Welcome from './src/screens/Welcome';
import Setup from './src/screens/Setup';
import DialIn from './src/screens/DialIn';
import LogShot from './src/screens/LogShot';
import History from './src/screens/History';
import Insights from './src/screens/Insights';
import Rules from './src/screens/Rules';
import Account from './src/screens/Account';
import ArchivePick from './src/screens/ArchivePick';

const TABS = [
  { key: 'dial', label: 'DIAL-IN', icon: 'dial' },
  { key: 'log', label: 'LOG SHOT', icon: 'cup' },
  { key: 'history', label: 'HISTORY', icon: 'list' },
  { key: 'insights', label: 'INSIGHTS', icon: 'bars' },
  { key: 'account', label: 'ACCOUNT', icon: 'user' },
];

export default function App() {
  const [st, setSt] = useState(null);         // saved state, null while loading
  const [tab, setTab] = useState('dial');
  const [overlay, setOverlay] = useState(null); // null | 'register' | 'rules' | 'welcome'
  const [prefill, setPrefill] = useState(null); // from "Pull it and log the shot"

  useEffect(() => { load().then(setSt); }, []);
  const update = useCallback(fn => setSt(prev => { const next = fn(prev); save(next); return next; }), []);

  if (!st) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  if (!st.tier || overlay === 'welcome') {
    return (
      <Shell>
        <Welcome bill={st.bill} onBill={b => update(s => ({ ...s, bill: b }))}
          onChoose={t => { update(s => applyTier(s, t)); setOverlay(null); setTab('dial'); }} />
      </Shell>
    );
  }

  const grinders = st.grinders;
  const hasSample = grinders.some(g => g.sample);
  const grinder = grinders.find(g => g.id === st.grinderId) || activeGrinders(grinders)[0] || grinders[0] || null;
  const gShots = grinder ? st.shots.filter(s => s.grinderId === grinder.id).sort((a, b) => (a.ts < b.ts ? -1 : 1)) : [];
  const coffees = [...new Set(gShots.map(s => s.bean))];
  const picked = grinder ? st.coffee[grinder.id] : undefined; // '' = new coffee
  const coffee = picked === '' ? '' : (picked && coffees.includes(picked) ? picked : (gShots.length ? gShots[gShots.length - 1].bean : ''));
  const profileShots = gShots.filter(s => s.bean === coffee);
  const recon = reconcileGrinders(st.tier, grinders);
  const blocked = grinder && grinder.sample ? null
    : shotLimitReached(st.tier, st.shots) ? 'limit' : grinder && grinder.archived ? 'archived' : null;

  /* ---------- actions ---------- */
  const registerGrinder = (name, model) => {
    const g = { id: newId('g'), name, model, rules: {}, archived: false, createdAt: new Date().toISOString() };
    update(s => ({ ...s, grinders: [...s.grinders, g], grinderId: g.id }));
    setOverlay(null); setTab('dial');
  };
  const loadSample = () => {
    const id = 'g_sample';
    update(s => ({
      ...s, grinderId: id, coffee: { ...s.coffee, [id]: 'Ethiopia Guji' },
      grinders: [...s.grinders.filter(g => g.id !== id), { id, name: 'Mythos One (sample)', model: 'Mythos One', rules: {}, sample: true, createdAt: new Date().toISOString() }],
      shots: [...s.shots.filter(x => !x.sample), ...sampleShots(id)],
    }));
    setOverlay(null); setTab('dial');
  };
  const removeSample = () => update(s => ({
    ...s, grinders: s.grinders.filter(g => !g.sample), shots: s.shots.filter(x => !x.sample),
    grinderId: s.grinderId === 'g_sample' ? null : s.grinderId,
  }));
  const saveShot = shot => {
    update(s => ({
      ...s, shots: [...s.shots, { ...shot, id: newId('s'), grinderId: grinder.id, grinder: grinder.name, ts: new Date().toISOString(), sample: !!grinder.sample }],
      coffee: { ...s.coffee, [grinder.id]: shot.bean },
    }));
    setPrefill(null);
  };
  const deleteShot = id => update(s => ({ ...s, shots: s.shots.filter(x => x.id !== id) }));
  const changeRules = rules => update(s => ({ ...s, grinders: s.grinders.map(g => (g.id === grinder.id ? { ...g, rules } : g)) }));
  const keepGrinder = id => update(s => ({ ...s, grinderId: id, grinders: s.grinders.map(g => (g.archived || g.sample ? g : { ...g, archived: g.id !== id })) }));
  const pull = p => { setPrefill(p); setTab('log'); };

  /* ---------- body ---------- */
  let body;
  if (recon.mustChoose) {
    body = <ArchivePick tier={st.tier} grinders={grinders.filter(g => !g.sample)} shots={st.shots} onKeep={keepGrinder} />;
  } else if (tab === 'account') {
    body = <Account tier={st.tier} bill={st.bill} grinders={grinders} shots={st.shots} hasSample={hasSample}
      onBill={b => update(s => ({ ...s, bill: b }))} onTier={t => update(s => applyTier(s, t))} onRemoveSample={removeSample} />;
  } else if (!grinder || overlay === 'register') {
    body = <Setup first={!grinder} tier={st.tier} grinders={grinders} hasSample={hasSample} onRegister={registerGrinder}
      onSample={loadSample} onClose={() => setOverlay(null)} onSeePlans={() => { setOverlay(null); setTab('account'); }} />;
  } else if (overlay === 'rules') {
    body = (
      <View style={{ gap: S.md }}>
        <Pressable onPress={() => setOverlay(null)}><Text style={st_.back}>‹ Back</Text></Pressable>
        <Rules grinder={grinder} onChange={changeRules} readOnly={grinder.archived} />
      </View>
    );
  } else if (tab === 'dial') {
    body = <DialIn grinder={grinder} coffee={coffee} shots={profileShots} onPull={pull} onOpenRules={() => setOverlay('rules')} />;
  } else if (tab === 'log') {
    body = <LogShot grinder={grinder} coffee={coffee} lastShot={profileShots[profileShots.length - 1]} prefill={prefill}
      blocked={blocked} onSave={saveShot} onSeePlans={() => setTab('account')} />;
  } else if (tab === 'history') {
    body = <History shots={profileShots} onDelete={deleteShot} readOnly={grinder.archived} />;
  } else {
    body = <Insights grinder={grinder} shots={profileShots} />;
  }

  const showPickers = grinder && !recon.mustChoose && !overlay && tab !== 'account';
  const ordered = [...grinders.filter(g => !g.archived && !g.sample), ...grinders.filter(g => g.sample), ...grinders.filter(g => g.archived && !g.sample)];

  return (
    <Shell>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={st_.scroll} keyboardShouldPersistTaps="handled">
        <View style={st_.header}>
          <Image source={LOGO} style={st_.logo} />
          <View style={{ flex: 1 }}>
            <Text style={st_.title}>GRIND DIAL-IN</Text>
            <Text style={st_.sub}>BARISTA LIFE</Text>
          </View>
          <Pressable onPress={() => setTab('account')} style={st_.planPill} hitSlop={6}>
            <Text style={st_.planText}>{tierOf(st.tier).label}</Text>
          </Pressable>
        </View>

        {showPickers ? (
          <View style={{ gap: S.md }}>
            <View>
              <Label>Grinder</Label>
              <Chips
                items={ordered.map(g => ({ key: g.id, label: g.archived ? `${g.name} · archived` : g.name, dim: g.archived }))}
                value={grinder.id} onChange={id => update(s => ({ ...s, grinderId: id }))}
                addLabel="Register" onAdd={() => setOverlay('register')} />
            </View>
            <View>
              <Label>Coffee</Label>
              <Chips items={[...coffees, ...(coffee === '' ? [] : [])].map(c => ({ key: c, label: c }))} value={coffee}
                onChange={c => update(s => ({ ...s, coffee: { ...s.coffee, [grinder.id]: c } }))}
                addLabel="New coffee" onAdd={() => { update(s => ({ ...s, coffee: { ...s.coffee, [grinder.id]: '' } })); setPrefill(null); setTab('log'); }} />
            </View>
          </View>
        ) : null}

        {grinder && grinder.sample && tab !== 'account' ? (
          <Text style={st_.sampleNote}>You're exploring sample shots. They don't count towards your plan. Remove them in Account.</Text>
        ) : null}

        {body}
        <Text style={st_.foot}>Testing version · no payments · {usageText(st.tier, grinders, st.shots)}</Text>
      </ScrollView>

      {!recon.mustChoose ? (
        <View style={st_.tabs}>
          {TABS.map(t => {
            const on = tab === t.key && !overlay;
            return (
              <Pressable key={t.key} onPress={() => { setOverlay(null); setTab(t.key); }} style={[st_.tab, on && st_.tabOn]}
                accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Icon name={t.icon} color={on ? C.white : C.muted} />
                <Text style={[st_.tabText, on && { color: C.white }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Shell>
  );
}

/** Apply a plan change: archive or restore grinders as the plan allows. Nothing is ever deleted. */
function applyTier(s, tier) {
  const next = { ...s, tier };
  const r = reconcileGrinders(tier, s.grinders);
  if (r.restore.length) next.grinders = s.grinders.map(g => (r.restore.includes(g.id) ? { ...g, archived: false } : g));
  return next;
}

function Shell({ children }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st_ = StyleSheet.create({
  scroll: { padding: S.lg, gap: S.lg, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  logo: { width: 42, height: 42, borderRadius: 10 },
  title: { color: C.ink, fontSize: 20, fontWeight: '800', letterSpacing: 1.5 },
  sub: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 2.5 },
  planPill: { backgroundColor: C.surface2, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 5 },
  planText: { color: C.ink, fontWeight: '700', fontSize: 12 },
  back: { color: C.accentBright, fontWeight: '700', fontSize: 15 },
  sampleNote: { color: C.warn, fontSize: 12 },
  foot: { color: C.faint, fontSize: 11, textAlign: 'center' },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.surface, paddingHorizontal: 6, paddingTop: 6, paddingBottom: Platform.OS === 'ios' ? 2 : 8 },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 6, borderRadius: R.md },
  tabOn: { backgroundColor: C.accent },
  tabText: { color: C.muted, fontWeight: '700', fontSize: 9.5, letterSpacing: 0.6 },
});
