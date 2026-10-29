import { useEffect, useState } from "react";
import type { SocialPostStatus } from "./types";

// Recharts renders SVG and takes most of its colours as inline props —
// axis `tick` fills, tooltip `contentStyle`, the hover `cursor` band, legend
// `wrapperStyle`. A stylesheet can't reliably restyle those the way it can
// the rest of the app, and the tooltip's per-series item colour is set
// inline from the bar/slice fill, which lands unreadably dark on a dark
// panel. So charts have to know the theme in JS.
//
// Read off the `dark-mode` class App.tsx puts on <html> rather than
// prop-drilling a flag through every chart, so the whole lot stays in sync
// with the toggle no matter how deeply nested.
export function useIsDarkMode(): boolean {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark-mode"),
  );
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() =>
      setDark(root.classList.contains("dark-mode")),
    );
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export const CHART_FONT = '"DM Sans", ui-sans-serif, system-ui, sans-serif';
export const CHART_MONO = '"DM Mono", ui-monospace, Menlo, Consolas, monospace';

export type ChartTheme = {
  // Category names down the side of a bar chart — designer names, content
  // types. These are the labels people actually read.
  axisLabel: string;
  // Numeric tick values along the value axis. Deliberately quieter.
  axisTick: string;
  // Recessive gridlines behind a chart with a value axis.
  grid: string;
  // The chart's own surface, used as the gap between touching fills.
  surface: string;
  // Translucent band drawn behind the hovered row.
  cursorFill: string;
  tooltipContentStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
  tooltipItemStyle: React.CSSProperties;
  legendStyle: React.CSSProperties;
  // Direct labels at the end of a bar: text ink, never the series colour.
  valueLabel: string;
  // Unfilled remainder of the completion gauge.
  gaugeTrack: string;
  // Filled part of the completion gauge.
  gaugeFill: string;
  // Single-series bars (projects per designer, per content type).
  bar: string;
  // Multi-series palette in a fixed order, never cycled. Brand colours
  // (design system §4) arranged so each adjacent pair stays apart under
  // colour-vision deficiency: Cobalt, Peach, WiseTech Blue, Sky, Maroon,
  // Violet, Teal. The light accents are below 3:1 against the surface, so
  // every chart that uses them also carries direct labels or a legend.
  series: string[];
  // One fill per social post status for the stacked months chart. Fixed
  // per status so a filter that drops a status never repaints the rest.
  statusSeries: Record<SocialPostStatus, string>;
};

// Values mirror the CSS custom properties in App.css so charts and chrome
// don't drift apart.
const LIGHT: ChartTheme = {
  axisLabel: "#141e30",
  axisTick: "#5d6b82",
  grid: "#eef0f4",
  surface: "#ffffff",
  cursorFill: "rgba(20, 30, 48, 0.04)",
  tooltipContentStyle: {
    background: "#ffffff",
    border: "1px solid #dde1e8",
    borderRadius: 10,
    boxShadow: "none",
    color: "#141e30",
    fontSize: 12,
    fontFamily: CHART_FONT,
  },
  tooltipLabelStyle: { color: "#141e30", fontWeight: 600, marginBottom: 2 },
  tooltipItemStyle: { color: "#3a4a66" },
  legendStyle: { fontSize: 12, color: "#141e30", fontFamily: CHART_FONT, paddingTop: 8 },
  valueLabel: "#141e30",
  gaugeTrack: "#eef0f4",
  gaugeFill: "#371ee1",
  bar: "#371ee1",
  series: ["#371ee1", "#ffbf98", "#1d1765", "#a7cff8", "#651d32", "#b7b3ff", "#244349"],
  statusSeries: {
    draft: "#8b96a8",
    pending: "#b7b3ff",
    scheduled: "#ffbf98",
    onHold: "#5d6b82",
    published: "#371ee1",
    cancelled: "#651d32",
    backlog: "#a7cff8",
  },
};

const DARK: ChartTheme = {
  axisLabel: "#eef0f4",
  axisTick: "#b9c0cc",
  grid: "#243450",
  surface: "#141e30",
  cursorFill: "rgba(185, 192, 204, 0.12)",
  tooltipContentStyle: {
    background: "#141e30",
    border: "1px solid #3a4a66",
    borderRadius: 10,
    boxShadow: "none",
    color: "#eef0f4",
    fontSize: 12,
    fontFamily: CHART_FONT,
  },
  tooltipLabelStyle: { color: "#eef0f4", fontWeight: 600, marginBottom: 2 },
  // Not the series colour: a blue bar's own fill is close to unreadable
  // against the dark tooltip panel.
  tooltipItemStyle: { color: "#dde1e8" },
  legendStyle: { fontSize: 12, color: "#eef0f4", fontFamily: CHART_FONT, paddingTop: 8 },
  valueLabel: "#eef0f4",
  gaugeTrack: "#243450",
  gaugeFill: "#b7b3ff",
  bar: "#b7b3ff",
  // The light accents, in the same CVD-checked order, with the lifted
  // Cobalt where Blue and Maroon would sink into the dark surface.
  series: ["#b7b3ff", "#ffbf98", "#a7cff8", "#c6ffd1", "#5b45f0", "#eafc88", "#ff9cb8"],
  statusSeries: {
    draft: "#5d6b82",
    pending: "#b7b3ff",
    scheduled: "#ffbf98",
    onHold: "#8b96a8",
    published: "#a7cff8",
    cancelled: "#ff9cb8",
    backlog: "#c6ffd1",
  },
};

export function useChartTheme(): ChartTheme {
  return useIsDarkMode() ? DARK : LIGHT;
}
