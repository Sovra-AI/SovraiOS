/**
 * Deep link target for `sovra://remote-control?ticket=…`: scanning the desktop QR
 * with the system camera opens the app here. The ticket is used once, in memory.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { usePairingStatus } from '@/components/connection-card';
import { Button, NoticeBanner, Text } from '@/components/ui';
import { usePairingDraft } from '@/state/pairing';
import { useRemote } from '@/state/remote';
import { useTheme } from '@/theme';

export default function RemoteControlLink() {
  const theme = useTheme();
  const { ticket } = useLocalSearchParams<{ ticket?: string }>();
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(false);
  const error = typeof ticket === 'string' ? failure : 'This link is incomplete. Scan the code on your computer again.';
  const pairing = usePairingStatus(!error);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (typeof ticket !== 'string') return;
    const link = `sovra://remote-control?ticket=${encodeURIComponent(ticket)}`;
    const { phoneName, desktopName } = usePairingDraft.getState();
    void useRemote
      .getState()
      .pair(link, phoneName, desktopName)
      .then((result) => {
        if (result.ok) router.replace('/remote');
        else setFailure(result.message);
      });
  }, [ticket]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas, padding: theme.space.large, justifyContent: 'center', gap: theme.space.medium }}>
      {error ? (
        <>
          <NoticeBanner tone="danger" text={error} />
          <Button label="Back to pairing" variant="primary" onPress={() => router.replace('/pair')} />
        </>
      ) : (
        <>
          <ActivityIndicator color={theme.colors.ring} />
          <Text tone="secondary" accessibilityLiveRegion="polite" style={{ textAlign: 'center' }}>
            {pairing}
          </Text>
        </>
      )}
    </View>
  );
}
