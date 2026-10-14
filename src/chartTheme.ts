import { useEffect, useState } from "react";

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

export type ChartTheme = {
  // Category names down the side of a bar chart — designer names, content
  // types. These are the labels people actually read.
  axisLabel: string;
  // Numeric tick values along the value axis. Deliberately quieter.
  axisTick: string;
  // Translucent band drawn behind the hovered row.
  cursorFill: string;
  tooltipContentStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
  tooltipItemStyle: React.CSSProperties;
  legendStyle: React.CSSProperties;
  // Unfilled remainder of the completion gauge.
  gaugeTrack: string;
  // Filled part of the completion gauge.
  gaugeFill: string;
  // Single-series bars (projects per designer, per content type).
  bar: string;
};

// Values mirror the CSS custom properties in App.css so charts and chrome
// don't drift apart.
const LIGHT: ChartTheme = {
  axisLabel: "#141e30",
  axisTick: "#5f6079",
  cursorFill: "rgba(20, 30, 48, 0.04)",
  tooltipContentStyle: {
    background: "#ffffff",
    border: "1px solid #e2e1ee",
    borderRadius: 10,
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
    color: "#141e30",
    fontSize: 12,
  },
  tooltipLabelStyle: { color: "#141e30", fontWeight: 600, marginBottom: 2 },
  tooltipItemStyle: { color: "#45475f" },
  legendStyle: { fontSize: 12, color: "#141e30" },
  gaugeTrack: "#e6e5f0",
  gaugeFill: "#2e9e68",
  bar: "#371ee1",
};

const DARK: ChartTheme = {
  axisLabel: "#f0f0f7",
  axisTick: "#a3a6c2",
  cursorFill: "rgba(148, 163, 184, 0.14)",
  tooltipContentStyle: {
    background: "#1c2a42",
    border: "1px solid #3b4a66",
    borderRadius: 10,
    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.45)",
    color: "#f0f0f7",
    fontSize: 12,
  },
  tooltipLabelStyle: { color: "#f0f0f7", fontWeight: 600, marginBottom: 2 },
  // Not the series colour: a blue bar's own fill is close to unreadable
  // against the dark tooltip panel.
  tooltipItemStyle: { color: "#cfcde0" },
  legendStyle: { fontSize: 12, color: "#f0f0f7" },
  gaugeTrack: "#2a3854",
  gaugeFill: "#3aa86a",
  bar: "#8a7dff",
};

export function useChartTheme(): ChartTheme {
  return useIsDarkMode() ? DARK : LIGHT;
}
