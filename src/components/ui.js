import React from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { C, S, R } from '../theme';

export function Label({ children, style }) {
  return <Text style={[st.label, style]}>{children}</Text>;
}

export function Card({ children, style, tone }) {
  return <View style={[st.card, tone === 'accent' && st.cardAccent, tone === 'warn' && st.cardWarn, style]}>{children}</View>;
}

export function H2({ children, style }) {
  return <Text style={[st.h2, style]}>{children}</Text>;
}

export function Body({ children, style, muted }) {
  return <Text style={[st.body, muted && { color: C.muted }, style]}>{children}</Text>;
}

/** Numeric or text input with a label. width: 'half' | 'third' | 'full' */
export function Field({ label, value, onChangeText, placeholder, keyboardType = 'decimal-pad', width = 'half', editable = true }) {
  return (
    <View style={[st.field, width === 'full' && { flexBasis: '100%' }, width === 'third' && { flexBasis: '30%' }]}>
      <Label>{label}</Label>
      <TextInput
        style={[st.input, !editable && { opacity: 0.5 }]}
        value={value == null ? '' : String(value)}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.faint}
        keyboardType={keyboardType}
        editable={editable}
        returnKeyType="done"
      />
    </View>
  );
}

export function Grid({ children, style }) {
  return <View style={[st.grid, style]}>{children}</View>;
}

/** Row of equal buttons, one selected. options: [{ value, label }] */
export function Segmented({ options, value, onChange, disabled }) {
  return (
    <View style={st.seg}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} disabled={disabled} onPress={() => onChange(o.value)}
            style={[st.segItem, on && st.segOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
            <Text style={[st.segText, on && st.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Horizontal chips. items: [{ key, label }] */
export function Chips({ items, value, onChange, addLabel, onAdd }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, paddingRight: S.lg }}>
      {items.map(i => {
        const on = i.key === value;
        return (
          <Pressable key={i.key} onPress={() => onChange(i.key)} style={[st.chip, on && st.chipOn, i.dim && { opacity: 0.6 }]}>
            <Text style={[st.chipText, on && st.chipTextOn]}>{i.label}</Text>
          </Pressable>
        );
      })}
      {onAdd ? (
        <Pressable onPress={onAdd} style={[st.chip, st.chipAdd]}>
          <Text style={[st.chipText, { color: C.accentBright }]}>＋ {addLabel}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

export function Button({ title, onPress, kind = 'primary', disabled, style }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [st.btn, kind === 'secondary' && st.btnSecondary, kind === 'link' && st.btnLink,
        disabled && { opacity: 0.4 }, pressed && { opacity: 0.8 }, style]}>
      <Text style={[st.btnText, kind !== 'primary' && { color: C.accentBright }]}>{title}</Text>
    </Pressable>
  );
}

export function Note({ children, tone }) {
  return (
    <View style={[st.note, tone === 'warn' && { borderColor: C.warn }]}>
      <Text style={[st.body, tone === 'warn' && { color: C.warn }]}>{children}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  label: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: S.lg, gap: S.md },
  cardAccent: { backgroundColor: C.accentSoft, borderColor: C.papaya, borderWidth: 1.5 },
  cardWarn: { borderColor: C.warn },
  h2: { color: C.ink, fontSize: 18, fontWeight: '700' },
  body: { color: C.ink, fontSize: 14, lineHeight: 20 },
  field: { flexBasis: '47%', flexGrow: 1 },
  input: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: R.sm, color: C.ink,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.md },
  seg: { flexDirection: 'row', borderWidth: 1, borderColor: C.line, borderRadius: R.sm, overflow: 'hidden' },
  segItem: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: C.surface2 },
  segOn: { backgroundColor: C.accent },
  segText: { color: C.muted, fontWeight: '600', fontSize: 13 },
  segTextOn: { color: C.onAccent },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipAdd: { borderStyle: 'dashed', borderColor: C.papaya, backgroundColor: 'transparent' },
  chipText: { color: C.ink, fontWeight: '600', fontSize: 14 },
  chipTextOn: { color: C.onAccent },
  btn: { backgroundColor: C.accent, borderRadius: R.pill, paddingVertical: 13, paddingHorizontal: 18, alignItems: 'center' },
  btnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line },
  btnLink: { backgroundColor: 'transparent', paddingVertical: 6, paddingHorizontal: 0, alignItems: 'flex-start' },
  btnText: { color: C.onAccent, fontWeight: '700', fontSize: 15 },
  note: { borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.md },
});
