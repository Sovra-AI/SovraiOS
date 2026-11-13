/**
 * The Chat tab: Sovra's conversation as bubbles, and a chat box that sends through the
 * real one on the computer. Typing `/` offers Sovra's skills; choosing one shows it as a
 * chip, so the message is just the words that follow.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, type ScrollViewInstance, TextInput, type TextInputInstance, View } from 'react-native';

import { transcript } from '@/remote/desktop';
import { conversationArea, findComposer, findStop } from '@/remote/elements';
import { type Skill, explainNotice, hintPrompt, matchSkills, needsText, skillNotice, slashQuery } from '@/remote/skills';
import type { InspectResult, UiElement } from '@/remote/wire';
import { useRemote } from '@/state/remote';
import { useTheme } from '@/theme';

import { Markdown } from './markdown';
import { ConversationView } from './remote-views';
import { Button, Surface, Text, inputStyle } from './ui';

interface Props {
  snapshot: InspectResult;
  screenshot: string | null;
  live: boolean;
  /** A skill chosen in the Skills tab, to start the next message with. */
  chosen: Skill | null;
  onChosenUsed(): void;
  onBrowseSkills(): void;
  /** A `/` command is about to be sent: it may open another page on the computer. */
  onSkillSent(): void;
  /** A skill opened another page on the computer (Models, Schedules…): show it. */
  onOpenedPage(): void;
  onScroll(element: UiElement, lines: number): void;
}

interface Pending {
  text: string;
  /** `updatedAt` when sending finished; the bubble goes once a newer view arrives. */
  doneAt: number | null;
}

const NEAR_BOTTOM = 80;
const MAX_SUGGESTIONS = 6;

export const ChatPanel = memo(function ChatPanel({ snapshot, screenshot, live, chosen, onChosenUsed, onBrowseSkills, onSkillSent, onOpenedPage, onScroll }: Props) {
  const theme = useTheme();
  const working = useRemote((state) => state.working);
  const skills = useRemote((state) => state.skills);
  const updatedAt = useRemote((state) => state.updatedAt);
  const [draft, setDraft] = useState('');
  const [skill, setSkill] = useState<Skill | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [focused, setFocused] = useState(false);
  // Sovra keeps its last `/` notice until something is typed there; only show it after our own `/` send.
  const [asked, setAsked] = useState(false);
  const input = useRef<TextInputInstance>(null);
  const scroller = useRef<ScrollViewInstance>(null);
  const atBottom = useRef(true);

  const { messages, earlier, working: status } = useMemo(() => transcript(snapshot), [snapshot]);
  const area = useMemo(() => conversationArea(snapshot), [snapshot]);
  const composer = useMemo(() => findComposer(snapshot), [snapshot]);
  const stop = useMemo(() => findStop(snapshot), [snapshot]);
  const notice = useMemo(() => skillNotice(snapshot), [snapshot]);

  // A skill picked on the Skills tab starts the next message.
  useEffect(() => {
    if (!chosen) return;
    setSkill(chosen);
    setDraft('');
    onChosenUsed();
    setTimeout(() => input.current?.focus(), 50);
  }, [chosen, onChosenUsed]);

  // The sent bubble stays until the computer shows the real message (or the next view).
  useEffect(() => {
    if (pending?.doneAt != null && updatedAt != null && updatedAt > pending.doneAt) setPending(null);
  }, [pending, updatedAt]);

  const query = skill ? null : slashQuery(draft);
  const [skillsFailed, setSkillsFailed] = useState(false);
  const wantSkills = query !== null && live && !skills;
  useEffect(() => {
    if (!wantSkills) return;
    let current = true;
    void useRemote
      .getState()
      .fetchSkills()
      .then((ok) => {
        if (current) setSkillsFailed(!ok);
      });
    return () => {
      current = false;
    };
  }, [wantSkills]);
  const retrySkills = () => {
    setSkillsFailed(false);
    void useRemote
      .getState()
      .fetchSkills(true)
      .then((ok) => setSkillsFailed(!ok));
  };
  const suggestions = useMemo(() => (query !== null && skills ? matchSkills(skills, query).slice(0, MAX_SUGGESTIONS) : []), [query, skills]);

  const choose = (next: Skill) => {
    setSkill(next);
    setDraft('');
    input.current?.focus();
  };

  const message = skill ? `/${skill.name}${draft.trim() ? ` ${draft.trim()}` : ''}` : draft;
  // "/web-search" typed out in full counts as choosing it; "/" or an unknown name does not send.
  const typedSkill = query !== null ? (skills?.find((entry) => entry.name === query.toLowerCase()) ?? null) : null;
  const ready = skill
    ? !needsText(skill) || draft.trim().length > 0
    : query !== null
      ? typedSkill !== null || (skills === null && query.length > 0)
      : draft.trim().length > 0;
  const canSend = live && !working && !pending && ready;

  const send = async () => {
    if (!canSend) return;
    if (typedSkill && needsText(typedSkill)) {
      // Ask for the missing words here instead of letting the computer refuse it.
      choose(typedSkill);
      return;
    }
    const sentDraft = draft;
    const sentSkill = skill;
    setPending({ text: message.trim(), doneAt: null });
    setAsked(message.trim().startsWith('/'));
    if (message.trim().startsWith('/')) onSkillSent();
    setDraft('');
    setSkill(null);
    atBottom.current = true;
    const ok = await useRemote.getState().send(message);
    if (ok) {
      setPending({ text: message.trim(), doneAt: Date.now() });
      if (message.trim().startsWith('/')) {
        await useRemote.getState().refresh();
        const after = useRemote.getState().snapshot;
        if (after && !findComposer(after)) {
          setPending(null);
          onOpenedPage();
        }
      }
    } else {
      // Nothing was lost: put the words back so they can be sent again.
      setPending(null);
      setDraft(sentDraft);
      setSkill(sentSkill);
    }
  };

  const welcome = messages.length === 0 && !area;
  const fallback = messages.length === 0 && area !== null;

  return (
    <View style={{ flex: 1, gap: theme.space.small }}>
      {!composer ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space.small }}>
          <ActivityIndicator color={theme.colors.ring} />
          <Text tone="secondary">Opening the chat on your computer…</Text>
        </View>
      ) : fallback ? (
        <ConversationView snapshot={snapshot} screenshot={screenshot} onScroll={onScroll} disabled={!live || working} />
      ) : (
        <ScrollView
          ref={scroller}
          keyboardShouldPersistTaps="handled"
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            atBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - NEAR_BOTTOM;
          }}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            if (atBottom.current) scroller.current?.scrollToEnd({ animated: false });
          }}
          contentContainerStyle={{ flexGrow: 1, gap: theme.space.medium, paddingVertical: theme.space.small }}>
          {welcome && !pending ? (
            <View style={{ flex: 1, justifyContent: 'center', gap: theme.space.small, paddingHorizontal: theme.space.small }}>
              <Text variant="pageTitle">What’s on your mind?</Text>
              <Text tone="secondary">Ask Sovra anything. It works on your computer and the answer appears here.</Text>
              <Button label="Browse skills" variant="secondary" onPress={onBrowseSkills} style={{ alignSelf: 'flex-start', marginTop: theme.space.small }} />
            </View>
          ) : null}
          {area && earlier ? (
            <Button
              label="Show earlier messages"
              variant="ghost"
              size="compact"
              onPress={() => onScroll(area, 8)}
              disabled={!live || working}
              accessibilityHint="Scrolls the conversation on your computer up"
            />
          ) : null}
          {messages.map((entry) => {
            const mine = entry.from === 'you';
            return (
              <View
                key={entry.id}
                accessible
                accessibilityLabel={`${mine ? 'You' : 'Sovra'}: ${entry.text}`}
                style={
                  mine
                    ? {
                        alignSelf: 'flex-end',
                        maxWidth: '85%',
                        paddingHorizontal: theme.space.medium,
                        paddingVertical: theme.space.small + 2,
                        borderRadius: theme.radius.panel,
                        borderBottomRightRadius: theme.radius.small,
                        backgroundColor: theme.colors.userBubble,
                      }
                    : { alignSelf: 'stretch' }
                }>
                {mine ? <Text selectable>{entry.text}</Text> : <Markdown text={entry.text} />}
              </View>
            );
          })}
          {pending ? (
            <View
              accessibilityLabel={`Sending: ${pending.text}`}
              style={{
                alignSelf: 'flex-end',
                maxWidth: '85%',
                paddingHorizontal: theme.space.medium,
                paddingVertical: theme.space.small + 2,
                borderRadius: theme.radius.panel,
                borderBottomRightRadius: theme.radius.small,
                backgroundColor: theme.colors.userBubble,
                opacity: 0.6,
              }}>
              <Text>{pending.text}</Text>
            </View>
          ) : null}
          {status || stop || (pending && pending.doneAt === null) ? (
            <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.small }}>
              <ActivityIndicator size="small" color={theme.colors.ring} />
              <Text variant="caption" tone="secondary">
                {pending && pending.doneAt === null ? 'Sending to your computer…' : (status ?? 'Sovra is working…')}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}

      {notice && asked ? (
        <Text variant="caption" tone="warning" accessibilityRole="alert" style={{ paddingHorizontal: theme.space.small }}>
          {explainNotice(notice)}
        </Text>
      ) : null}

      {query !== null ? (
        <Surface variant="elevated" style={{ padding: theme.space.compact, gap: 0, maxHeight: 300 }}>
          {!skills && skillsFailed ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.small, paddingLeft: theme.space.small }}>
              <Text tone="secondary" style={{ flex: 1 }}>
                Couldn’t get the skills from your computer.
              </Text>
              <Button label="Try again" size="compact" variant="ghost" onPress={retrySkills} />
            </View>
          ) : !skills ? (
            <View style={{ flexDirection: 'row', gap: theme.space.small, padding: theme.space.small }}>
              <ActivityIndicator size="small" color={theme.colors.ring} />
              <Text tone="secondary">Getting skills from your computer…</Text>
            </View>
          ) : suggestions.length === 0 ? (
            <Text tone="secondary" style={{ padding: theme.space.small }}>
              No skill matches “/{query}”.
            </Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="always">
              {suggestions.map((entry) => (
                <Pressable
                  key={entry.name}
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.title}. ${entry.description}`}
                  onPress={() => choose(entry)}
                  style={({ pressed }) => ({
                    minHeight: theme.layout.control,
                    justifyContent: 'center',
                    paddingHorizontal: theme.space.small + 4,
                    paddingVertical: theme.space.small,
                    borderRadius: theme.radius.button,
                    backgroundColor: pressed ? theme.colors.hover : 'transparent',
                  })}>
                  <Text variant="label">{entry.title}</Text>
                  {entry.description ? (
                    <Text variant="caption" tone="secondary" numberOfLines={1}>
                      {entry.description}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Surface>
      ) : null}

      <View
        style={{
          gap: theme.space.small,
          padding: theme.space.small,
          borderRadius: theme.radius.panel,
          borderWidth: focused ? 1.5 : theme.layout.hairline,
          borderColor: focused ? theme.colors.composerFocusBorder : theme.colors.composerBorder,
          backgroundColor: theme.colors.composerBackground,
        }}>
        {skill ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.small }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Skill: ${skill.title}. Tap to remove`}
              onPress={() => setSkill(null)}
              hitSlop={8}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.snug,
                paddingHorizontal: theme.space.small + 2,
                paddingVertical: theme.space.compact,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.selection,
              }}>
              <Text variant="label" tone="link">
                {skill.title}
              </Text>
              <Text variant="label" tone="secondary">
                ✕
              </Text>
            </Pressable>
            <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
              {skill.description}
            </Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.space.small }}>
          <TextInput
            ref={input}
            value={draft}
            onChangeText={setDraft}
            placeholder={
              skill ? hintPrompt(skill) : 'Message Sovra  ·  type / for skills'
            }
            placeholderTextColor={theme.colors.mutedText}
            multiline
            editable={live}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            accessibilityLabel="Message to Sovra"
            style={{ ...inputStyle(theme), borderWidth: 0, flex: 1, maxHeight: 140, paddingTop: 11, backgroundColor: 'transparent' }}
          />
          {stop ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop"
              accessibilityHint="Stops what Sovra is doing"
              onPress={() => void useRemote.getState().stop()}
              style={{
                height: theme.layout.control,
                paddingHorizontal: theme.space.medium,
                borderRadius: theme.radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.stopBackground,
              }}>
              <Text variant="label" style={{ color: theme.colors.primaryForeground }}>
                Stop
              </Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={send}
              style={{
                height: theme.layout.control,
                paddingHorizontal: theme.space.medium,
                borderRadius: theme.radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: canSend ? theme.colors.sendReadyBackground : theme.colors.hover,
              }}>
              <Text variant="label" style={{ color: canSend ? theme.colors.sendReadyForeground : theme.colors.mutedText }}>
                Send
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
});
