/** Renders Sovra's replies (a safe Markdown subset) with the app's type tokens. */
import { memo, useMemo } from 'react';
import { Platform, ScrollView, View } from 'react-native';

import { useTheme } from '@/theme';

import { parseBlocks, parseInline } from './markdown-parse';
import { Text } from './ui';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

function Inline({ text, bold }: { text: string; bold?: boolean }) {
  const theme = useTheme();
  return (
    <>
      {parseInline(text).map((span, index) => (
        <Text
          key={index}
          style={{
            fontWeight: span.bold || bold ? '700' : undefined,
            fontStyle: span.italic ? 'italic' : undefined,
            fontFamily: span.code ? MONO : undefined,
            backgroundColor: span.code ? theme.colors.codeBackground : undefined,
          }}>
          {span.text}
        </Text>
      ))}
    </>
  );
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const theme = useTheme();
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <View style={{ gap: theme.space.small }}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'heading':
            return (
              <Text key={index} variant={block.level <= 2 ? 'sectionTitle' : 'label'} accessibilityRole="header">
                <Inline text={block.text} />
              </Text>
            );
          case 'paragraph':
            return (
              <Text key={index} selectable>
                <Inline text={block.text} />
              </Text>
            );
          case 'list':
            return (
              <View key={index} style={{ gap: theme.space.compact }}>
                {block.items.map((item, position) => (
                  <View key={position} style={{ flexDirection: 'row', gap: theme.space.small }}>
                    <Text tone="secondary">{block.ordered ? `${position + 1}.` : '•'}</Text>
                    <Text selectable style={{ flex: 1 }}>
                      <Inline text={item} />
                    </Text>
                  </View>
                ))}
              </View>
            );
          case 'code':
            return (
              <ScrollView key={index} horizontal style={{ backgroundColor: theme.colors.codeBackground, borderRadius: theme.radius.card }}>
                <Text selectable style={{ fontFamily: MONO, padding: theme.space.small }}>
                  {block.text}
                </Text>
              </ScrollView>
            );
          case 'table':
            return (
              <ScrollView key={index} horizontal>
                <View style={{ borderWidth: theme.layout.hairline, borderColor: theme.colors.border, borderRadius: theme.radius.card }}>
                  {[block.header, ...block.rows].map((row, rowIndex) => (
                    <View
                      key={rowIndex}
                      style={{
                        flexDirection: 'row',
                        borderTopWidth: rowIndex ? theme.layout.hairline : 0,
                        borderColor: theme.colors.border,
                        backgroundColor: rowIndex ? undefined : theme.colors.hover,
                      }}>
                      {row.map((cell, cellIndex) => (
                        <Text key={cellIndex} variant="caption" selectable style={{ width: 140, padding: theme.space.small }}>
                          <Inline text={cell} bold={rowIndex === 0} />
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            );
        }
      })}
    </View>
  );
});
