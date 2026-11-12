import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ControlsList, ConversationView, MirrorView } from '@/components/remote-views';
import { Button, Logo, NoticeBanner, type StatusTone, StatusPill, Surface, Text, inputStyle } from '@/components/ui';
import { findStop, kindOf } from '@/remote/elements';
import type { UiElement } from '@/remote/wire';
import { type Phase, useRemote } from '@/state/remote';
import { useTheme } from '@/theme';

const STATUS: Record<Phase, { tone: StatusTone; label: string }> = {
  loading: { tone: 'neutral', label: 'Starting' },
  unpaired: { tone: 'neutral', label: 'Not paired' },
  connecting: { tone: 'brand', label: 'Connecting' },
  connected: { tone: 'success', label: 'Connected' },
  unreachable: { tone: 'warning', label: 'Offline' },
  disabled: { tone: 'warning', label: 'Phone control off' },
  busy: { tone: 'warning', label: 'Busy' },
  revoked: { tone: 'danger', label: 'Forgotten' },
  incompatible: { tone: 'danger', label: 'Update needed' },
};

/** Plain-language recovery for each state; desktop messages are shown, never parsed. */
const RECOVERY: Partial<Record<Phase, { title: string; body: string }>> = {
  connecting: { title: 'Connecting to your computer…', body: 'This can take a few seconds on mobile data.' },
  unreachable: {
    title: 'Open Sovra on your computer',
    body: 'Your computer must be awake, online and running Sovra, with Skills → “Use Sovra from your phone” switched on (it turns off whenever Sovra restarts). We keep trying while this screen is open.',
  },
  disabled: {
    title: 'Start remote control on your computer',
    body: 'In Sovra, go to Skills → “Use Sovra from your phone”. For your safety it switches off whenever Sovra restarts.',
  },
  busy: { title: 'Sovra is busy', body: 'Another phone may be in control, or a new phone is being paired. Try again shortly.' },
  incompatible: { title: 'Update needed', body: 'This app and Sovra on your computer speak different versions. Update both.' },
};

const KEYS: { label: string; key: string; hint: string }[] = [
  { label: 'Enter', key: 'enter', hint: 'Presses Enter' },
  { label: 'Esc', key: 'escape', hint: 'Presses Escape' },
  { label: 'Tab', key: 'tab', hint: 'Moves to the next control' },
  { label: '⌫', key: 'backspace', hint: 'Deletes one character' },
  { label: '↑', key: 'up', hint: 'Arrow up' },
  { label: '↓', key: 'down', hint: 'Arrow down' },
];

type Mode = 'chat' | 'screen' | 'controls';

export default function Remote() {
  const theme = useTheme();
  const { phase, desktop, snapshot, screenshot, detail, notice, working } = useRemote();
  const [mode, setMode] = useState<Mode>('chat');
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  // Foreground only: start on focus, stop on blur or when the app is backgrounded.
  useFocusEffect(
    useCallback(() => {
      const remote = useRemote.getState();
      if (AppState.currentState === 'active') remote.startLive();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') useRemote.getState().startLive();
        else useRemote.getState().stopLive();
      });
      return () => {
        subscription.remove();
        useRemote.getState().stopLive();
      };
    }, []),
  );

  useEffect(() => {
    if (phase === 'revoked' || phase === 'unpaired') router.replace('/pair');
  }, [phase]);

  const stop = useMemo(() => (snapshot ? findStop(snapshot) : null), [snapshot]);
  const live = phase === 'connected' && snapshot !== null;
  const status = STATUS[phase];
  const recovery = RECOVERY[phase];

  const press = (element: UiElement) => {
    void useRemote.getState().act({ kind: 'click', element });
    if (kindOf(element) === 'text') setMode('chat');
  };
  const scroll = (element: UiElement, lines: number) => void useRemote.getState().act({ kind: 'scroll', element, lines });

  const send = async () => {
    const text = draft;
    if (!text.trim()) return;
    const sent = await useRemote.getState().send(text);
    if (sent) setDraft('');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, padding: theme.space.medium, gap: theme.space.medium }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.small + 4 }}>
            <Logo size={theme.layout.logoSmall} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="sectionTitle" numberOfLines={1}>
                {desktop?.name ?? 'Your computer'}
              </Text>
              <StatusPill tone={status.tone} label={status.label} />
            </View>
            <Button label="Settings" size="compact" variant="ghost" onPress={() => router.push('/settings')} />
          </View>

          {notice ? <NoticeBanner tone={notice.tone} text={notice.text} onDismiss={() => useRemote.getState().dismissNotice()} /> : null}

          {recovery && !live ? (
            <Surface variant="elevated" style={{ gap: theme.space.small + 4 }}>
              <Text variant="sectionTitle">{recovery.title}</Text>
              <Text tone="secondary">{recovery.body}</Text>
              {detail ? (
                <Text variant="caption" tone="muted">
                  {detail}
                </Text>
              ) : null}
              {phase !== 'connecting' ? (
                <Button label="Try again now" variant="primary" onPress={() => useRemote.getState().startLive()} />
              ) : null}
            </Surface>
          ) : null}

          {snapshot ? (
            <>
              <View
                accessibilityRole="tablist"
                style={{ flexDirection: 'row', padding: 3, borderRadius: theme.radius.button, backgroundColor: theme.colors.hover }}>
                {(['chat', 'screen', 'controls'] as Mode[]).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mode === value }}
                    onPress={() => setMode(value)}
                    style={{
                      flex: 1,
                      minHeight: theme.layout.compactControl,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: theme.radius.button - 2,
                      backgroundColor: mode === value ? theme.colors.surface : 'transparent',
                    }}>
                    <Text variant="label" tone={mode === value ? 'primary' : 'secondary'}>
                      {value === 'chat' ? 'Chat' : value === 'screen' ? 'Screen' : 'Controls'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={{ flex: 1, opacity: live ? 1 : 0.5 }}>
                {mode === 'chat' ? <ConversationView snapshot={snapshot} onScroll={scroll} disabled={!live || working} /> : null}
                {mode === 'screen' ? (
                  <View style={{ gap: theme.space.small }}>
                    <MirrorView snapshot={snapshot} screenshot={screenshot} onPress={press} onScroll={scroll} disabled={!live || working} />
                    <Text variant="caption" tone="muted">
                      Tap any outlined control to press it on your computer.
                    </Text>
                  </View>
                ) : null}
                {mode === 'controls' ? <ControlsList snapshot={snapshot} onPress={press} onScroll={scroll} disabled={!live || working} /> : null}
              </View>

              <View style={{ flexDirection: 'row', gap: theme.space.compact, flexWrap: 'wrap' }}>
                {KEYS.map((entry) => (
                  <Button
                    key={entry.key}
                    label={entry.label}
                    size="compact"
                    accessibilityHint={entry.hint}
                    disabled={!live || working}
                    onPress={() => void useRemote.getState().act({ kind: 'key', key: entry.key })}
                    style={{ flexGrow: 1 }}
                  />
                ))}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  gap: theme.space.small,
                  padding: theme.space.small,
                  borderRadius: theme.radius.panel,
                  borderWidth: focused ? 1.5 : theme.layout.hairline,
                  borderColor: focused ? theme.colors.composerFocusBorder : theme.colors.composerBorder,
                  backgroundColor: theme.colors.composerBackground,
                  boxShadow: focused ? `0 0 15px ${theme.colors.composerFocusBorder}` : undefined,
                }}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Message Sovra on your computer"
                  placeholderTextColor={theme.colors.mutedText}
                  multiline
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  accessibilityLabel="Message to send to Sovra"
                  style={{ ...inputStyle(theme), borderWidth: 0, flex: 1, maxHeight: 140, paddingTop: 10, backgroundColor: 'transparent' }}
                />
                {stop ? (
                  <Button
                    label="Stop"
                    size="compact"
                    accessibilityHint="Stops what Sovra is doing"
                    onPress={() => void useRemote.getState().stop()}
                    style={{ backgroundColor: theme.colors.stopBackground, borderRadius: theme.radius.pill }}
                  />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send"
                  accessibilityState={{ disabled: !live || !draft.trim() || working }}
                  disabled={!live || !draft.trim() || working}
                  onPress={send}
                  style={{
                    height: theme.layout.compactControl,
                    paddingHorizontal: theme.space.medium,
                    borderRadius: theme.radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: draft.trim() && live ? theme.colors.sendReadyBackground : theme.colors.hover,
                  }}>
                  <Text variant="label" style={{ color: draft.trim() && live ? theme.colors.sendReadyForeground : theme.colors.mutedText }}>
                    {working ? 'Sending…' : 'Send'}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
