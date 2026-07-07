export const getThemeColorName = (hex) => {
  const normalized = hex?.toLowerCase();

  const colorMap = {
    "#f97316": "Orange",
    "#1e3a8a": "Corporate Blue",
    "#fbbf24": "Gold",
    "#22c55e": "Green",
    "#ef4444": "Red",
    "#a855f7": "Purple",
  };

  return colorMap[normalized] || `Custom Theme (${hex})`;
};