import { type BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePairingStatus } from '@/components/connection-card';
import { Button, NoticeBanner, Surface, Text } from '@/components/ui';
import { usePairingDraft } from '@/state/pairing';
import { useRemote } from '@/state/remote';
import { useTheme } from '@/theme';

export default function Scan() {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const handling = useRef(false);
  const [pairingNow, setPairingNow] = useState(false);
  const pairing = usePairingStatus(pairingNow);

  const onScan = async ({ data }: BarcodeScanningResult) => {
    if (handling.current) return;
    if (!data.startsWith('sovra://remote-control')) {
      setStatus({ tone: 'danger', text: 'That is not a Sovra pairing code.' });
      return;
    }
    handling.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setStatus(null);
    setPairingNow(true);
    const { phoneName, desktopName } = usePairingDraft.getState();
    const result = await useRemote.getState().pair(data, phoneName, desktopName);
    setPairingNow(false);
    if (result.ok) {
      router.dismissAll();
      router.replace('/remote');
      return;
    }
    setStatus({ tone: 'danger', text: result.message });
    // Allow another scan (a new code, or the same one after a lost reply).
    setTimeout(() => {
      handling.current = false;
    }, 1500);
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
        {pairing ? (
          <NoticeBanner tone="info" text={pairing} />
        ) : status ? (
          <NoticeBanner tone={status.tone} text={status.text} />
        ) : (
          <NoticeBanner tone="info" text="Point your camera at the code on your computer." />
        )}
        <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
      </SafeAreaView>
    </View>
  );
}
