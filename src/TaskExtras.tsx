import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useTheme, space } from './theme';
import { Field } from './ui';
import { Text } from './Txt';
import { RepeatCheck, RepeatOptions } from './RepeatPicker';
import { MAX_DETAILS_LENGTH } from './store';
import type { Repeat } from './recurrence';

// details - optional notes under a task
export function DetailsField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field
      value={value}
      onChangeText={onChange}
      placeholder="Details (optional)…"
      accessibilityLabel="Details"
      maxLength={MAX_DETAILS_LENGTH}
      multiline
      style={{ minHeight: 84, maxHeight: 180, fontSize: 14, textAlignVertical: 'top' }}
    />
  );
}

// extras - details and repeat for a task being added; folded away until wanted
export function TaskExtras({
  day, details, repeat, onDetails, onRepeat,
}: {
  day: string;
  details: string;
  repeat: Repeat | null;
  onDetails: (v: string) => void;
  onRepeat: (r: Repeat | null) => void;
}) {
  const t = useTheme();
  const [showDetails, setShowDetails] = useState(details !== '');

  return (
    <View style={{ gap: space(1.5) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
        <RepeatCheck value={repeat} start={day} onChange={onRepeat} />
        <Pressable
          // hiding the field never hides text the user typed
          onPress={() => setShowDetails(s => details !== '' || !s)}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={{ color: t.accent, fontSize: 13 }}>{showDetails ? 'Details' : '+ Details'}</Text>
        </Pressable>
      </View>
      {showDetails && <DetailsField value={details} onChange={onDetails} />}
      {repeat && <RepeatOptions value={repeat} start={day} onChange={onRepeat} />}
    </View>
  );
}
