import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';

import { Button, Surface, Text } from '@/components/ui';
import { enableDeveloperLog, phoneSecret } from '@/remote/native-transport';
import { usePreferences } from '@/state/preferences';
import { useRemote } from '@/state/remote';
import { type Appearance, useTheme } from '@/theme';
import { phoneDeviceId } from 'sovra-remote';

const short = (hex: string) => `${hex.slice(0, 8)}…${hex.slice(-8)}`;

function Row({ title, detail, children }: { title: string; detail?: string; children?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.medium, minHeight: theme.layout.control }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{title}</Text>
        {detail ? (
          <Text variant="caption" tone="muted">
            {detail}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export default function Settings() {
  const theme = useTheme();
  const desktop = useRemote((state) => state.desktop);
  const preferences = usePreferences();
  const [phoneId, setPhoneId] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    phoneSecret()
      .then((secret) => setPhoneId(phoneDeviceId(secret)))
      .catch(() => setPhoneId(null));
  }, []);

  const toggle = (patch: Parameters<typeof preferences.set>[0]) => {
    preferences.set(patch);
    // Endpoint options apply on the next connection.
    useRemote.getState().stopLive();
  };

  const forget = () =>
    Alert.alert(
      'Forget this computer?',
      'This phone stops connecting to it. To revoke access completely, also choose Forget for this phone in Sovra on your computer.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            await useRemote.getState().forget();
            router.dismissAll();
            router.replace('/pair');
          },
        },
      ],
    );

  return (
    <>
      <Stack.Screen options={{ headerRight: () => <Button label="Done" size="compact" variant="ghost" onPress={() => router.back()} /> }} />
      <ScrollView style={{ backgroundColor: theme.colors.canvas }} contentContainerStyle={{ padding: theme.space.medium, gap: theme.space.large }}>
        <Surface>
          <Text variant="sectionTitle">Your computer</Text>
          {desktop ? (
            <>
              <Row title={desktop.name} detail={`Paired ${new Date(desktop.pairedAt).toLocaleDateString()}`} />
              <Button label="Forget this computer" variant="danger" onPress={forget} />
            </>
          ) : (
            <Text tone="secondary">None yet.</Text>
          )}
        </Surface>

        <Surface>
          <Text variant="sectionTitle">Appearance</Text>
          <View style={{ flexDirection: 'row', padding: 3, borderRadius: theme.radius.button, backgroundColor: theme.colors.hover }}>
            {(['system', 'dark', 'light'] as Appearance[]).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: preferences.appearance === value }}
                onPress={() => preferences.set({ appearance: value })}
                style={{
                  flex: 1,
                  minHeight: theme.layout.compactControl,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.radius.button - 2,
                  backgroundColor: preferences.appearance === value ? theme.colors.surface : 'transparent',
                }}>
                <Text variant="label" tone={preferences.appearance === value ? 'primary' : 'secondary'}>
                  {value === 'system' ? 'System' : value === 'dark' ? 'Dark' : 'Light'}
                </Text>
              </Pressable>
            ))}
          </View>
        </Surface>

        <Button
          label={advanced ? 'Hide advanced settings' : 'Advanced settings'}
          variant="ghost"
          onPress={() => setAdvanced(!advanced)}
          accessibilityState={{ expanded: advanced }}
        />
        {advanced ? (
          <>
            <Surface>
              <Text variant="sectionTitle">Connection</Text>
              <Row title="Show screenshots" detail="Uses more data. Not every computer can capture its window.">
                <Switch
                  value={preferences.screenshots}
                  onValueChange={(screenshots) => toggle({ screenshots })}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.controlBorder }}
                  accessibilityLabel="Show screenshots"
                />
              </Row>
              <Row title="Same Wi-Fi only" detail="For testing: no relays, so mobile data will not work.">
                <Switch
                  value={preferences.localOnly}
                  onValueChange={(localOnly) => toggle({ localOnly, ...(localOnly ? { relayOnly: false } : {}) })}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.controlBorder }}
                  accessibilityLabel="Same Wi-Fi only"
                />
              </Row>
              <Row title="Developer mode" detail="Shows each connection try, the relay this phone uses and a DNS check, with a button to copy them.">
                <Switch
                  value={preferences.developer}
                  onValueChange={(developer) => {
                    preferences.set({ developer });
                    if (developer) enableDeveloperLog();
                  }}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.controlBorder }}
                  accessibilityLabel="Developer mode"
                />
              </Row>
              <Row title="Encrypted relay only" detail="For testing: skips direct connections, the way a phone on a strict network reaches your computer.">
                <Switch
                  value={preferences.relayOnly}
                  onValueChange={(relayOnly) => toggle({ relayOnly, ...(relayOnly ? { localOnly: false } : {}) })}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.controlBorder }}
                  accessibilityLabel="Encrypted relay only"
                />
              </Row>
            </Surface>

            <Surface>
              <Text variant="sectionTitle">This phone</Text>
              <Row title="Phone key" detail={phoneId ? short(phoneId) : 'Created on first connection'} />
              {desktop ? <Row title="Computer key" detail={short(desktop.address.device)} /> : null}
              <Text variant="caption" tone="muted">
                The private key never leaves this phone. Your computer recognises the phone by this key, not by its name.
              </Text>
            </Surface>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}
