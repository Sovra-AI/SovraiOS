/**
 * Views over the desktop's Inspect snapshot: a spatial mirror of the Sovra window,
 * an accessible list of its controls, and the visible conversation text. Every
 * tap becomes a real click on the desktop control (by observed target).
 */
import { Image } from 'expo-image';
import { memo, useMemo, useState } from 'react';
import { FlatList, type LayoutChangeEvent, Pressable, ScrollView, View } from 'react-native';

import { actionableControls, describe, humanRole, kindOf, readableText, windowSize } from '@/remote/elements';
import type { InspectResult, UiElement } from '@/remote/wire';
import { useTheme } from '@/theme';

import { Button, Surface, Text } from './ui';

interface ViewProps {
  snapshot: InspectResult;
  onPress(element: UiElement): void;
  onScroll(element: UiElement, lines: number): void;
  disabled: boolean;
}

/** The Sovra window, scaled to the phone's width. Boxes are real controls. */
export const MirrorView = memo(function MirrorView({ snapshot, screenshot, onPress, disabled }: ViewProps & { screenshot: string | null }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const size = useMemo(() => windowSize(snapshot), [snapshot]);
  const scale = width > 0 ? width / size.width : 0;
  const controls = useMemo(
    () =>
      snapshot.elements
        .filter((element) => element.visible && kindOf(element) !== 'content' && element.bounds.width > 0 && element.bounds.height > 0)
        // Larger first so smaller, nested controls stay on top and tappable.
        .sort((a, b) => b.bounds.width * b.bounds.height - a.bounds.width * a.bounds.height),
    [snapshot],
  );
  const text = useMemo(() => readableText(snapshot), [snapshot]);

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      accessibilityLabel="Picture of the Sovra window on your computer"
      style={{
        width: '100%',
        height: scale ? size.height * scale : 240,
        borderRadius: theme.radius.card,
        overflow: 'hidden',
        backgroundColor: theme.colors.surface,
        borderWidth: theme.layout.hairline,
        borderColor: theme.colors.border,
      }}>
      {screenshot ? (
        <Image source={{ uri: `data:image/png;base64,${screenshot}` }} style={{ position: 'absolute', inset: 0 }} contentFit="fill" />
      ) : (
        text.map((element) => (
          <View
            key={element.target}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: element.bounds.x * scale,
              top: element.bounds.y * scale,
              width: element.bounds.width * scale,
              height: element.bounds.height * scale,
              overflow: 'hidden',
            }}>
            <Text style={{ fontSize: Math.max(6, Math.min(12, element.bounds.height * scale * 0.7)), lineHeight: undefined }} tone="secondary" numberOfLines={1}>
              {element.label}
            </Text>
          </View>
        ))
      )}
      {scale > 0 &&
        controls.map((element) => {
          const kind = kindOf(element);
          const accent = kind === 'text' ? theme.colors.ring : element.selected ? theme.colors.link : theme.colors.controlBorder;
          return (
            <Pressable
              key={element.target}
              disabled={disabled || element.disabled === true}
              onPress={() => onPress(element)}
              accessibilityRole={kind === 'text' ? 'search' : 'button'}
              accessibilityLabel={describe(element)}
              accessibilityState={{ disabled: element.disabled === true, selected: element.selected === true }}
              hitSlop={4}
              style={({ pressed }) => ({
                position: 'absolute',
                left: element.bounds.x * scale,
                top: element.bounds.y * scale,
                width: element.bounds.width * scale,
                height: element.bounds.height * scale,
                borderRadius: 3,
                borderWidth: 1,
                borderColor: accent,
                backgroundColor: pressed ? theme.colors.selection : screenshot ? 'transparent' : 'rgba(124,58,237,0.04)',
                opacity: element.disabled ? 0.4 : 1,
                justifyContent: 'center',
                paddingHorizontal: 2,
              })}>
              {!screenshot && element.bounds.height * scale >= 10 ? (
                <Text numberOfLines={1} style={{ fontSize: Math.max(6, Math.min(11, element.bounds.height * scale * 0.6)), lineHeight: undefined }}>
                  {element.label ?? ''}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
    </View>
  );
});

/** Every labelled control, in reading order, at full touch size. */
export const ControlsList = memo(function ControlsList({ snapshot, onPress, onScroll, disabled }: ViewProps) {
  const theme = useTheme();
  const controls = useMemo(() => actionableControls(snapshot), [snapshot]);
  return (
    <FlatList
      data={controls}
      keyExtractor={(element) => element.target}
      contentContainerStyle={{ gap: theme.space.small, paddingBottom: theme.space.large }}
      ListEmptyComponent={<Text tone="secondary">No controls are visible on your computer right now.</Text>}
      renderItem={({ item }) => {
        const kind = kindOf(item);
        return (
          <Surface variant="subtle" style={{ flexDirection: 'row', alignItems: 'center', padding: theme.space.small + 4 }}>
            <Pressable
              style={{ flex: 1, gap: 2 }}
              disabled={disabled || item.disabled === true}
              onPress={() => onPress(item)}
              accessibilityRole="button"
              accessibilityLabel={describe(item)}
              accessibilityHint={kind === 'text' ? 'Focuses this box so you can type into it' : 'Presses this on your computer'}
              accessibilityState={{ disabled: item.disabled === true, selected: item.selected === true, checked: item.checked === true }}>
              <Text variant="label" numberOfLines={2} style={{ opacity: item.disabled ? 0.5 : 1 }}>
                {describe(item)}
              </Text>
              <Text variant="caption" tone="muted">
                {[humanRole(item.role), item.selected ? 'selected' : null, item.checked === true ? 'on' : null, item.disabled ? 'unavailable' : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Pressable>
            {kind === 'scroll' ? (
              <View style={{ flexDirection: 'row', gap: theme.space.compact }}>
                <Button label="Up" size="compact" onPress={() => onScroll(item, 5)} disabled={disabled} />
                <Button label="Down" size="compact" onPress={() => onScroll(item, -5)} disabled={disabled} />
              </View>
            ) : null}
          </Surface>
        );
      }}
    />
  );
});

/** The visible conversation text, so replies can be read on the phone. */
export const ConversationView = memo(function ConversationView({ snapshot, onScroll, disabled }: Omit<ViewProps, 'onPress'>) {
  const theme = useTheme();
  const lines = useMemo(() => readableText(snapshot), [snapshot]);
  const scroller = useMemo(
    () =>
      snapshot.elements
        .filter((element) => element.visible && kindOf(element) === 'scroll')
        .sort((a, b) => b.bounds.width * b.bounds.height - a.bounds.width * a.bounds.height)[0] ?? null,
    [snapshot],
  );
  return (
    <View style={{ flex: 1, gap: theme.space.small }}>
      <ScrollView contentContainerStyle={{ gap: theme.space.small + 4, paddingBottom: theme.space.medium }}>
        {lines.length === 0 ? (
          <Text tone="secondary">Nothing to read yet. Send a message below, or open a chat on your computer.</Text>
        ) : (
          lines.map((element) => (
            <Text key={element.target} selectable>
              {element.label}
            </Text>
          ))
        )}
      </ScrollView>
      {scroller ? (
        <View style={{ flexDirection: 'row', gap: theme.space.small }}>
          <Button label="Earlier" size="compact" style={{ flex: 1 }} onPress={() => onScroll(scroller, 8)} disabled={disabled} />
          <Button label="Later" size="compact" style={{ flex: 1 }} onPress={() => onScroll(scroller, -8)} disabled={disabled} />
        </View>
      ) : null}
    </View>
  );
});
