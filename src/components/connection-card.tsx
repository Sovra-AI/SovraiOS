/**
 * Live progress while the phone connects: each step, how long it has been trying, the
 * countdown to the next try, and what to check. Ticks once a second while shown.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { ConnectionProgress } from '@/state/remote';
import { useTheme } from '@/theme';

import { type StepState, describeConnection, pairingStatus, showConnectionCard } from './connection-status';
import { Button, Surface, Text } from './ui';

function StepMark({ state }: { state: StepState }) {
  const theme = useTheme();
  if (state === 'active') return <ActivityIndicator size="small" color={theme.colors.ring} style={{ width: 20, height: 20 }} />;
  return (
    <View
      style={{
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: state === 'done' ? theme.colors.success : 'transparent',
        borderWidth: state === 'done' ? 0 : theme.layout.hairline * 2,
        borderColor: theme.colors.controlBorder,
      }}>
      {state === 'done' ? (
        <Text variant="caption" style={{ color: theme.colors.statusInk, fontWeight: '700' }}>
          ✓
        </Text>
      ) : null}
    </View>
  );
}

export function ConnectionCard({
  progress,
  computer,
  detail,
  onRetry,
}: {
  progress: ConnectionProgress;
  computer: string;
  detail: string | null;
  onRetry: () => void;
}) {
  const theme = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!showConnectionCard(progress, now)) return null;
  const view = describeConnection(progress, computer, now, detail);
  return (
    <Surface variant="elevated" style={{ gap: theme.space.small + 4 }}>
      <View accessible accessibilityRole="header" accessibilityLiveRegion="polite">
        <Text variant="sectionTitle">{view.title}</Text>
        <Text variant="caption" tone="secondary">
          {view.status}
        </Text>
      </View>
      {view.steps.map((step) => (
        <View
          key={step.label}
          accessible
          accessibilityLabel={`${step.label}. ${step.state === 'done' ? 'Done' : step.state === 'active' ? 'In progress' : 'Next'}. ${step.detail}`}
          style={{ flexDirection: 'row', gap: theme.space.small + 4, alignItems: 'flex-start' }}>
          <StepMark state={step.state} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text tone={step.state === 'todo' ? 'muted' : 'primary'}>{step.label}</Text>
            <Text variant="caption" tone="muted">
              {step.detail}
            </Text>
          </View>
        </View>
      ))}
      {view.hint ? <Text tone="secondary">{view.hint}</Text> : null}
      {view.canRetryNow ? <Button label="Try now" variant="primary" onPress={onRetry} /> : null}
    </Surface>
  );
}

/** Elapsed pairing time, ticking once a second while `active`. */
export function usePairingStatus(active: boolean): string | null {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => {
      clearInterval(timer);
      setElapsed(0);
    };
  }, [active]);
  return active ? pairingStatus(elapsed) : null;
}
