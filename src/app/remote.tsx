import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatPanel } from '@/components/chat-panel';
import { ComputerPanel } from '@/components/computer-panel';
import { ChatsView, SkillsView } from '@/components/desktop-views';
import { Button, NoticeBanner, Surface, Text } from '@/components/ui';
import { NEW_CHAT_LABEL, transcript } from '@/remote/desktop';
import { findComposer } from '@/remote/elements';
import { moreChats, openChatPage, openConversation, searchChats } from '@/remote/navigate';
import type { Skill } from '@/remote/skills';
import type { UiElement } from '@/remote/wire';
import { type Phase, useRemote } from '@/state/remote';
import { useTheme } from '@/theme';

const STATUS: Record<Phase, { color: 'success' | 'warning' | 'danger' | 'mutedText' | 'link'; label: string }> = {
  loading: { color: 'mutedText', label: 'Starting' },
  unpaired: { color: 'mutedText', label: 'Not paired' },
  connecting: { color: 'link', label: 'Connecting…' },
  connected: { color: 'success', label: 'Connected' },
  unreachable: { color: 'warning', label: 'Can’t reach your computer' },
  disabled: { color: 'warning', label: 'Phone control is off' },
  busy: { color: 'warning', label: 'Busy' },
  revoked: { color: 'danger', label: 'Forgotten' },
  incompatible: { color: 'danger', label: 'Update needed' },
};

/** Plain-language recovery for each state; desktop messages are shown, never parsed. */
const RECOVERY: Partial<Record<Phase, { title: string; body: string }>> = {
  connecting: { title: 'Connecting to your computer…', body: 'This can take a few seconds on mobile data.' },
  unreachable: {
    title: 'Open Sovra on your computer',
    body: 'Make sure your computer is awake and online, Sovra is open, and “Use Sovra from your phone” is switched on in Sovra (it switches off whenever Sovra restarts). We keep trying while this screen is open.',
  },
  disabled: {
    title: 'Turn on phone control',
    body: 'In Sovra on your computer, open Skills and choose “Use Sovra from your phone”. For your safety it switches off whenever Sovra restarts.',
  },
  busy: { title: 'Sovra is busy', body: 'Another phone may be in control, or a new phone is being paired. Try again in a moment.' },
  incompatible: { title: 'Update needed', body: 'This app and Sovra on your computer are different versions. Update both.' },
};

type Tab = 'chat' | 'chats' | 'skills' | 'computer';

const TABS: { tab: Tab; label: string }[] = [
  { tab: 'chat', label: 'Chat' },
  { tab: 'chats', label: 'Chats' },
  { tab: 'skills', label: 'Skills' },
  { tab: 'computer', label: 'Computer' },
];

const QUIET_NOTICE_MS = 5000;
const SKILL_PAGE_GRACE_MS = 15000;

export default function Remote() {
  const theme = useTheme();
  const { phase, desktop, snapshot, screenshot, detail, notice, working, skills } = useRemote();
  const [tab, setTab] = useState<Tab>('chat');
  const [chosen, setChosen] = useState<Skill | null>(null);

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

  // Good news and tips fade on their own; problems stay until dismissed.
  useEffect(() => {
    if (!notice || notice.tone === 'danger' || notice.tone === 'warning') return;
    const timer = setTimeout(() => useRemote.getState().dismissNotice(), QUIET_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const live = phase === 'connected' && snapshot !== null;
  const hasComposer = useMemo(() => (snapshot ? findComposer(snapshot) !== null : false), [snapshot]);
  const labelled = useMemo(() => (snapshot ? transcript(snapshot).messages.length > 0 : false), [snapshot]);

  // Pictures only for the Computer tab, or the Chat tab when messages are not labelled.
  useEffect(() => {
    useRemote.getState().setPictureWanted(tab === 'computer' || (tab === 'chat' && !labelled));
    return () => useRemote.getState().setPictureWanted(false);
  }, [tab, labelled]);

  // The Chat tab always shows Sovra's chat: bring it up on the computer when another page
  // is open. Once per visit, so a failure is reported instead of retried in a loop.
  const tried = useRef(false);
  // A `/` command that opens a page (Models, Schedules…) leaves the chat on purpose.
  const skillSentAt = useRef(0);
  useEffect(() => {
    if (tab !== 'chat' || hasComposer) {
      tried.current = false;
      return;
    }
    if (!live || working || tried.current || Date.now() - skillSentAt.current < SKILL_PAGE_GRACE_MS) return;
    tried.current = true;
    void useRemote.getState().perform(openChatPage);
  }, [tab, live, hasComposer, working]);

  // The Skills tab lists Sovra's skills, read once from the computer.
  useEffect(() => {
    if (tab === 'skills' && live && !skills) void useRemote.getState().fetchSkills();
    // Only when the tab is chosen or the connection comes up, not on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, live]);

  const status = STATUS[phase];
  const recovery = RECOVERY[phase];
  const busy = !live || working;

  const scroll = useCallback((element: UiElement, lines: number) => void useRemote.getState().act({ kind: 'scroll', element, lines }), []);
  const openChat = useCallback((title: string) => {
    setTab('chat');
    void useRemote.getState().perform((client) => openConversation(client, title));
  }, []);
  const newChat = useCallback(() => {
    setTab('chat');
    void useRemote.getState().perform(async (client) => {
      const page = await openChatPage(client);
      if (!page.ok) return page;
      const button = page.value.elements.find((element) => element.visible && element.label === NEW_CHAT_LABEL);
      if (!button) return { ok: false, code: 'invalid_request', message: 'Could not start a new chat on your computer.' } as const;
      return client.act({ kind: 'click', element: button });
    });
  }, []);
  const search = useCallback((query: string) => void useRemote.getState().perform((client) => searchChats(client, query)), []);
  const more = useCallback(() => void useRemote.getState().perform(moreChats), []);
  const pickSkill = useCallback((skill: Skill) => {
    setChosen(skill);
    setTab('chat');
  }, []);
  const chosenUsed = useCallback(() => setChosen(null), []);
  const openPage = useCallback((page: UiElement) => {
    // Sovra's chat lives in the Chat tab.
    if (page.label?.trim().toLowerCase() === 'chat') setTab('chat');
    void useRemote.getState().act({ kind: 'click', element: page });
  }, []);
  const isChatBox = useCallback((element: UiElement) => (snapshot ? findComposer(snapshot)?.target === element.target : false), [snapshot]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, paddingHorizontal: theme.space.medium, paddingTop: theme.space.small, paddingBottom: theme.space.small, gap: theme.space.small + 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.small }}>
            <View style={{ flex: 1 }}>
              <Text variant="sectionTitle" numberOfLines={1}>
                {desktop?.name ?? 'Your computer'}
              </Text>
              <View accessible accessibilityLabel={`Status: ${status.label}`} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.snug }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors[status.color] }} />
                <Text variant="caption" tone="secondary">
                  {status.label}
                </Text>
                {working ? <ActivityIndicator size="small" color={theme.colors.ring} style={{ transform: [{ scale: 0.7 }] }} /> : null}
              </View>
            </View>
            {tab === 'chat' && live ? <Button label="New chat" size="compact" variant="ghost" onPress={newChat} disabled={busy} /> : null}
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
              {phase !== 'connecting' ? <Button label="Try again" variant="primary" onPress={() => useRemote.getState().startLive()} /> : null}
            </Surface>
          ) : null}

          {snapshot ? (
            <>
              <View
                accessibilityRole="tablist"
                style={{ flexDirection: 'row', padding: 3, borderRadius: theme.radius.button + 2, backgroundColor: theme.colors.hover }}>
                {TABS.map(({ tab: value, label }) => (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: tab === value }}
                    onPress={() => setTab(value)}
                    style={{
                      flex: 1,
                      minHeight: theme.layout.control - 4,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: theme.radius.button,
                      backgroundColor: tab === value ? theme.colors.surface : 'transparent',
                    }}>
                    <Text variant="label" tone={tab === value ? 'primary' : 'secondary'}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={{ flex: 1, opacity: live ? 1 : 0.5 }} pointerEvents={live ? 'auto' : 'none'}>
                {tab === 'chat' ? (
                  <ChatPanel
                    snapshot={snapshot}
                    screenshot={screenshot}
                    live={live}
                    chosen={chosen}
                    onChosenUsed={chosenUsed}
                    onBrowseSkills={() => setTab('skills')}
                    onSkillSent={() => {
                      skillSentAt.current = Date.now();
                    }}
                    onOpenedPage={() => {
                      skillSentAt.current = 0;
                      setTab('computer');
                    }}
                    onScroll={scroll}
                  />
                ) : null}
                {tab === 'chats' ? <ChatsView snapshot={snapshot} onOpen={openChat} onNew={newChat} onSearch={search} onMore={more} disabled={busy} /> : null}
                {tab === 'skills' ? <SkillsView skills={skills} onUse={pickSkill} onReload={() => void useRemote.getState().fetchSkills(true)} disabled={busy} /> : null}
                {tab === 'computer' ? (
                  <ComputerPanel
                    snapshot={snapshot}
                    screenshot={screenshot}
                    disabled={busy}
                    onOpenPage={openPage}
                    onChatBox={() => setTab('chat')}
                    isChatBox={isChatBox}
                    onScroll={scroll}
                  />
                ) : null}
              </View>
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
