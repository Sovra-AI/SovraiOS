/**
 * Live progress while the phone connects: each step, how long it has been trying, the
 * countdown to the next try, and what to check. Ticks once a second while shown.
 */
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import type { AttemptRecord, ConnectionProgress } from '@/state/remote';
import { useTheme } from '@/theme';

import { type StepState, describeConnection, diagnosticLines, pairingStatus, shortLogLine, showConnectionCard } from './connection-status';
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

/** Developer mode: every failed try, the transport's report, and a way to copy them. */
const LOG_LINES_SHOWN = 120;

export function DeveloperPanel({
  attempts,
  diagnostics,
  route,
  phase,
  readLog,
}: {
  attempts: AttemptRecord[];
  diagnostics: string | null;
  route: string | null;
  phase: string;
  /** The transport's live log; polled while the panel is shown. */
  readLog?: () => string[];
}) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    if (!readLog) return;
    const read = () => setLog(readLog());
    const timer = setInterval(read, 1500);
    const first = setTimeout(read, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [readLog]);
  const copy = () => {
    // Public facts only: no keys or pairing link are ever in this report or the log.
    const report = { phase, route, attempts, diagnostics: diagnostics ? (JSON.parse(diagnostics) as unknown) : null, log: readLog?.() ?? [] };
    void Clipboard.setStringAsync(JSON.stringify(report, null, 2)).then(() => setCopied(true));
  };
  return (
    <Surface variant="subtle" style={{ gap: theme.space.snug }}>
      <Text variant="sectionTitle">Developer details</Text>
      <Text variant="caption" tone="secondary">
        State: {phase}
        {route ? ` · route: ${route}` : ''}
      </Text>
      {diagnosticLines(diagnostics).map((line) => (
        <Text key={line} variant="caption" tone="secondary" selectable>
          {line}
        </Text>
      ))}
      {attempts.length > 0 ? <Text variant="caption">Failed tries (newest first)</Text> : null}
      {attempts.map((attempt) => (
        <Text key={`${attempt.at}-${attempt.attempt}`} variant="caption" tone="muted" selectable>
          #{attempt.attempt} {new Date(attempt.at).toLocaleTimeString()} · {attempt.ms} ms · {attempt.code}: {attempt.message}
        </Text>
      ))}
      {readLog ? (
        <>
          <Text variant="caption">Transport log (newest last, {log.length} lines)</Text>
          <ScrollView
            style={{ maxHeight: 280, borderRadius: theme.radius.button, backgroundColor: theme.colors.codeBackground }}
            contentContainerStyle={{ padding: theme.space.small }}
            nestedScrollEnabled>
            <Text selectable style={{ fontFamily: 'Menlo', fontSize: 10, lineHeight: 13, color: theme.colors.secondaryText }}>
              {log.slice(-LOG_LINES_SHOWN).map(shortLogLine).join('\n') || 'Nothing logged yet.'}
            </Text>
          </ScrollView>
        </>
      ) : null}
      <Button label={copied ? 'Copied' : 'Copy details'} size="compact" onPress={copy} />
    </Surface>
  );
}
