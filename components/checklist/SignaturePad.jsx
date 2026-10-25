// Finger-drawn signature without extra native libraries.
// Strokes are arrays of [x, y] points; each segment is drawn as a thin rotated View.
import { memo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";

const INK = "#111827";
const WIDTH = 2.5;

const Segment = memo(function Segment({ a, b }) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 0.5) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: (a[0] + b[0]) / 2 - length / 2,
        top: (a[1] + b[1]) / 2 - WIDTH / 2,
        width: length,
        height: WIDTH,
        borderRadius: WIDTH / 2,
        backgroundColor: INK,
        transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
      }}
    />
  );
});

// value: strokes (array) | undefined. onChange(strokes | null).
// onDrawingChange(true/false) lets the parent pause ScrollView while drawing.
export default function SignaturePad({ value, onChange, onDrawingChange, hasError }) {
  const [current, setCurrent] = useState(null);
  const currentRef = useRef(null);
  const strokesRef = useRef(value || []);
  strokesRef.current = value || [];
  // The responder is created once — read the latest callbacks through refs
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onDrawingRef = useRef(onDrawingChange);
  onDrawingRef.current = onDrawingChange;

  const point = (e) => [
    Math.round(e.nativeEvent.locationX),
    Math.round(e.nativeEvent.locationY),
  ];

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        onDrawingRef.current?.(true);
        currentRef.current = [point(e)];
        setCurrent(currentRef.current);
      },
      onPanResponderMove: (e) => {
        currentRef.current = [...currentRef.current, point(e)];
        setCurrent(currentRef.current);
      },
      onPanResponderRelease: () => {
        const stroke = currentRef.current;
        currentRef.current = null;
        setCurrent(null);
        onDrawingRef.current?.(false);
        if (stroke?.length > 1) onChangeRef.current([...strokesRef.current, stroke]);
      },
      onPanResponderTerminate: () => {
        currentRef.current = null;
        setCurrent(null);
        onDrawingRef.current?.(false);
      },
    })
  ).current;

  const strokes = current ? [...(value || []), current] : value || [];
  const empty = !strokes.length;

  return (
    <View>
      <View
        style={[styles.pad, hasError && styles.padError]}
        {...responder.panHandlers}
      >
        {empty && <Text style={styles.placeholder} pointerEvents="none">Sign here with your finger</Text>}
        {strokes.map((stroke, s) =>
          stroke.slice(1).map((p, i) => (
            <Segment key={`${s}-${i}`} a={stroke[i]} b={p} />
          ))
        )}
        <View style={styles.baseline} pointerEvents="none" />
      </View>
      {!empty && (
        <Pressable onPress={() => onChange(null)} hitSlop={8} style={styles.clearBtn}>
          <Text style={styles.clearText}>Clear signature</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    height: 170,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FAFAFA",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  padError: { borderColor: "#EF4444" },
  placeholder: { color: "#9CA3AF", fontSize: 13 },
  baseline: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 34,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  clearBtn: { alignSelf: "flex-end", marginTop: 6 },
  clearText: { fontSize: 12, color: "#6B7280", fontWeight: "600", textDecorationLine: "underline" },
});
