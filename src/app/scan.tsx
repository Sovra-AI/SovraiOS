import { type BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DeveloperPanel, usePairingStatus } from '@/components/connection-card';
import { Button, NoticeBanner, Surface, Text } from '@/components/ui';
import { developerLog } from '@/remote/native-transport';
import { usePairingDraft } from '@/state/pairing';
import { usePreferences } from '@/state/preferences';
import { useRemote } from '@/state/remote';
import { useTheme } from '@/theme';

/** Scanning shows the camera; once a code is read the camera closes and pairing takes over. */
type Stage = { kind: 'scanning'; hint: string | null } | { kind: 'pairing' } | { kind: 'failed'; message: string };

export default function Scan() {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>({ kind: 'scanning', hint: null });
  const handling = useRef(false);
  const pairing = usePairingStatus(stage.kind === 'pairing');
  const developer = usePreferences((state) => state.developer);
  const [details, setDetails] = useState(false);

  const onScan = async ({ data }: BarcodeScanningResult) => {
    if (handling.current) return;
    if (!data.startsWith('sovra://remote-control')) {
      setStage({ kind: 'scanning', hint: 'That is not a Sovra pairing code.' });
      return;
    }
    handling.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setStage({ kind: 'pairing' });
    const { phoneName, desktopName } = usePairingDraft.getState();
    const result = await useRemote.getState().pair(data, phoneName, desktopName);
    if (result.ok) {
      router.dismissAll();
      router.replace('/remote');
      return;
    }
    setStage({ kind: 'failed', message: result.message });
  };

  const scanAgain = () => {
    handling.current = false;
    setStage({ kind: 'scanning', hint: 'Show a fresh code on your computer if the last one has expired.' });
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: theme.colors.canvas }} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas, padding: theme.space.large, justifyContent: 'center' }}>
        <Surface variant="elevated" style={{ gap: theme.space.medium }}>
          <Text variant="sectionTitle">Camera access</Text>
          <Text tone="secondary">Sovra uses the camera only to read the pairing code on your computer screen.</Text>
          {permission.canAskAgain ? (
            <Button label="Allow camera" variant="primary" onPress={requestPermission} />
          ) : (
            <Button label="Open Settings" variant="primary" onPress={() => Linking.openSettings()} />
          )}
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </Surface>
      </SafeAreaView>
    );
  }

  if (stage.kind !== 'scanning') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
        <ScrollView contentContainerStyle={{ padding: theme.space.large, gap: theme.space.medium }}>
          <Surface variant="elevated" style={{ gap: theme.space.small + 4 }}>
            <Text variant="sectionTitle" accessibilityRole="header">
              {stage.kind === 'pairing' ? 'Code read. Pairing…' : 'Pairing did not finish'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.small }}>
              {stage.kind === 'pairing' ? <ActivityIndicator color={theme.colors.ring} /> : null}
              <Text tone="secondary" accessibilityLiveRegion="polite" style={{ flex: 1 }}>
                {stage.kind === 'pairing' ? pairing : stage.message}
              </Text>
            </View>
            {stage.kind === 'failed' ? <Button label="Scan again" variant="primary" onPress={scanAgain} /> : null}
            {stage.kind === 'failed' && !developer ? (
              <Button label={details ? 'Hide technical details' : 'Show technical details'} variant="ghost" onPress={() => setDetails(!details)} />
            ) : null}
            <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
          </Surface>
          {developer || details ? <DeveloperPanel attempts={[]} diagnostics={null} route={null} phase={stage.kind} readLog={developerLog} /> : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScan}
        accessibilityLabel="Camera viewfinder. Point it at the code on your computer."
      />
      <SafeAreaView style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: theme.space.large, gap: theme.space.small + 4 }}>
        <View style={{ alignSelf: 'center', width: theme.layout.scanCode, height: theme.layout.scanCode, borderRadius: theme.radius.panel, borderWidth: 3, borderColor: theme.colors.ring, marginBottom: theme.space.extra }} />
        <NoticeBanner tone={stage.hint ? 'warning' : 'info'} text={stage.hint ?? 'Point your camera at the code on your computer.'} />
        <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
      </SafeAreaView>
    </View>
  );
}
