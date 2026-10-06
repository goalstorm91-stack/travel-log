import { useEffect, useRef, useState } from "react";
import {
  LngLatBounds,
  Map as MLMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { dayColor } from "../utils/colors";
import { loadBaseStyle } from "../utils/mapStyle";
import type { Stop } from "../utils/route";

interface LatLng {
  lat: number;
  lng: number;
}

const EMPTY_LINES = { type: "FeatureCollection" as const, features: [] };

function stopElement(stop: Stop, order: number, selected: boolean): HTMLDivElement {
  const size = selected ? 34 : 26;
  const color = dayColor(stop.dayNumber);
  const ring = selected
    ? `box-shadow:0 0 0 4px ${color}55,0 2px 6px rgba(15,23,42,.35);`
    : "box-shadow:0 1px 4px rgba(15,23,42,.35);";
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.innerHTML = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;${ring}color:#fff;font:700 ${selected ? 13 : 11}px/${size - 5}px -apple-system,sans-serif;text-align:center;">${order}</div>`;
  return el;
}

function moverElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "route-mover";
  el.style.pointerEvents = "none";
  el.innerHTML = "<span></span>";
  return el;
}

export default function RouteMap({
  stops,
  selectedIdx,
  onSelect,
  mover,
  trail,
  follow,
  pickMode = false,
  onPick,
  fallbackCenter,
}: {
  stops: Stop[];
  selectedIdx: number | null;
  onSelect: (index: number) => void;
  mover: LatLng | null;
  trail: [number, number][] | null; // [lat, lng] pairs
  follow: boolean;
  /** When true, the next map tap picks a location (crosshair cursor). */
  pickMode?: boolean;
  onPick?: (lat: number, lng: number) => void;
  /** Where to look when there are no stops to fit (e.g. the trip's city). */
  fallbackCenter?: LatLng;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const moverRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Init the map once (the style is fetched first, so this is async), and add
  // the empty route/trail sources + layers that later effects fill in.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let map: MLMap | null = null;

    loadBaseStyle().then(({ style }) => {
      if (cancelled) return;
      let m: MLMap;
      try {
        m = new MLMap({
          container,
          style,
          center: [10, 20],
          zoom: 1,
          minZoom: 0.6,
          maxZoom: 17,
          attributionControl: { compact: true },
        });
      } catch {
        setFailed(true); // e.g. no WebGL
        return;
      }
      map = m;
      m.addControl(new NavigationControl({ showCompass: false }), "top-left");
      m.on("error", (e) => console.warn("[map]", e.error?.message ?? e));
      m.on("load", () => {
        m.addSource("route-lines", { type: "geojson", data: EMPTY_LINES });
        m.addLayer({
          id: "route-solid",
          type: "line",
          source: "route-lines",
          filter: ["==", ["get", "dashed"], false],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": ["get", "color"], "line-width": 4, "line-opacity": 0.55 },
        });
        m.addLayer({
          id: "route-dashed",
          type: "line",
          source: "route-lines",
          filter: ["==", ["get", "dashed"], true],
          layout: { "line-cap": "butt" },
          paint: { "line-color": "#94a3b8", "line-width": 3, "line-opacity": 0.8, "line-dasharray": [2, 2.5] },
        });
        m.addSource("route-trail", { type: "geojson", data: EMPTY_LINES });
        m.addLayer({
          id: "route-trail",
          type: "line",
          source: "route-trail",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#312e81", "line-width": 5, "line-opacity": 0.9 },
        });
        setReady(true);
      });
      mapRef.current = m;
    });

    return () => {
      cancelled = true;
      moverRef.current?.remove();
      moverRef.current = null;
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Route lines + camera fit, when the stops change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const features = [];
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1];
      const b = stops[i];
      const sameDay = a.dayNumber === b.dayNumber;
      features.push({
        type: "Feature" as const,
        properties: { color: dayColor(b.dayNumber), dashed: !sameDay },
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [a.lng, a.lat],
            [b.lng, b.lat],
          ],
        },
      });
    }
    (map.getSource("route-lines") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features,
    });

    if (stops.length === 0) {
      if (fallbackCenter) map.jumpTo({ center: [fallbackCenter.lng, fallbackCenter.lat], zoom: 9 });
    } else if (stops.length === 1) {
      map.jumpTo({ center: [stops[0].lng, stops[0].lat], zoom: 13 });
    } else if (stops.length > 1) {
      const bounds = new LngLatBounds();
      stops.forEach((s) => bounds.extend([s.lng, s.lat]));
      map.fitBounds(bounds, { padding: 44, maxZoom: 14, animate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, stops]);

  // Numbered stop markers (restyled when the selection changes).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const markers = stops.map((stop, i) => {
      const el = stopElement(stop, i + 1, i === selectedIdx);
      el.style.zIndex = i === selectedIdx ? "5" : "1";
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onSelectRef.current(i);
      });
      return new Marker({ element: el, anchor: "center" })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [ready, stops, selectedIdx]);

  // "Pick on map" mode: a tap anywhere on the basemap reports its coordinates.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !pickMode) return;
    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";
    const onClick = (e: { lngLat: { lat: number; lng: number } }) =>
      onPickRef.current?.(e.lngLat.lat, e.lngLat.lng);
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      canvas.style.cursor = "";
    };
  }, [ready, pickMode]);

  // Playback marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!mover) {
      moverRef.current?.remove();
      moverRef.current = null;
      return;
    }
    if (!moverRef.current) {
      moverRef.current = new Marker({ element: moverElement(), anchor: "center" })
        .setLngLat([mover.lng, mover.lat])
        .addTo(map);
    } else {
      moverRef.current.setLngLat([mover.lng, mover.lat]);
    }
    if (follow) {
      map.jumpTo({ center: [mover.lng, mover.lat], zoom: Math.max(map.getZoom(), 11) });
    }
  }, [ready, mover, follow]);

  // Trail drawn behind the playback marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const data =
      trail && trail.length >= 2
        ? {
            type: "FeatureCollection" as const,
            features: [
              {
                type: "Feature" as const,
                properties: {},
                geometry: {
                  type: "LineString" as const,
                  coordinates: trail.map(([lat, lng]) => [lng, lat]),
                },
              },
            ],
          }
        : EMPTY_LINES;
    (map.getSource("route-trail") as GeoJSONSource).setData(data as never);
  }, [ready, trail]);

  return (
    <div className="relative h-80 w-full bg-sky-50">
      <div ref={containerRef} className="h-full w-full" />
      {failed && (
        <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-gray-500">
          이 기기에서는 지도를 표시할 수 없어요. 브라우저를 최신 버전으로 업데이트해 주세요.
        </p>
      )}
    </div>
  );
}
