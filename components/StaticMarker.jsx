import { useEffect, useState } from "react";
import { Marker } from "react-native-maps";

// Custom-view markers default to tracksViewChanges=true, which makes Android
// re-rasterise the marker bitmap every 40ms forever and eventually OOMs the app.
// Track just long enough for the first paint, then freeze the bitmap.
// Coordinate updates still move the marker as before.
export default function StaticMarker(props) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setTracksViewChanges(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  return <Marker {...props} tracksViewChanges={tracksViewChanges} />;
}
