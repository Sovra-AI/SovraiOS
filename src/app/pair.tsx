import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, Logo, NoticeBanner, Surface, Text, inputStyle } from '@/components/ui';
import { usePairingDraft } from '@/state/pairing';
import { useRemote } from '@/state/remote';
import { useTheme } from '@/theme';

const STEPS = [
  'Open Sovra on your computer.',
  'Go to Skills → “Use Sovra from your phone” (or type /remote-control in a chat).',
  'Scan the code it shows. It works once and expires after five minutes.',
];

export default function Pair() {
  const theme = useTheme();
  const draft = usePairingDraft();
  const phase = useRemote((state) => state.phase);
  const detail = useRemote((state) => state.detail);
  const notice = useRemote((state) => state.notice);
  const [focused, setFocused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pasteLink = async () => {
    setError(null);
    const link = await Clipboard.getStringAsync();
    if (!link.startsWith('sovra://remote-control')) {
      setError('Your clipboard does not hold a Sovra pairing link. Copy it on your computer first.');
      return;
    }
    setBusy(true);
    const result = await useRemote.getState().pair(link, draft.phoneName, draft.desktopName);
    setBusy(false);
    // Do not leave a bearer invitation lying in the clipboard.
    void Clipboard.setStringAsync('');
    if (result.ok) router.replace('/remote');
    else setError(result.message);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: theme.space.large, gap: theme.space.large, maxWidth: theme.layout.readingWidth, width: '100%', alignSelf: 'center' }}
          keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: theme.space.medium, paddingTop: theme.space.extra }}>
            <Logo size={theme.layout.logoHero} />
            <Text variant="pageTitle" style={{ textAlign: 'center' }}>
              Use Sovra from your phone
            </Text>
            <Text tone="secondary" style={{ textAlign: 'center' }}>
              Pair once. After that, opening this app connects to your computer by itself — on Wi-Fi or mobile data.
            </Text>
          </View>

          {phase === 'revoked' ? (
            <NoticeBanner tone="warning" text={detail ?? 'Your computer no longer recognises this phone. Pair again.'} />
          ) : null}
          {notice ? <NoticeBanner tone={notice.tone} text={notice.text} onDismiss={() => useRemote.getState().dismissNotice()} /> : null}

          <Surface>
            {STEPS.map((step, index) => (
              <View key={step} style={{ flexDirection: 'row', gap: theme.space.small + 4, alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: theme.colors.selection,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text variant="caption" tone="link" style={{ fontWeight: '700' }}>
                    {index + 1}
                  </Text>
                </View>
                <Text style={{ flex: 1 }}>{step}</Text>
              </View>
            ))}
          </Surface>

          <View style={{ gap: theme.space.medium }}>
            <Field label="This phone's name" hint="Shown on your computer so you can recognise and forget it.">
              <TextInput
                value={draft.phoneName}
                onChangeText={(phoneName) => draft.set({ phoneName })}
                maxLength={80}
                onFocus={() => setFocused('phone')}
                onBlur={() => setFocused(null)}
                style={inputStyle(theme, focused === 'phone')}
                placeholderTextColor={theme.colors.mutedText}
                accessibilityLabel="This phone's name"
              />
            </Field>
            <Field label="Your computer's name">
              <TextInput
                value={draft.desktopName}
                onChangeText={(desktopName) => draft.set({ desktopName })}
                maxLength={80}
                onFocus={() => setFocused('desktop')}
                onBlur={() => setFocused(null)}
                style={inputStyle(theme, focused === 'desktop')}
                placeholderTextColor={theme.colors.mutedText}
                accessibilityLabel="Your computer's name"
              />
            </Field>
          </View>

          {error ? <NoticeBanner tone="danger" text={error} /> : null}

          <View style={{ gap: theme.space.small + 4 }}>
            <Button label="Scan the code" variant="primary" onPress={() => router.push('/scan')} disabled={busy} />
            <Button label="Paste a pairing link instead" variant="ghost" onPress={pasteLink} busy={busy} />
          </View>

          <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
            Everything is end-to-end encrypted between this phone and your computer. Your computer must be awake, online and
            running Sovra.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
