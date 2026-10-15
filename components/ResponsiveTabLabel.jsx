// components/ResponsiveTabLabel.jsx
//
// Bottom-tab label whose size is worked out from the screen width, so every
// tab on a device gets the SAME size and the longest label still fits —
// small phones get slightly smaller text, wide phones / tablets bigger.
import { Text, useWindowDimensions } from "react-native";

const MIN_FONT = 9;
const MAX_FONT = 12;
// Rough width of one bold uppercase/lowercase character, as a share of fontSize
const CHAR_WIDTH = 0.62;
const SIDE_GAP = 4; // breathing room inside each tab

export function getTabFontSize(screenWidth, tabCount, longestLabelChars) {
  const tabWidth = screenWidth / tabCount;
  const fit = (tabWidth - SIDE_GAP) / (longestLabelChars * CHAR_WIDTH);
  return Math.max(MIN_FONT, Math.min(MAX_FONT, Math.floor(fit * 2) / 2));
}

export default function ResponsiveTabLabel({
  color,
  children,
  tabCount,
  longestLabelChars,
}) {
  const { width } = useWindowDimensions();
  const fontSize = getTabFontSize(width, tabCount, longestLabelChars);

  return (
    <Text
      numberOfLines={1}
      // Last-resort safety on very unusual widths — normally never needed
      adjustsFontSizeToFit
      minimumFontScale={0.85}
      allowFontScaling={false}
      style={{
        color,
        fontSize,
        fontWeight: "700",
        marginTop: 2,
      }}
    >
      {children}
    </Text>
  );
}
