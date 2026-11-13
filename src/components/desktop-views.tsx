/**
 * Native views of Sovra's own lists on the computer, read from Inspect: the chats in
 * its sidebar, its `/` skills, and its pages. Every tap becomes a real click there.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';

import { chatList, pages } from '@/remote/desktop';
import { type Skill, matchSkills } from '@/remote/skills';
import type { InspectResult, UiElement } from '@/remote/wire';
import { useTheme } from '@/theme';

import { Button, Text, inputStyle } from './ui';

interface Common {
  snapshot: InspectResult;
  disabled: boolean;
}

function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange(text: string): void; placeholder: string; label: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.mutedText}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel={label}
        style={{ ...inputStyle(theme), flex: 1, paddingRight: 44 }}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChange('')}
          hitSlop={8}
          style={{ position: 'absolute', right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text tone="secondary">✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Row({ title, subtitle, onPress, disabled, hint }: { title: string; subtitle?: string; onPress(): void; disabled: boolean; hint: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.layout.control + 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.small,
        paddingHorizontal: theme.space.medium,
        paddingVertical: theme.space.small + 2,
        borderRadius: theme.radius.card,
        backgroundColor: pressed ? theme.colors.hover : theme.colors.surface,
        borderWidth: theme.layout.hairline,
        borderColor: theme.colors.border,
        opacity: disabled ? 0.6 : 1,
      })}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Text tone="muted">›</Text>
    </Pressable>
  );
}

/**
 * Keeps every chat title seen while browsing, in the sidebar's order. Sovra only renders
 * the rows near its visible list, so older chats appear as "Show older chats" scrolls it.
 */
function merge(known: string[], current: string[]): string[] {
  const next = [...known];
  let at = -1;
  for (const title of current) {
    const index = next.indexOf(title);
    if (index >= 0) {
      at = index;
      continue;
    }
    next.splice(at + 1, 0, title);
    at += 1;
  }
  return next;
}

/** The chats in Sovra's sidebar on the computer. */
export const ChatsView = memo(function ChatsView({
  snapshot,
  disabled,
  onOpen,
  onNew,
  onSearch,
  onMore,
}: Common & { onOpen(title: string): void; onNew(): void; onSearch(query: string): void; onMore(): void }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const current = useMemo(() => chatList(snapshot).map((chat) => chat.title), [snapshot]);
  const [titles, setTitles] = useState<string[]>(current);
  const searchRef = useRef(onSearch);
  const applied = useRef('');
  const searching = query.trim().length > 0;

  useEffect(() => {
    searchRef.current = onSearch;
  }, [onSearch]);

  // While searching, the computer's filtered list is shown as is.
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    if (!searching) setTitles(merge(titles, current));
  }

  // Search on the computer shortly after typing stops; clear it when leaving the tab.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (applied.current === query.trim()) return;
      applied.current = query.trim();
      searchRef.current(query.trim());
    }, 700);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(
    () => () => {
      if (applied.current) searchRef.current('');
    },
    [],
  );

  return (
    <View style={{ flex: 1, gap: theme.space.small }}>
      <View style={{ flexDirection: 'row', gap: theme.space.small }}>
        <View style={{ flex: 1 }}>
          <SearchBox value={query} onChange={setQuery} placeholder="Search your chats" label="Search your chats" />
        </View>
        <Button label="New chat" variant="primary" onPress={onNew} disabled={disabled} accessibilityHint="Starts a fresh conversation" />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: theme.space.small, paddingBottom: theme.space.large }}>
        {(searching ? current : titles).length === 0 ? (
          <Text tone="secondary" style={{ padding: theme.space.small }}>
            {query.trim() ? `No chats match “${query.trim()}”.` : 'No chats yet. Tap New chat to start one.'}
          </Text>
        ) : (
          (searching ? current : titles).map((title) => <Row key={title} title={title} onPress={() => onOpen(title)} disabled={disabled} hint="Opens this chat" />)
        )}
        {!searching && titles.length > 0 ? (
          <Button label="Show older chats" variant="ghost" onPress={onMore} disabled={disabled} accessibilityHint="Loads more chats from your computer" />
        ) : null}
      </ScrollView>
    </View>
  );
});

/** Sovra's `/` skills. Choosing one starts a chat message with it. */
export const SkillsView = memo(function SkillsView({
  skills,
  disabled,
  onUse,
  onReload,
}: {
  skills: Skill[] | null;
  disabled: boolean;
  onUse(skill: Skill): void;
  onReload(): void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => (skills ? matchSkills(skills, query) : []), [skills, query]);
  if (!skills) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space.small }}>
        <ActivityIndicator color={theme.colors.ring} />
        <Text tone="secondary">Getting skills from your computer…</Text>
        <Button label="Try again" variant="ghost" onPress={onReload} disabled={disabled} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, gap: theme.space.small }}>
      <SearchBox value={query} onChange={setQuery} placeholder="What do you want to do?" label="Search skills" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: theme.space.small, paddingBottom: theme.space.large }}>
        <Text variant="caption" tone="secondary" style={{ paddingHorizontal: theme.space.compact }}>
          Pick a skill, then say what you need. You can also type / in the chat.
        </Text>
        {shown.length === 0 ? (
          <Text tone="secondary" style={{ padding: theme.space.small }}>
            No skills match “{query.trim()}”.
          </Text>
        ) : (
          shown.map((skill) => (
            <Row key={skill.name} title={skill.title} subtitle={skill.description} onPress={() => onUse(skill)} disabled={disabled} hint="Starts a message with this skill" />
          ))
        )}
      </ScrollView>
    </View>
  );
});

/** Shortcuts to every page in Sovra's sidebar (Team, Artifacts, Schedules, Settings…). */
export const PagesBar = memo(function PagesBar({ snapshot, disabled, onOpen }: Common & { onOpen(page: UiElement): void }) {
  const theme = useTheme();
  const list = useMemo(() => pages(snapshot), [snapshot]);
  if (list.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.compact }} style={{ flexGrow: 0 }}>
      {list.map((page) => (
        <Button
          key={page.target}
          label={page.label ?? ''}
          size="compact"
          variant={page.selected ? 'primary' : 'secondary'}
          onPress={() => onOpen(page)}
          disabled={disabled}
          accessibilityHint="Opens this page on your computer"
          style={{ minHeight: theme.layout.control }}
        />
      ))}
    </ScrollView>
  );
});
