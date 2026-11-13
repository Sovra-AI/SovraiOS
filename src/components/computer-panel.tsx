/**
 * The Computer tab: everything else in Sovra. Jump to a page (Team, Schedules, Models…),
 * then tap its controls on a live picture of the window, or pick them from a list. Text
 * boxes there get their own small typing bar.
 */
import { memo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { typeInto } from '@/remote/chat';
import { kindOf } from '@/remote/elements';
import type { InspectResult, UiElement } from '@/remote/wire';
import { useRemote } from '@/state/remote';
import { useTheme } from '@/theme';

import { PagesBar } from './desktop-views';
import { ControlsList, MirrorView } from './remote-views';
import { Button, Text, inputStyle } from './ui';

const KEYS: { label: string; key: string; hint: string }[] = [
  { label: 'Enter', key: 'enter', hint: 'Presses Enter' },
  { label: 'Esc', key: 'escape', hint: 'Presses Escape' },
  { label: 'Tab', key: 'tab', hint: 'Moves to the next control' },
  { label: '⌫', key: 'backspace', hint: 'Deletes one character' },
  { label: '↑', key: 'up', hint: 'Arrow up' },
  { label: '↓', key: 'down', hint: 'Arrow down' },
];

interface Props {
  snapshot: InspectResult;
  screenshot: string | null;
  disabled: boolean;
  onOpenPage(page: UiElement): void;
  /** Sovra's own chat box was tapped: continue in the Chat tab. */
  onChatBox(): void;
  isChatBox(element: UiElement): boolean;
  onScroll(element: UiElement, lines: number): void;
}

export const ComputerPanel = memo(function ComputerPanel({ snapshot, screenshot, disabled, onOpenPage, onChatBox, isChatBox, onScroll }: Props) {
  const theme = useTheme();
  const [view, setView] = useState<'picture' | 'list'>('picture');
  const [keys, setKeys] = useState(false);
  const [field, setField] = useState<UiElement | null>(null);
  const [text, setText] = useState('');

  const press = (element: UiElement) => {
    void useRemote.getState().act({ kind: 'click', element });
    if (kindOf(element) !== 'text') return;
    if (isChatBox(element)) onChatBox();
    else setField(element);
  };

  const type = async () => {
    if (!field || !text) return;
    const typed = await useRemote.getState().perform((client) => typeInto(client, field, text));
    if (typed) setText('');
  };

  return (
    <View style={{ flex: 1, gap: theme.space.small }}>
      <PagesBar snapshot={snapshot} onOpen={onOpenPage} disabled={disabled} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.small }}>
        <Text variant="caption" tone="secondary" style={{ flex: 1 }}>
          {view === 'picture' ? 'Tap anything outlined to press it. Pinch to zoom.' : 'Everything you can press on your computer right now.'}
        </Text>
        <Button
          label={view === 'picture' ? 'Show as list' : 'Show picture'}
          size="compact"
          variant="ghost"
          onPress={() => setView(view === 'picture' ? 'list' : 'picture')}
        />
      </View>
      <View style={{ flex: 1 }}>
        {view === 'picture' ? (
          // Pinch to zoom in on small controls (iOS; Android ignores zoom props).
          <ScrollView maximumZoomScale={4} minimumZoomScale={1} bouncesZoom centerContent contentContainerStyle={{ flexGrow: 1 }}>
            <MirrorView snapshot={snapshot} screenshot={screenshot} onPress={press} onScroll={onScroll} disabled={disabled} />
          </ScrollView>
        ) : (
          <ControlsList snapshot={snapshot} onPress={press} onScroll={onScroll} disabled={disabled} />
        )}
      </View>

      {field ? (
        <View style={{ gap: theme.space.small }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.small }}>
            <Text variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
              Typing into “{field.label ?? 'a box'}”
            </Text>
            <Button label="Done" size="compact" variant="ghost" onPress={() => setField(null)} />
          </View>
          <View style={{ flexDirection: 'row', gap: theme.space.small }}>
            <TextInput
              value={text}
              onChangeText={setText}
              autoFocus
              placeholder={`Type into “${field.label ?? 'this box'}”`}
              placeholderTextColor={theme.colors.mutedText}
              accessibilityLabel={`Text for ${field.label ?? 'the box'} on your computer`}
              onSubmitEditing={type}
              style={{ ...inputStyle(theme), flex: 1 }}
            />
            <Button label="Type" variant="primary" onPress={type} disabled={disabled || !text} />
          </View>
        </View>
      ) : null}

      {keys ? (
        <View style={{ flexDirection: 'row', gap: theme.space.compact, flexWrap: 'wrap' }}>
          {KEYS.map((entry) => (
            <Button
              key={entry.key}
              label={entry.label}
              accessibilityHint={entry.hint}
              disabled={disabled}
              onPress={() => void useRemote.getState().act({ kind: 'key', key: entry.key })}
              style={{ flexGrow: 1 }}
            />
          ))}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: keys }}
        onPress={() => setKeys(!keys)}
        style={{ minHeight: theme.layout.control, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="caption" tone="link">
          {keys ? 'Hide keyboard keys' : 'Keyboard keys (Enter, Esc, arrows)'}
        </Text>
      </Pressable>
    </View>
  );
});
