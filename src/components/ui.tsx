/**
 * Sovra primitives for mobile: text roles, buttons, surfaces and status. Every
 * colour comes from `useTheme()`; raw values live only in `src/theme/tokens.ts`.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  type StyleProp,
  Text as RNText,
  type TextProps,
  type TextStyle,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { type Theme, useTheme } from '@/theme';

type Role = keyof Theme['type'];

export function Text({
  variant = 'body',
  tone = 'primary',
  style,
  ...props
}: TextProps & { variant?: Role; tone?: 'primary' | 'secondary' | 'muted' | 'link' | 'danger' | 'success' | 'warning' }) {
  const theme = useTheme();
  const color = {
    primary: theme.colors.text,
    secondary: theme.colors.secondaryText,
    muted: theme.colors.mutedText,
    link: theme.colors.link,
    danger: theme.colors.danger,
    success: theme.colors.success,
    warning: theme.colors.warning,
  }[tone];
  return <RNText {...props} style={[theme.type[variant] as TextStyle, { color }, style]} />;
}

export function Surface({
  variant = 'card',
  style,
  ...props
}: ViewProps & { variant?: 'card' | 'subtle' | 'elevated' }) {
  const theme = useTheme();
  const base: ViewStyle = {
    backgroundColor: variant === 'subtle' ? theme.colors.hover : theme.colors.surface,
    borderRadius: theme.radius.card,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.border,
    padding: theme.space.medium,
    gap: theme.space.small,
  };
  const elevated: ViewStyle =
    variant === 'elevated'
      ? { borderRadius: theme.radius.panel, boxShadow: theme.dark ? '0 8px 24px rgba(0,0,0,0.45)' : '0 8px 24px rgba(17,18,22,0.10)' }
      : {};
  return <View {...props} style={[base, elevated, style]} />;
}

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'regular' | 'compact';
  icon?: ReactNode;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, variant = 'secondary', size = 'regular', icon, busy, disabled, style, onPress, ...props }: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || busy;
  const foreground =
    variant === 'primary'
      ? theme.colors.primaryForeground
      : variant === 'danger'
        ? theme.colors.danger
        : variant === 'ghost'
          ? theme.colors.link
          : theme.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={(event) => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress?.(event);
      }}
      style={({ pressed }) => [
        {
          minHeight: size === 'compact' ? theme.layout.compactControl : theme.layout.control,
          paddingHorizontal: size === 'compact' ? theme.space.medium - 4 : theme.space.medium,
          borderRadius: theme.radius.button,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.space.small,
          opacity: inactive ? 0.5 : 1,
        },
        variant === 'primary' && {
          backgroundImage: pressed ? theme.colors.primaryGradientPressed : theme.colors.primaryGradient,
          backgroundColor: pressed ? theme.colors.primaryPressed : theme.colors.primary,
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        },
        variant === 'secondary' && {
          backgroundColor: pressed ? theme.colors.hover : theme.colors.surface,
          borderWidth: theme.layout.hairline,
          borderColor: theme.colors.border,
        },
        variant === 'danger' && {
          backgroundColor: pressed ? theme.colors.hover : theme.colors.surface,
          borderWidth: theme.layout.hairline,
          borderColor: theme.colors.danger,
        },
        variant === 'ghost' && { backgroundColor: pressed ? theme.colors.selection : 'transparent' },
        style,
      ]}
      {...props}>
      {busy ? <ActivityIndicator color={foreground} /> : icon}
      <Text variant="label" style={{ color: foreground }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'brand';

export function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  const theme = useTheme();
  const color = {
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
    neutral: theme.colors.mutedText,
    brand: theme.colors.link,
  }[tone];
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.snug,
        paddingHorizontal: theme.space.small + 2,
        paddingVertical: theme.space.compact,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.hover,
        alignSelf: 'flex-start',
      }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text variant="caption" tone="secondary" style={{ fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

export function Logo({ size }: { size: number }) {
  return (
    <Image
      source={require('@/assets/images/sovra-logo.svg')}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="Sovra"
    />
  );
}

export function NoticeBanner({ tone, text, onDismiss }: { tone: 'info' | 'success' | 'warning' | 'danger'; text: string; onDismiss?: () => void }) {
  const theme = useTheme();
  const accent = { info: theme.colors.link, success: theme.colors.success, warning: theme.colors.warning, danger: theme.colors.danger }[tone];
  return (
    <Pressable
      accessibilityRole="alert"
      accessibilityHint={onDismiss ? 'Double tap to dismiss' : undefined}
      onPress={onDismiss}
      style={{
        flexDirection: 'row',
        gap: theme.space.small,
        padding: theme.space.small + 4,
        borderRadius: theme.radius.button,
        backgroundColor: theme.colors.surface,
        borderWidth: theme.layout.hairline,
        borderColor: theme.colors.border,
        borderLeftWidth: 3,
        borderLeftColor: accent,
      }}>
      <Text variant="caption" style={{ flex: 1 }}>
        {text}
      </Text>
    </Pressable>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space.snug }}>
      <Text variant="caption" tone="secondary" style={{ fontWeight: '600' }}>
        {label}
      </Text>
      {children}
      {hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function inputStyle(theme: Theme, focused = false): TextStyle {
  return {
    ...(theme.type.body as TextStyle),
    color: theme.colors.text,
    minHeight: theme.layout.control,
    paddingHorizontal: theme.space.small + 4,
    borderRadius: theme.radius.input,
    borderWidth: focused ? 2 : theme.layout.hairline,
    borderColor: focused ? theme.colors.ring : theme.colors.controlBorder,
    backgroundColor: theme.colors.surface,
  };
}
