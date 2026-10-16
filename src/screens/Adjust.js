import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';
import { Card, Button, Body, Note, Label, Segmented } from '../components/ui';
import { Stepper } from '../components/visuals';
import Recommendation from '../components/Recommendation';
import { coffeeLine } from '../components/CoffeeForm';
import { recommend, rulesFor, dialMarks, checkDialEntry, fmt, fmtSec, num, redialCheck, warmUpReason, warmUpText } from '../engine';

const LOADS = [{ value: 0, label: 'Quiet' }, { value: 1, label: 'Steady' }, { value: 2, label: 'Busy' }];
const str = v => (v == null || v === '' ? '' : String(v));
const when = ts => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * Mode 2 · Adjust an existing coffee. Uses the coffee's saved calibration on THIS grinder,
 * the grinder's confirmed position and today's room to predict the setting before the first shot.
 */
export default function Adjust({ grinder, items, startCoffeeId, coffeeShots, grinderShots, maintain, simple, onStart, onCancel, onNewCoffee, onRedial, onSetPosition, onPurged }) {
  const rules = rulesFor(grinder);
  const M = dialMarks(rules);
  const gauge = !simple && grinder.gauge === true;
  const fan = rules.burr === 'fan';
  const askNow = gauge || fan;   // anything to ask about right now?
  const [why, setWhy] = useState(false);
  const [cid, setCid] = useState(startCoffeeId && items.some(i => i.coffee.id === startCoffeeId) ? startCoffeeId : null);
  // Always confirm where the grinder is: during service a barista may have moved it without logging a shot
  const afterCoffee = 'position';
  const [step, setStep] = useState(cid ? afterCoffee : 'coffee');
  const [pos, setPos] = useState('');
  const [room, setRoom] = useState({ roomTemp: '', humidity: '', workload: 1 });
  const [err, setErr] = useState('');
  const item = items.find(i => i.coffee.id === cid);
  const cal = item && item.cal;
  // the barista reads the dial and types it: no assumed position, so a moved grinder is always caught
  const current = num(pos);

  // warm-up before any change: first dial-in of the day, >10 min idle, or last shot out of range
  const purgeN = Number.isFinite(Number(rules.purge)) ? Math.max(0, Math.round(Number(rules.purge))) : 3;
  const [warmReason] = useState(() => (purgeN > 0 ? warmUpReason(grinderShots, grinder.purgedAt) : null));
  const [warmCount, setWarmCount] = useState(0);
  const [warmed, setWarmed] = useState(false);
  const afterPos = () => setStep(askNow ? 'room' : 'predict');
  const finishWarm = () => { setWarmed(true); if (onPurged) onPurged(); afterPos(); };
  const pick = id => { setCid(id); setPos(''); setErr(''); setStep(afterCoffee); };
  const confirmPos = () => {
    const s = num(pos); if (s === null) return setErr('Enter what the grinder reads now.');
    const de = checkDialEntry(s, M); if (de) return setErr(de);
    if (onSetPosition) onSetPosition(s); // remember the grinder's real position
    setErr('');
    if (warmReason && !warmed) setStep('warmup'); else afterPos();
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
      recEntry: r && r.status === 'ready' ? num(r.dial.entry) : null, // what was recommended, to tell later whether it was followed
      predTime: usePred ? Math.round(r.predictedTime * 10) / 10 : (r && r.status === 'ready' ? Math.round(r.ifUnchanged * 10) / 10 : null),
      roomTemp: room.roomTemp, humidity: room.humidity, workload: room.workload,
      warmedUp: warmed || !warmReason,
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
          <Text style={st.small}>Grinder {cal.setting} · {fmt(cal.dose)} g → {fmt(cal.yield)} g · {fmt(cal.time)} s{cal.doserTime != null ? ` · doser ${fmtSec(cal.doserTime)} s` : ''}</Text>
          <Text style={st.small}>{cal.roomTemp != null ? `${fmt(cal.roomTemp)} °C · ` : simple ? '' : 'room not measured · '}{cal.humidity != null ? `${fmt(cal.humidity, 0)} % · ` : ''}saved {when(cal.ts)}{cal.imported ? ' · from your earlier shots' : ''}</Text>
        </Card>
      ) : null}

      {step === 'position' ? (
        <Card>
          <Text style={st.h}>WHAT DOES YOUR GRINDER READ NOW?</Text>
          <View style={st.bigField}>
            <Text style={st.tileLabel}>GRINDER READS</Text>
            <TextInput value={pos} onChangeText={v => { setPos(v); setErr(''); }} keyboardType="decimal-pad" placeholder="–" placeholderTextColor={C.faint}
              style={st.bigInput} autoFocus accessibilityLabel="Grinder setting now" />
          </View>
          {err ? <Text style={{ color: C.bad }}>{err}</Text> : null}
          <Button title="Next" onPress={confirmPos} />
          <Button title="‹ Choose another coffee" kind="link" onPress={() => setStep('coffee')} />
        </Card>
      ) : null}

      {step === 'warmup' ? (
        <Card>
          <Text style={st.h}>RUN {purgeN} SHOT{purgeN === 1 ? '' : 'S'} FIRST</Text>
          <Body muted>{`${warmUpText(warmReason, purgeN, grinder.name)} Keep the grinder on ${str(current)} for now. These shots aren't logged.`}</Body>
          <View style={st.purgeRow}>
            {Array.from({ length: purgeN }, (_, i) => {
              const on = i < warmCount;
              return (
                <Pressable key={i} onPress={() => setWarmCount(on ? i : i + 1)} style={[st.purgeDot, on && st.purgeOn]}
                  accessibilityRole="button" accessibilityLabel={`Shot ${i + 1} ${on ? 'run' : 'not run yet'}`}>
                  <Text style={[st.purgeText, on && { color: C.onTeal }]}>{on ? '✓' : i + 1}</Text>
                </Pressable>
              );
            })}
          </View>
          <Button title={warmCount + 1 >= purgeN ? `Done, ${purgeN} shot${purgeN === 1 ? '' : 's'} run` : `Shot ${warmCount + 1} run`}
            onPress={() => (warmCount + 1 >= purgeN ? finishWarm() : setWarmCount(n => n + 1))} />
          <Pressable onPress={finishWarm} hitSlop={6}><Text style={st.skip}>Skip, already done</Text></Pressable>
          <Button title="‹ Back" kind="link" onPress={() => setStep('position')} />
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
          {err ? <Text style={{ color: C.bad }}>{err}</Text> : null}
          <Button title={maintain ? 'Check' : 'Predict my setting'} onPress={() => {
            if (gauge && (num(room.roomTemp) === null || num(room.humidity) === null)) return setErr('Enter the room temperature and humidity.');
            setErr(''); setStep('predict');
          }} />
          <Button title="‹ Back" kind="link" onPress={() => setStep('position')} />
        </Card>
      ) : null}

      {step === 'predict' && r ? (() => {
        const redial = redialCheck(cal, { roomTemp: gauge ? room.roomTemp : null, humidity: gauge ? room.humidity : null, workload: fan ? room.workload : null }, rules);
        return redial ? (
          <Card tone="warn">
            <Text style={st.h}>BIG CHANGE · DIAL IN AGAIN</Text>
            <Body>{`Since this coffee was dialled in: ${redial}. That's too big a jump to predict safely, so dial it in again to set new settings.`}</Body>
            <Button title="Dial in again" onPress={() => onRedial(cid, cal)} />
            <Button title="‹ Back" kind="link" onPress={() => setStep(askNow ? 'room' : 'position')} />
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
            <Note tone="warn">{`Still learning how ${r.uncertain.join('; ')} affects this grinder. Pull a check shot to confirm.`}</Note>
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
                <Button title="Done, I've set it" kind="secondary" onPress={() => { if (onSetPosition && num(r.dial.entry) !== null) onSetPosition(num(r.dial.entry)); onCancel(); }} />
              </>
            ) : <Button title={`Pull a check shot on ${str(current)}`} onPress={() => start('current')} />
          ) : r.status === 'ready' ? (
            <>
              <Button title={`Pull the first shot on ${r.dial.text}`} onPress={() => start('predicted')} />
              {r.dial.moveShort !== 'hold' ? <Button title={`Start from ${str(current)} instead`} kind="secondary" onPress={() => start('current')} /> : null}
            </>
          ) : <Button title={`Start from ${str(current)}`} onPress={() => start('current')} />}
          <Button title="‹ Back" kind="link" onPress={() => setStep(askNow ? 'room' : 'position')} />
        </Card>
        );
      })() : null}
    </View>
  );
}

function Fact({ label, value, strong }) {
  return (
    <View style={[st.fact, strong && { backgroundColor: C.teal }]}>
      <Text style={[st.tileLabel, strong && { color: C.onTeal }]}>{label}</Text>
      <Text style={[st.factVal, strong && { color: C.onTeal }]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  h: { color: C.ink, fontSize: 15, fontWeight: '800', letterSpacing: 0.8 },
  purgeRow: { flexDirection: 'row', justifyContent: 'center', gap: S.md, marginVertical: 4 },
  purgeDot: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, borderColor: C.teal, alignItems: 'center', justifyContent: 'center' },
  purgeOn: { backgroundColor: C.teal },
  purgeText: { color: C.teal, fontSize: 20, fontWeight: '800' },
  skip: { color: C.faint, fontSize: 14, textAlign: 'center', marginTop: 2 },
  kicker: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  coffee: { color: C.white, fontSize: 22, fontWeight: '800' },
  small: { color: C.muted, fontSize: 13 },
  row: { borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.md, gap: 2, backgroundColor: C.surface2 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { color: C.ink, fontWeight: '700', fontSize: 16 },
  rowSet: { color: C.teal, fontWeight: '800', fontSize: 18 },
  bigField: { backgroundColor: C.accentSoft, borderRadius: R.md, borderWidth: 1, borderColor: C.accentLine, padding: S.md, alignItems: 'center', gap: 4 },
  bigInput: { color: C.white, fontSize: 38, fontWeight: '800', minWidth: 120, textAlign: 'center', paddingVertical: 2 },
  tileLabel: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  facts: { flexDirection: 'row', gap: S.sm },
  fact: { flex: 1, backgroundColor: C.surface2, borderRadius: R.md, padding: S.sm, alignItems: 'center', gap: 2 },
  factVal: { color: C.white, fontSize: 24, fontWeight: '800' },
  why: { color: C.accentBright, fontWeight: '700', fontSize: 15 },
  steppers: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
});
