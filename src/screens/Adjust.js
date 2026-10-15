import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Card, Button, Body, Note, Label, Segmented } from '../components/ui';
import { Stepper } from '../components/visuals';
import Recommendation from '../components/Recommendation';
import { coffeeLine } from '../components/CoffeeForm';
import { recommend, rulesFor, dialMarks, checkDialEntry, fmt, num, redialCheck } from '../engine';

const LOADS = [{ value: 0, label: 'Quiet' }, { value: 1, label: 'Steady' }, { value: 2, label: 'Busy' }];
const str = v => (v == null || v === '' ? '' : String(v));
const when = ts => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * Mode 2 · Adjust an existing coffee. Uses the coffee's saved calibration on THIS grinder,
 * the grinder's confirmed position and today's room to predict the setting before the first shot.
 */
export default function Adjust({ grinder, items, startCoffeeId, coffeeShots, grinderShots, maintain, simple, onStart, onCancel, onNewCoffee, onRedial }) {
  const rules = rulesFor(grinder);
  const M = dialMarks(rules);
  const gauge = !simple && grinder.gauge === true;
  const fan = rules.burr === 'fan';
  const askNow = gauge || fan;   // anything to ask about right now?
  const [why, setWhy] = useState(false);
  const [cid, setCid] = useState(startCoffeeId && items.some(i => i.coffee.id === startCoffeeId) ? startCoffeeId : null);
  // Maintain (during service): the grinder is where the last shot left it, so skip the position question
  const afterCoffee = maintain ? (askNow ? 'room' : 'predict') : 'position';
  const [step, setStep] = useState(cid ? afterCoffee : 'coffee');
  const [still, setStill] = useState(null);
  const [pos, setPos] = useState('');
  const [room, setRoom] = useState({ roomTemp: '', humidity: '', workload: 1 });
  const [err, setErr] = useState('');
  const item = items.find(i => i.coffee.id === cid);
  const cal = item && item.cal;
  const current = maintain ? (num(grinder.lastSetting) ?? (cal ? num(cal.setting) : null)) : still === false ? num(pos) : cal ? num(cal.setting) : null;

  const pick = id => { setCid(id); setStill(null); setPos(''); setErr(''); setStep(afterCoffee); };
  const confirmPos = () => {
    if (still === null) return setErr('Tell us where the grinder is now.');
    if (still === false) {
      const s = num(pos); if (s === null) return setErr('Enter what the grinder reads now.');
      const de = checkDialEntry(s, M); if (de) return setErr(de);
    }
    setErr(''); setStep(askNow ? 'room' : 'predict');
  };

  const r = useMemo(() => (step === 'predict' && cal ? recommend({
    shots: coffeeShots(cid), grinderShots, rules, gauge,
    now: { target: (cal.targetLo + cal.targetHi) / 2, targetLo: cal.targetLo, targetHi: cal.targetHi, dose: cal.dose, yield: cal.yield,
      roomTemp: room.roomTemp, humidity: room.humidity, groupTemp: cal.groupTemp, workload: rules.burr === 'fan' ? room.workload : null },
    anchor: { kind: 'calibration', cal, current },
  }) : null), [step, cid, room, current]);

  const start = useSetting => {
    const run = { mode: 'adjust', coffeeId: cid, dose: cal.dose, tol: 0.3, yield: cal.yield, tLo: cal.targetLo, tHi: cal.targetHi, calId: cal.id, current };
    const usePred = useSetting === 'predicted' && r && r.status === 'ready';
    onStart(run, {
      setting: usePred ? r.dial.entry : String(current),
      doserTime: usePred && r.dose.seconds != null ? r.dose.seconds : cal.doserTime,
      predTime: usePred ? Math.round(r.predictedTime * 10) / 10 : (r && r.status === 'ready' ? Math.round(r.ifUnchanged * 10) / 10 : null),
      roomTemp: room.roomTemp, humidity: room.humidity, workload: room.workload,
    });
  };

  return (
    <View style={{ gap: S.lg }}>
      {step === 'coffee' ? (
        <Card>
          <Text style={st.h}>{maintain ? 'WHICH COFFEE IS IN THE HOPPER?' : 'WHICH COFFEE?'}</Text>
          <Body muted>{maintain ? 'Pick the coffee, then tell Dial In what has changed.' : `Coffees with a saved calibration on ${grinder.name}.`}</Body>
          {items.length ? items.map(({ coffee, cal: k }) => (
            <Pressable key={coffee.id} onPress={() => pick(coffee.id)} style={st.row}>
              <View style={st.rowTop}><Text style={st.rowTitle}>{coffee.name}</Text><Text style={st.rowSet}>{k.setting}</Text></View>
              <Text style={st.small}>{fmt(k.dose)} g → {fmt(k.yield)} g · {fmt(k.time)} s · saved {when(k.ts)}</Text>
              {coffeeLine(coffee) ? <Text style={st.small}>{coffeeLine(coffee)}</Text> : null}
            </Pressable>
          )) : <Note>No saved calibrations on this grinder yet. Dial in a coffee first; once it's saved, it appears here.</Note>}
          {!maintain ? <Button title={items.length ? '＋ Dial in a new coffee' : 'Dial in a new coffee'} kind={items.length ? 'secondary' : 'primary'} onPress={onNewCoffee} /> : null}
          <Button title="Cancel" kind="link" onPress={onCancel} />
        </Card>
      ) : null}

      {cal && step !== 'coffee' ? (
        <Card tone="accent">
          <Text style={st.kicker}>SAVED CALIBRATION · {grinder.name.toUpperCase()}</Text>
          <Text style={st.coffee}>{item.coffee.name}</Text>
          <Text style={st.small}>Grinder {cal.setting} · {fmt(cal.dose)} g → {fmt(cal.yield)} g · {fmt(cal.time)} s{cal.doserTime != null ? ` · doser ${fmt(cal.doserTime)} s` : ''}</Text>
          <Text style={st.small}>{cal.roomTemp != null ? `${fmt(cal.roomTemp)} °C · ` : simple ? '' : 'room not measured · '}{cal.humidity != null ? `${fmt(cal.humidity, 0)} % · ` : ''}saved {when(cal.ts)}{cal.imported ? ' · from your earlier shots' : ''}</Text>
        </Card>
      ) : null}

      {step === 'position' ? (
        <Card>
          <Text style={st.h}>IS YOUR GRINDER STILL AT {cal.setting}?</Text>
          <Body muted>Someone may have moved it since. The prediction starts from where it is now.</Body>
          <Segmented options={[{ value: true, label: `Yes, it's on ${cal.setting}` }, { value: false, label: 'No, enter setting' }]} value={still} onChange={v => { setStill(v); setErr(''); }} />
          {still === false ? (
            <View style={st.bigField}>
              <Text style={st.tileLabel}>GRINDER READS NOW</Text>
              <TextInput value={pos} onChangeText={setPos} keyboardType="decimal-pad" placeholder={String(cal.setting)} placeholderTextColor={C.faint} style={st.bigInput} />
            </View>
          ) : null}
          {err ? <Text style={{ color: C.bad }}>{err}</Text> : null}
          <Button title="Next" onPress={confirmPos} />
          <Button title="‹ Choose another coffee" kind="link" onPress={() => setStep('coffee')} />
        </Card>
      ) : null}

      {step === 'room' ? (
        <Card>
          <Text style={st.h}>RIGHT NOW</Text>
          {gauge ? <Body muted>Last time: {cal.roomTemp != null ? `${fmt(cal.roomTemp)} °C` : '–'}, {cal.humidity != null ? `${fmt(cal.humidity, 0)} %` : '–'}. Leave blank if you can't measure.</Body> : null}
          {gauge ? <View style={st.steppers}>
            <Stepper label="ROOM" unit="°C" value={room.roomTemp} onChange={v => setRoom(p => ({ ...p, roomTemp: v }))} step={0.5} />
            <Stepper label="HUMIDITY" unit="%" value={room.humidity} onChange={v => setRoom(p => ({ ...p, humidity: v }))} step={1} decimals={0} />
          </View> : null}
          {fan ? (
            <View style={{ gap: 6 }}>
              <Label>How busy is it?</Label>
              <Segmented options={LOADS} value={Number(room.workload)} onChange={v => setRoom(p => ({ ...p, workload: v }))} />
            </View>
          ) : null}
          <Button title={maintain ? 'Check' : 'Predict my setting'} onPress={() => setStep('predict')} />
          <Button title="‹ Back" kind="link" onPress={() => setStep(maintain ? 'coffee' : 'position')} />
        </Card>
      ) : null}

      {step === 'predict' && r ? (() => {
        const redial = redialCheck(cal, { roomTemp: gauge ? room.roomTemp : null, humidity: gauge ? room.humidity : null, workload: fan ? room.workload : null }, rules);
        return redial ? (
          <Card tone="warn">
            <Text style={st.h}>BIG CHANGE · DIAL IN AGAIN</Text>
            <Body>{`Since this coffee was dialled in: ${redial}. That's too big a jump to predict safely, so dial it in again to set new settings.`}</Body>
            <Button title="Dial in again" onPress={() => onRedial(cid, cal)} />
            <Button title="‹ Back" kind="link" onPress={() => setStep(askNow ? 'room' : maintain ? 'coffee' : 'position')} />
          </Card>
        ) : (
        <Card>
          <Text style={st.h}>{maintain ? (r.status === 'ready' && r.dial.moveShort === 'hold' ? 'NO CHANGE NEEDED' : 'CHANGE TO') : 'START HERE'}</Text>
          <View style={st.facts}>
            <Fact label="GRINDER NOW" value={str(current)} />
            <Fact label="SET TO" value={r.status === 'ready' ? r.dial.text : '–'} strong />
            <Fact label="DOSER" value={r.status === 'ready' && r.dose.seconds != null ? `${fmt(r.dose.seconds)} s` : cal.doserTime != null ? `${fmt(cal.doserTime)} s` : '–'} />
          </View>
          {!simple && !gauge ? <Note>Dial In works without room measurements. For more detailed predictions, consider a digital thermometer and humidity gauge.</Note> : null}
          {r.status === 'ready' && !r.enoughHistory && !simple ? (
            <Note tone="warn">{`Not enough history yet to adjust for: ${r.notApplied.join('; ')}. Start from your saved setting and check the first shot.`}</Note>
          ) : null}
          {simple ? (
            <Pressable onPress={() => setWhy(!why)} hitSlop={6}><Text style={st.why}>{why ? '▾ Hide why' : '▸ Why?'}</Text></Pressable>
          ) : null}
          {!simple || why ? <Recommendation r={r} M={M} grinder={grinder} compact /> : null}
          {maintain ? (
            r.status === 'ready' && r.dial.moveShort === 'hold' ? (
              <>
                <Note>{`Expected to stay inside ${fmt(cal.targetLo, 0)}–${fmt(cal.targetHi, 0)} s. Leave the grinder on ${str(current)}.`}</Note>
                <Button title="Done" onPress={onCancel} />
                <Button title="Pull a check shot anyway" kind="secondary" onPress={() => start('current')} />
              </>
            ) : r.status === 'ready' ? (
              <>
                <Button title={`Set ${r.dial.text} and pull a check shot`} onPress={() => start('predicted')} />
                <Button title="Done (I've made the change)" kind="secondary" onPress={onCancel} />
              </>
            ) : <Button title={`Pull a check shot on ${str(current)}`} onPress={() => start('current')} />
          ) : r.status === 'ready' ? (
            <>
              <Button title={`Pull the first shot on ${r.dial.text}`} onPress={() => start('predicted')} />
              {r.dial.moveShort !== 'hold' ? <Button title={`Start from ${str(current)} instead`} kind="secondary" onPress={() => start('current')} /> : null}
            </>
          ) : <Button title={`Start from ${str(current)}`} onPress={() => start('current')} />}
          <Button title="‹ Back" kind="link" onPress={() => setStep(askNow ? 'room' : maintain ? 'coffee' : 'position')} />
        </Card>
        );
      })() : null}
    </View>
  );
}

function Fact({ label, value, strong }) {
  return (
    <View style={[st.fact, strong && { backgroundColor: C.accent }]}>
      <Text style={[st.tileLabel, strong && { color: C.white }]}>{label}</Text>
      <Text style={st.factVal}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  h: { color: C.ink, fontSize: 15, fontWeight: '800', letterSpacing: 0.8 },
  kicker: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  coffee: { color: C.white, fontSize: 22, fontWeight: '800' },
  small: { color: C.muted, fontSize: 13 },
  row: { borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.md, gap: 2, backgroundColor: C.surface2 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { color: C.ink, fontWeight: '700', fontSize: 16 },
  rowSet: { color: C.accentBright, fontWeight: '800', fontSize: 18 },
  bigField: { backgroundColor: C.accentSoft, borderRadius: R.md, borderWidth: 1, borderColor: '#1D3B7A', padding: S.md, alignItems: 'center', gap: 4 },
  bigInput: { color: C.white, fontSize: 38, fontWeight: '800', minWidth: 120, textAlign: 'center', paddingVertical: 2 },
  tileLabel: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  facts: { flexDirection: 'row', gap: S.sm },
  fact: { flex: 1, backgroundColor: C.surface2, borderRadius: R.md, padding: S.sm, alignItems: 'center', gap: 2 },
  factVal: { color: C.white, fontSize: 24, fontWeight: '800' },
  why: { color: C.accentBright, fontWeight: '700', fontSize: 15 },
  steppers: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
});
