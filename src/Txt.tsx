import React from 'react';
import { Text as RNText, TextProps, StyleSheet } from 'react-native';

// font
const REGULAR = 'Silkscreen_400Regular';
const BOLD = 'Silkscreen_700Bold';

export function Text({ style, ...rest }: TextProps) {
  const flat = StyleSheet.flatten(style) || {};
  const weight = flat.fontWeight;
  const bold = weight === 'bold' || Number(weight) >= 600;

  return (
    <RNText
      {...rest}
      style={[style, { fontFamily: bold ? BOLD : REGULAR, fontWeight: undefined }]}
    />
  );
}