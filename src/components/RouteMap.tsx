import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { dayColor } from "../utils/colors";
import type { Stop } from "../utils/route";

interface LatLng {
  lat: number;
  lng: number;
}

function stopIcon(stop: Stop, order: number, selected: boolean): L.DivIcon {
  const size = selected ? 34 : 26;
  const color = dayColor(stop.dayNumber);
  const ring = selected ? `box-shadow:0 0 0 4px ${color}55,0 2px 6px rgba(15,23,42,.35);` : "box-shadow:0 1px 4px rgba(15,23,42,.35);";
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;${ring}color:#fff;font:700 ${selected ? 13 : 11}px/${size - 5}px -apple-system,sans-serif;text-align:center;">${order}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const moverIcon = L.divIcon({
  className: "route-mover",
  html: "<span></span>",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export default function RouteMap({
  stops,
  selectedIdx,
  onSelect,
  mover,
  trail,
  follow,
}: {
  stops: Stop[];
  selectedIdx: number | null;
  onSelect: (index: number) => void;
  mover: LatLng | null;
  trail: [number, number][] | null;
  follow: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const lineLayerRef = useRef<L.LayerGroup | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const moverRef = useRef<L.Marker | null>(null);
  const trailRef = useRef<L.Polyline | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Init map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const map = L.map(container, { center: [20, 10], zoom: 2, minZoom: 2, maxZoom: 18 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    lineLayerRef.current = L.layerGroup().addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      // Leaflet leaves a marker on the container that breaks re-init under StrictMode.
      delete (container as unknown as { _leaflet_id?: number })._leaflet_id;
      mapRef.current = null;
      lineLayerRef.current = null;
      markerLayerRef.current = null;
      moverRef.current = null;
      trailRef.current = null;
    };
  }, []);

  // Route lines + camera fit, when the stops change.
  useEffect(() => {
    const map = mapRef.current;
    const lines = lineLayerRef.current;
    if (!map || !lines) return;
    lines.clearLayers();

    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1];
      const b = stops[i];
      const sameDay = a.dayNumber === b.dayNumber;
      L.polyline(
        [
          [a.lat, a.lng],
          [b.lat, b.lng],
        ],
        sameDay
          ? { color: dayColor(b.dayNumber), weight: 4, opacity: 0.55 }
          : { color: "#94a3b8", weight: 3, opacity: 0.8, dashArray: "6 8" },
      ).addTo(lines);
    }

    if (stops.length === 1) {
      map.setView([stops[0].lat, stops[0].lng], 14, { animate: false });
    } else if (stops.length > 1) {
      map.fitBounds(
        L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number])),
        { padding: [36, 36], maxZoom: 15, animate: false },
      );
    }
  }, [stops]);

  // Numbered stop markers (restyled when the selection changes).
  useEffect(() => {
    const markers = markerLayerRef.current;
    if (!markers) return;
    markers.clearLayers();
    stops.forEach((stop, i) => {
      L.marker([stop.lat, stop.lng], {
        icon: stopIcon(stop, i + 1, i === selectedIdx),
        zIndexOffset: i === selectedIdx ? 500 : 0,
      })
        .on("click", () => onSelectRef.current(i))
        .addTo(markers);
    });
  }, [stops, selectedIdx]);

  // Playback marker + trail.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!mover) {
      moverRef.current?.remove();
      moverRef.current = null;
      return;
    }
    if (!moverRef.current) {
      moverRef.current = L.marker([mover.lat, mover.lng], {
        icon: moverIcon,
        interactive: false,
        zIndexOffset: 1000,
      }).addTo(map);
    } else {
      moverRef.current.setLatLng([mover.lat, mover.lng]);
    }
    if (follow) {
      map.setView([mover.lat, mover.lng], Math.max(map.getZoom(), 12), { animate: false });
    }
  }, [mover, follow]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!trail || trail.length < 2) {
      trailRef.current?.remove();
      trailRef.current = null;
      return;
    }
    if (!trailRef.current) {
      trailRef.current = L.polyline(trail, { color: "#312e81", weight: 5, opacity: 0.9 }).addTo(map);
    } else {
      trailRef.current.setLatLngs(trail);
    }
  }, [trail]);

  return <div ref={containerRef} className="h-80 w-full" />;
}
