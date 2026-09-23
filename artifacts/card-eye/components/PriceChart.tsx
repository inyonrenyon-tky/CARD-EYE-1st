import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Path, Line, Text as SvgText } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { PriceHistoryPoint } from '@workspace/api-client-react';

export type ChartSource = {
  source: string;
  displayName: string;
  history: PriceHistoryPoint[];
  type: 'sale' | 'transaction';
};

type Props = {
  sources: ChartSource[];
  periodDays: number;
};

const CHART_COLORS = ['#3b82f6', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899'];

export function PriceChart({ sources, periodDays }: Props) {
  const colors = useColors();
  const [activeSources, setActiveSources] = useState<Record<string, boolean>>(
    sources.reduce((acc, src) => ({ ...acc, [src.source]: true }), {})
  );

  const toggleSource = (source: string) => {
    setActiveSources((prev) => ({ ...prev, [source]: !prev[source] }));
  };

  const activeData = useMemo(() => {
    return sources.filter((s) => activeSources[s.source] && s.history && s.history.length > 0);
  }, [sources, activeSources]);

  const { minPrice, maxPrice, dates } = useMemo(() => {
    if (activeData.length === 0) return { minPrice: 0, maxPrice: 0, dates: [] as string[] };
    
    let min = Infinity;
    let max = -Infinity;
    const allDates = new Set<string>();

    activeData.forEach((src) => {
      src.history.forEach((pt) => {
        if (pt.price < min) min = pt.price;
        if (pt.price > max) max = pt.price;
        allDates.add(pt.date);
      });
    });

    // Add 10% padding to max/min
    const range = max - min;
    max = Math.max(0, max + range * 0.1);
    min = Math.max(0, min - range * 0.1);
    if (max === min) { max += 1000; min = Math.max(0, min - 1000); }

    const sortedDates = Array.from(allDates).sort();
    return { minPrice: min, maxPrice: max, dates: sortedDates };
  }, [activeData]);

  if (sources.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          グラフデータがありません
        </Text>
      </View>
    );
  }

  const CHART_HEIGHT = 200;
  const CHART_WIDTH = 300; // Will be scaled by viewbox
  const PADDING_TOP = 20;
  const PADDING_BOTTOM = 35;
  const PADDING_LEFT = 40;
  const PADDING_RIGHT = 10;
  const GRAPH_WIDTH = CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const GRAPH_HEIGHT = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const getX = (dateStr: string) => {
    if (dates.length <= 1) return PADDING_LEFT + GRAPH_WIDTH / 2;
    const earliest = Date.parse(dates[0]);
    const latest = Date.parse(dates[dates.length - 1]);
    return PADDING_LEFT + ((Date.parse(dateStr) - earliest) / (latest - earliest)) * GRAPH_WIDTH;
  };

  const getY = (price: number) => {
    const range = maxPrice - minPrice;
    if (range === 0) return PADDING_TOP + GRAPH_HEIGHT / 2;
    return PADDING_TOP + GRAPH_HEIGHT - ((price - minPrice) / range) * GRAPH_HEIGHT;
  };

  const makePath = (history: {date: string, price: number}[]) => {
    if (history.length === 0) return '';
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    let d = '';
    sorted.forEach((pt, i) => {
      const x = getX(pt.date);
      const y = getY(pt.price);
      if (i === 0) {
        d += `M ${x} ${y}`;
      } else {
        d += ` L ${x} ${y}`;
      }
    });
    return d;
  };

  return (
    <View style={styles.container}>
      {activeData.length > 0 ? (
        <View style={styles.svgContainer}>
          <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
            {/* Grid lines */}
            {[0, 0.5, 1].map((ratio) => {
              const y = PADDING_TOP + GRAPH_HEIGHT * ratio;
              const price = maxPrice - (maxPrice - minPrice) * ratio;
              return (
                <React.Fragment key={ratio}>
                  <Line
                    x1={PADDING_LEFT}
                    y1={y}
                    x2={CHART_WIDTH - PADDING_RIGHT}
                    y2={y}
                    stroke={colors.border}
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <SvgText
                    x={PADDING_LEFT - 5}
                    y={y + 4}
                    fontSize="10"
                    fill={colors.mutedForeground}
                    textAnchor="end"
                  >
                    ¥{Math.round(price).toLocaleString()}
                  </SvgText>
                </React.Fragment>
              );
            })}
            {dates.length > 1 && [dates[0], dates[dates.length - 1]].map((date, index) => (
              <SvgText
                key={date}
                x={index === 0 ? PADDING_LEFT : CHART_WIDTH - PADDING_RIGHT}
                y={CHART_HEIGHT - 6}
                fontSize="10"
                fill={colors.mutedForeground}
                textAnchor={index === 0 ? "start" : "end"}
              >
                {new Date(date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
              </SvgText>
            ))}

            {/* Paths */}
            {activeData.map((src) => (
              <Path
                key={src.source}
                d={makePath(src.history)}
                stroke={CHART_COLORS[sources.findIndex(item => item.source === src.source) % CHART_COLORS.length]}
                strokeWidth="2.5"
                strokeDasharray={src.type === 'sale' ? '5 5' : 'none'}
                fill="none"
              />
            ))}
          </Svg>
        </View>
      ) : (
        <View style={[styles.svgContainer, { height: CHART_HEIGHT, justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>表示するデータがありません</Text>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legendContainer}>
        {sources.map((src, idx) => {
          const isActive = activeSources[src.source];
          const color = CHART_COLORS[idx % CHART_COLORS.length];
          const typeLabel = src.type === 'sale' ? '販売' : '成約';
          return (
            <Pressable
              key={src.source}
              onPress={() => toggleSource(src.source)}
              style={[
                styles.legendItem,
                {
                  backgroundColor: isActive ? color + '20' : colors.card,
                  borderColor: isActive ? color : colors.border,
                  borderStyle: src.type === 'sale' ? 'dashed' : 'solid',
                },
              ]}
            >
              <View style={[styles.legendDot, { backgroundColor: isActive ? color : colors.border }]} />
              <Text style={[styles.legendText, { color: isActive ? colors.foreground : colors.mutedForeground }]}>
                {src.displayName} ({typeLabel})
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
        ※ 「販売」はショップの提示価格であり、実際の成約価格ではありません。表示期間：{periodDays === 365 ? '1年' : `${periodDays}日`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 12,
  },
  disclaimerText: {
    fontSize: 10,
    textAlign: 'center',
    paddingHorizontal: 10,
    marginTop: 4,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    padding: 20,
  },
  svgContainer: {
    width: '100%',
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
