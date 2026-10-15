import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Image, ScrollView, Pressable, SafeAreaView, StatusBar, Platform, KeyboardAvoidingView, StyleSheet } from 'react-native';
import { C, S, R } from './src/theme';
import { load, save } from './src/store';
import { newId, epochShots, activeCal, grinderCoffees, coffeeById, saveCalibration, saveCalibrationFromShot, unsavedInBand, recalibrate, withSample, withoutSample } from './src/model';
import { Chips, Label, Card, Body, Button } from './src/components/ui';
import { Icon } from './src/components/visuals';
import { tierOf, usageText, activeGrinders, reconcileGrinders, shotLimitReached, fmt } from './src/engine';
import Welcome from './src/screens/Welcome';
import Setup from './src/screens/Setup';
import Home from './src/screens/Home';
import NewCoffee from './src/screens/NewCoffee';
import Adjust from './src/screens/Adjust';
import ShotLoop from './src/screens/ShotLoop';
import History from './src/screens/History';
import Insights from './src/screens/Insights';
import Rules from './src/screens/Rules';
import Account from './src/screens/Account';
import ArchivePick from './src/screens/ArchivePick';

const TABS = [
  { key: 'home', label: 'DIAL IN', icon: 'dial' },
  { key: 'history', label: 'HISTORY', icon: 'list' },
  { key: 'insights', label: 'INSIGHTS', icon: 'bars' },
  { key: 'account', label: 'ACCOUNT', icon: 'user' },
];

export default function App() {
  const [st, setSt] = useState(null);           // saved state, null while loading
  const [tab, setTab] = useState('home');
  const [overlay, setOverlay] = useState(null); // null | 'register' | 'rules' | 'welcome'
  const [flow, setFlow] = useState(null);       // null | {kind:'new'|'adjust'|'loop'|'saved', …}

  useEffect(() => { load().then(setSt); }, []);
  const update = useCallback(fn => setSt(prev => { const next = fn(prev); save(next); return next; }), []);

  if (!st) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  if (!st.tier || overlay === 'welcome') {
    return (
      <Shell>
        <Welcome bill={st.bill} onBill={b => update(s => ({ ...s, bill: b }))}
          onChoose={t => { update(s => applyTier(s, t)); setOverlay(null); setTab('home'); }} />
      </Shell>
    );
  }

  /* ---------- derived ---------- */
  const simple = st.detail !== true;   // simple mode is the default: time only
  const grinders = st.grinders;
  const hasSample = grinders.some(g => g.sample);
  const grinder = grinders.find(g => g.id === st.grinderId) || activeGrinders(grinders)[0] || grinders[0] || null;
  const epoch = epochShots(st, grinder);
  const coffees = grinderCoffees(st, grinder);
  const items = coffees.filter(c => !c.archived).map(c => ({ coffee: c, cal: activeCal(st, grinder, c.id) })).filter(i => i.cal);
  const coffeeShots = cid => epoch.filter(s => s.coffeeId === cid);
  const picked = grinder ? st.coffee[grinder.id] : null;
  const viewCoffee = coffees.find(c => c.id === picked) || coffees.find(c => !c.archived) || null;
  const run = st.run && grinder && st.run.grinderId === grinder.id ? st.run : null;
  const runShots = run ? st.shots.filter(s => s.runId === run.id).sort((a, b) => (a.ts < b.ts ? -1 : 1)) : [];
  const recon = reconcileGrinders(st.tier, grinders);
  const blocked = grinder && grinder.sample ? null
    : shotLimitReached(st.tier, st.shots) ? 'limit' : grinder && grinder.archived ? 'archived' : null;

  /* ---------- actions ---------- */
  const setGrinder = (id, patch) => update(s => ({ ...s, grinders: s.grinders.map(g => (g.id === id ? { ...g, ...patch } : g)) }));
  const registerGrinder = (name, model, gauge) => {
    const g = { id: newId('g'), name, model, rules: {}, gauge, lastSetting: null, archived: false, createdAt: new Date().toISOString() };
    update(s => ({ ...s, grinders: [...s.grinders, g], grinderId: g.id }));
    setOverlay(null); setFlow(null); setTab('home');
  };
  const createCoffee = fields => {
    const id = newId('c');
    update(s => ({ ...s, coffees: [...s.coffees, { ...fields, id, archived: false, sample: false, createdAt: new Date().toISOString() }], coffee: { ...s.coffee, [grinder.id]: id } }));
    return id;
  };
  const startRun = (r, first) => {
    update(s => ({ ...s, run: { ...r, id: newId('r'), grinderId: grinder.id, startedAt: new Date().toISOString(), first: first || null }, coffee: { ...s.coffee, [grinder.id]: r.coffeeId } }));
    setFlow({ kind: 'loop' });
  };
  const recordShot = fields => {
    const c = coffeeById(st, run.coffeeId);
    update(s => ({
      ...s,
      shots: [...s.shots, { ...fields, id: newId('s'), grinderId: grinder.id, grinder: grinder.name, coffeeId: run.coffeeId, bean: c ? c.name : '', runId: run.id, mode: run.mode, ts: new Date().toISOString(), sample: !!grinder.sample }],
      grinders: s.grinders.map(g => (g.id === grinder.id ? { ...g, lastSetting: fields.setting } : g)),
    }));
  };
  const recordDoseCheck = fields => {
    const c = coffeeById(st, run.coffeeId);
    update(s => ({ ...s, shots: [...s.shots, { ...fields, kind: 'dose', role: 'test', id: newId('d'), grinderId: grinder.id, grinder: grinder.name, coffeeId: run.coffeeId, bean: c ? c.name : '', runId: run.id, mode: run.mode, ts: new Date().toISOString(), sample: !!grinder.sample }] }));
  };
  const toggleExclude = id => update(s => ({ ...s, shots: s.shots.map(x => (x.id === id ? { ...x, excluded: !x.excluded, excludedWhy: x.excluded ? null : (x.excludedWhy || 'Set aside by barista') } : x)) }));
  const saveCal = confidence => { const cid = run.coffeeId; update(s => saveCalibration(s, run, confidence)); setFlow({ kind: 'saved', coffeeId: cid }); };
  const restartRun = () => { const cid = run.coffeeId; update(s => ({ ...s, run: null })); setFlow({ kind: 'new', preset: { coffeeId: cid } }); };
  const deleteShot = id => update(s => ({ ...s, shots: s.shots.filter(x => x.id !== id) }));
  const changeRules = rules => setGrinder(grinder.id, { rules });
  const keepGrinder = id => update(s => ({ ...s, grinderId: id, grinders: s.grinders.map(g => (g.archived || g.sample ? g : { ...g, archived: g.id !== id })) }));
  const go = t => { setOverlay(null); setTab(t); };

  /* ---------- body ---------- */
  let body;
  if (recon.mustChoose) {
    body = <ArchivePick tier={st.tier} grinders={grinders.filter(g => !g.sample)} shots={st.shots} onKeep={keepGrinder} />;
  } else if (tab === 'account') {
    body = <Account tier={st.tier} bill={st.bill} grinders={grinders} shots={st.shots} hasSample={hasSample}
      onBill={b => update(s => ({ ...s, bill: b }))} onTier={t => update(s => applyTier(s, t))}
      detail={!simple} onDetail={v => update(s => ({ ...s, detail: v }))} onRemoveSample={() => { update(withoutSample); setFlow(null); }} />;
  } else if (!grinder || overlay === 'register') {
    body = <Setup first={!grinder} simple={simple} tier={st.tier} grinders={grinders} hasSample={hasSample} onRegister={registerGrinder}
      onSample={() => { update(withSample); setOverlay(null); setFlow(null); setTab('home'); }} onClose={() => setOverlay(null)} onSeePlans={() => go('account')} />;
  } else if (overlay === 'rules') {
    body = (
      <View style={{ gap: S.md }}>
        <Pressable onPress={() => setOverlay(null)}><Text style={st_.back}>‹ Back</Text></Pressable>
        <Rules grinder={grinder} onChange={changeRules} readOnly={grinder.archived}
          onGauge={v => setGrinder(grinder.id, { gauge: v })}
          onRecalibrate={reason => { update(s => recalibrate(s, grinder.id, reason)); setFlow(null); setOverlay(null); }}
          onUndoRecalibrate={() => setGrinder(grinder.id, { epochStart: null, epochReason: null })} />
      </View>
    );
  } else if (tab === 'home') {
    if (flow && flow.kind === 'loop' && run) {
      body = <ShotLoop grinder={grinder} coffee={coffeeById(st, run.coffeeId) || { name: 'Coffee' }} run={run} runShots={runShots}
        coffeeShots={coffeeShots(run.coffeeId)} grinderShots={epoch} first={run.first} blocked={blocked} simple={simple}
        onRecord={recordShot} onDoseCheck={recordDoseCheck} onToggleExclude={toggleExclude} onSave={saveCal} onRestart={restartRun} onStop={() => setFlow(null)}
        onChangeRules={changeRules} onSeePlans={() => go('account')} />;
    } else if (flow && flow.kind === 'new') {
      body = <NewCoffee grinder={grinder} coffees={st.coffees} preset={flow.preset} onCreateCoffee={createCoffee}
        onStart={r => startRun(r, null)} onCancel={() => setFlow(null)} />;
    } else if (flow && flow.kind === 'adjust') {
      body = <Adjust grinder={grinder} items={items} startCoffeeId={flow.coffeeId} coffeeShots={coffeeShots} grinderShots={epoch}
        maintain={!!flow.maintain} simple={simple} onStart={startRun} onCancel={() => setFlow(null)} onNewCoffee={() => setFlow({ kind: 'new' })}
        onRedial={(cid, cal) => setFlow({ kind: 'new', preset: { coffeeId: cid, dose: cal.dose, yield: cal.yield } })}
        onSetPosition={s => setGrinder(grinder.id, { lastSetting: s })} />;
    } else if (flow && flow.kind === 'saved') {
      const c = coffeeById(st, flow.coffeeId), k = activeCal(st, grinder, flow.coffeeId);
      body = (
        <Card tone="accent">
          <Text style={st_.h}>{c ? c.name.toUpperCase() : 'COFFEE'} · SAVED</Text>
          <Body>Dialled in and saved. Next time, Dial In starts from these settings.</Body>
          {k ? <Body muted>Grinder {k.setting} · {fmt(k.dose)} g → {fmt(k.yield)} g · {fmt(k.time)} s{k.doserTime != null ? ` · doser ${fmt(k.doserTime)} s` : ''}{k.roomTemp != null ? ` · ${fmt(k.roomTemp)} °C` : ''}{k.humidity != null ? ` · ${fmt(k.humidity, 0)} %` : ''}</Body> : null}
          <Button title="Back to Dial In" onPress={() => setFlow(null)} />
        </Card>
      );
    } else {
      body = <Home grinder={grinder} simple={simple} items={items} run={run} runCoffee={run ? coffeeById(st, run.coffeeId) : null} runCount={runShots.filter(x => x.time != null).length}
        onNew={() => setFlow({ kind: 'new' })} onAdjust={cid => setFlow({ kind: 'adjust', coffeeId: cid })} onContinue={() => setFlow({ kind: 'loop' })}
        onMaintain={cid => setFlow({ kind: 'adjust', coffeeId: cid, maintain: true })}
        onGauge={v => setGrinder(grinder.id, { gauge: v })}
        onArchiveCoffee={id => update(s => ({ ...s, coffees: s.coffees.map(c => (c.id === id ? { ...c, archived: true } : c)) }))}
        unsaved={!run ? unsavedInBand(st, grinder) : null} unsavedCoffee={(() => { const u = !run ? unsavedInBand(st, grinder) : null; return u ? coffeeById(st, u.coffeeId) : null; })()}
        hiddenCal={(() => {
          if (items.length) return null;
          const mine = st.calibrations.filter(k => k.active && k.grinderId === grinder.id);
          const arch = mine.map(k => coffeeById(st, k.coffeeId)).find(c => c && c.archived);
          if (arch) return { kind: 'archived', coffee: arch };
          if (grinder.epochStart && mine.some(k => k.ts < grinder.epochStart)) return { kind: 'epoch', when: grinder.epochStart, reason: grinder.epochReason };
          return null;
        })()}
        onRestoreCoffee={id => update(s => ({ ...s, coffees: s.coffees.map(c => (c.id === id ? { ...c, archived: false } : c)) }))}
        onUndoRecalibrate={() => setGrinder(grinder.id, { epochStart: null, epochReason: null })}
        onSaveUnsaved={shot => { update(s => saveCalibrationFromShot(s, shot)); setFlow({ kind: 'saved', coffeeId: shot.coffeeId }); }} />;
    }
  } else if (tab === 'history') {
    body = <History shots={viewCoffee ? st.shots.filter(s => s.grinderId === grinder.id && s.coffeeId === viewCoffee.id).sort((a, b) => (a.ts < b.ts ? -1 : 1)) : []}
      epochStart={grinder.epochStart} onDelete={deleteShot} onToggleExclude={toggleExclude} readOnly={grinder.archived} />;
  } else {
    body = <Insights grinder={grinder} shots={viewCoffee ? coffeeShots(viewCoffee.id) : []} grinderShots={epoch} />;
  }

  const inFlow = tab === 'home' && flow && !overlay;
  const showGrinders = grinder && !recon.mustChoose && !overlay && tab !== 'account' && !inFlow;
  const showCoffees = showGrinders && (tab === 'history' || tab === 'insights') && coffees.length > 0;
  const ordered = [...grinders.filter(g => !g.archived && !g.sample), ...grinders.filter(g => g.sample), ...grinders.filter(g => g.archived && !g.sample)];

  return (
    <Shell>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={st_.scroll} keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
        <View style={st_.header}>
          <Image source={require('./assets/logo.png')} style={st_.logo} />
          <View style={{ flex: 1 }}>
            <Text style={st_.title}>DIAL IN</Text>
            <Text style={st_.sub}>BARISTA LIFE</Text>
          </View>
          <Pressable onPress={() => go('account')} style={st_.planPill} hitSlop={6}>
            <Text style={st_.planText}>{tierOf(st.tier).label}</Text>
          </Pressable>
        </View>

        {showGrinders ? (
          <View style={{ gap: S.md }}>
            <View>
              <Label>Grinder</Label>
              <Chips
                items={ordered.map(g => ({ key: g.id, label: g.archived ? `${g.name} · archived` : g.name, dim: g.archived }))}
                value={grinder.id} onChange={id => { update(s => ({ ...s, grinderId: id })); setFlow(null); }}
                addLabel="Register" onAdd={() => setOverlay('register')} />
            </View>
            {showCoffees ? (
              <View>
                <Label>Coffee</Label>
                <Chips items={coffees.map(c => ({ key: c.id, label: c.archived ? `${c.name} · archived` : c.name, dim: c.archived }))} value={viewCoffee && viewCoffee.id}
                  onChange={id => update(s => ({ ...s, coffee: { ...s.coffee, [grinder.id]: id } }))} />
              </View>
            ) : null}
            {tab === 'home' ? <Pressable onPress={() => setOverlay('rules')}><Text style={st_.link}>Grinder settings for {grinder.name}</Text></Pressable> : null}
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
              <Pressable key={t.key} onPress={() => { if (t.key === 'home' && tab === 'home' && flow && flow.kind !== 'loop') setFlow(null); go(t.key); }} style={[st_.tab, on && st_.tabOn]}
                accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Icon name={t.icon} color={on ? C.accentBright : C.muted} />
                <Text style={[st_.tabText, on && { color: C.ink }]}>{t.label}</Text>
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'android' ? 'height' : undefined}>
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
  h: { color: C.ink, fontSize: 15, fontWeight: '800', letterSpacing: 0.8 },
  planPill: { backgroundColor: C.surface2, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 5 },
  planText: { color: C.ink, fontWeight: '700', fontSize: 12 },
  back: { color: C.accentBright, fontWeight: '700', fontSize: 15 },
  link: { color: C.accentBright, fontWeight: '700', fontSize: 13 },
  sampleNote: { color: C.warn, fontSize: 12 },
  foot: { color: C.faint, fontSize: 12, textAlign: 'center' },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.surface, paddingHorizontal: 6, paddingTop: 6, paddingBottom: Platform.OS === 'ios' ? 2 : 8 },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 6, borderRadius: R.md },
  tabOn: { backgroundColor: C.surface2 },
  tabText: { color: C.muted, fontWeight: '700', fontSize: 11, letterSpacing: 0.6 },
});
