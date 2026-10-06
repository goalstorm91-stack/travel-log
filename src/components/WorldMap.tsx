import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Map as MLMap, Marker, NavigationControl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { geoBounds } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import worldData from "../data/countries-110m.json";
import { colorForCountry } from "../utils/colors";
import { loadBaseStyle } from "../utils/mapStyle";

interface CountryFeature {
  type: "Feature";
  id: string;
  properties: { name: string };
  geometry: Geometry;
}

export interface MapPin {
  tripId: string;
  lat: number;
  lng: number;
  color: string;
  label: string;
}

export interface WorldMapHandle {
  focusCountry: (countryCode: string) => void;
  focusPoint: (lat: number, lng: number, zoom?: number) => void;
  reset: () => void;
}

// The map is a globe: start over East Asia, small enough to see the whole sphere.
const WORLD_CENTER: [number, number] = [127, 33]; // [lng, lat]
const WORLD_ZOOM = 0.9;
const SPIN_DEG_PER_SEC = 5;

// Thin atmosphere around the globe that fades out as you zoom in to the flat map.
const GLOBE_SKY = {
  "sky-color": "#7cc0f5",
  "horizon-color": "#d6ecfb",
  "fog-color": "#ffffff",
  "sky-horizon-blend": 0.6,
  "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 4, 0.8, 7, 0],
};

// A few features (Kosovo, N. Cyprus...) have no id in the source data.
function countryKey(c: CountryFeature): string {
  return c.id ?? c.properties.name;
}

function pinElement(color: string, active: boolean): HTMLDivElement {
  const size = active ? 34 : 26;
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="-8 -12 16 22" style="display:block;filter:drop-shadow(0 1.5px 2px rgba(15,23,42,0.4))">
      <path d="M0 10 C0 10 6.5 5 6.5 0 C6.5 -3.6 3.6 -6.5 0 -6.5 C-3.6 -6.5 -6.5 -3.6 -6.5 0 C-6.5 5 0 10 0 10 Z" fill="${color}" stroke="#fff" stroke-width="1.4"/>
      <circle cx="0" cy="0" r="2.3" fill="#fff"/>
    </svg>`;
  return el;
}

const WorldMap = forwardRef<
  WorldMapHandle,
  {
    visitedCodes: Set<string>;
    pins?: MapPin[];
    activePinId?: string | null;
    onHoverCountry?: (id: string | null, name: string | null) => void;
    onCountryClick?: (id: string, name: string) => void;
    onPinClick?: (tripId: string) => void;
  }
>(function WorldMap(
  { visitedCodes, pins = [], activePinId, onHoverCountry, onCountryClick, onPinClick },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const onlineRef = useRef(true);
  const spinningRef = useRef(true); // idle spin, until the user (or a focus call) takes over
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Latest callbacks, so map listeners registered once never go stale.
  const cb = useRef({ onHoverCountry, onCountryClick, onPinClick });
  cb.current = { onHoverCountry, onCountryClick, onPinClick };

  const countries = useMemo(() => {
    const collection = feature(
      worldData as never,
      // @ts-expect-error topojson object key not in generic Objects type
      worldData.objects.countries,
    ) as unknown as FeatureCollection<Geometry, { name: string }>;
    return collection.features as unknown as CountryFeature[];
  }, []);

  const countryData = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: countries.map((c) => {
        const key = countryKey(c);
        return {
          type: "Feature" as const,
          geometry: c.geometry,
          properties: {
            cid: key,
            name: c.properties.name,
            visited: visitedCodes.has(key),
            color: colorForCountry(key),
          },
        };
      }),
    }),
    [countries, visitedCodes],
  );

  function zoomToCountry(countryCode: string) {
    const map = mapRef.current;
    const feat = countries.find((c) => countryKey(c) === countryCode);
    if (!map || !feat) return;
    spinningRef.current = false;
    const [[minLng, minLat], [maxLng, maxLat]] = geoBounds(feat as never);
    map.fitBounds(
      [
        [minLng, minLat],
        // d3 reports countries that straddle the antimeridian (Russia, Fiji) as minLng > maxLng
        [maxLng < minLng ? maxLng + 360 : maxLng, maxLat],
      ],
      { padding: 24, maxZoom: 8, duration: 800 },
    );
  }
  const zoomRef = useRef(zoomToCountry);
  zoomRef.current = zoomToCountry;

  // Init the map once (the style is fetched first, so this is async).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let map: MLMap | null = null;

    loadBaseStyle().then(({ style, online }) => {
      if (cancelled) return;
      onlineRef.current = online;
      let created: MLMap;
      try {
        created = new MLMap({
          container,
          style: { ...style, projection: { type: "globe" }, sky: GLOBE_SKY as never },
          center: WORLD_CENTER,
          zoom: WORLD_ZOOM,
          minZoom: 0.4,
          maxZoom: 16,
          attributionControl: { compact: true },
          canvasContextAttributes: { antialias: true, preserveDrawingBuffer: import.meta.env.DEV },
        });
      } catch {
        setFailed(true); // e.g. no WebGL
        return;
      }
      map = created;
      created.addControl(new NavigationControl({ showCompass: false }), "top-left");
      created.on("load", () => setReady(true));
      created.on("error", (e) => console.warn("[map]", e.error?.message ?? e));
      mapRef.current = created;
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Country tint layers (and click/hover handling), created once then updated in place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const existing = map.getSource("countries") as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(countryData as never);
      return;
    }

    map.addSource("countries", { type: "geojson", data: countryData as never });
    // Where to put the tints: online, right under the roads (above land cover) so
    // roads and labels stay crisp on top; offline there is no basemap to sit under.
    const styleLayers = map.getStyle().layers;
    const waterway = styleLayers.find((l) => l.id === "waterway");
    const beforeId = waterway?.id ?? styleLayers.find((l) => l.type === "symbol")?.id;

    if (!onlineRef.current) {
      // No basemap available: draw every country so the map is still usable offline.
      map.addLayer(
        { id: "country-base", type: "fill", source: "countries", paint: { "fill-color": "#f8fafc" } },
        beforeId,
      );
      map.addLayer(
        { id: "country-base-line", type: "line", source: "countries", paint: { "line-color": "#cbd5e1", "line-width": 0.6 } },
        beforeId,
      );
    }
    map.addLayer(
      {
        id: "country-fill-visited",
        type: "fill",
        source: "countries",
        filter: ["==", ["get", "visited"], true],
        paint: {
          "fill-color": ["get", "color"],
          // strong on the globe, fading out as you zoom into streets so the basemap stays readable
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.45, 4, 0.4, 8, 0.14, 11, 0.04],
        },
      },
      beforeId,
    );
    map.addLayer(
      {
        id: "country-line-visited",
        type: "line",
        source: "countries",
        filter: ["==", ["get", "visited"], true],
        paint: {
          "line-color": "#ffffff",
          "line-width": 1.2,
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 1, 8, 0.6, 11, 0],
        },
      },
      beforeId,
    );
    // Invisible layer on every country, purely for hit-testing.
    map.addLayer(
      {
        id: "country-hit",
        type: "fill",
        source: "countries",
        paint: { "fill-color": "#000000", "fill-opacity": 0 },
      },
      beforeId,
    );

    // Our country shapes are low-resolution, so they spill over the real coastline.
    // Repaint the basemap's water over the tint to cut it back to the true shore.
    const water = styleLayers.find((l) => l.id === "water");
    if (water && onlineRef.current) {
      map.addLayer({ ...water, id: "water-over-tint" } as never, beforeId);
    }

    let hovered: string | null = null;
    map.on("click", "country-hit", (e) => {
      const props = e.features?.[0]?.properties as { cid: string; name: string } | undefined;
      if (!props) return;
      zoomRef.current(props.cid);
      cb.current.onCountryClick?.(props.cid, props.name);
    });
    map.on("mousemove", "country-hit", (e) => {
      map.getCanvas().style.cursor = "pointer";
      const props = e.features?.[0]?.properties as { cid: string; name: string } | undefined;
      if (props && props.cid !== hovered) {
        hovered = props.cid;
        cb.current.onHoverCountry?.(props.cid, props.name);
      }
    });
    map.on("mouseleave", "country-hit", () => {
      map.getCanvas().style.cursor = "";
      hovered = null;
      cb.current.onHoverCountry?.(null, null);
    });
  }, [ready, countryData]);

  // Slow idle spin so it reads as a globe; any touch/scroll hands control to the user.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last = performance.now();
    const stop = () => {
      spinningRef.current = false;
      cancelAnimationFrame(raf);
    };
    const tick = (now: number) => {
      if (!spinningRef.current) return;
      const dt = Math.min(now - last, 100); // don't jump after a hidden-tab gap
      last = now;
      const c = map.getCenter();
      map.setCenter([c.lng + (SPIN_DEG_PER_SEC * dt) / 1000, c.lat]);
      raf = requestAnimationFrame(tick);
    };
    if (spinningRef.current) raf = requestAnimationFrame(tick);
    map.on("mousedown", stop);
    map.on("touchstart", stop);
    map.on("wheel", stop);
    return () => {
      cancelAnimationFrame(raf);
      map.off("mousedown", stop);
      map.off("touchstart", stop);
      map.off("wheel", stop);
    };
  }, [ready]);

  // Pin markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const markers = pins.map((pin) => {
      const el = pinElement(pin.color, pin.tripId === activePinId);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        cb.current.onPinClick?.(pin.tripId);
      });
      return new Marker({ element: el, anchor: "bottom" })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [ready, pins, activePinId]);

  useImperativeHandle(
    ref,
    () => ({
      focusCountry: (code) => {
        spinningRef.current = false;
        zoomRef.current(code);
      },
      focusPoint(lat, lng, zoom = 11) {
        spinningRef.current = false;
        mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 800, essential: true });
      },
      reset() {
        spinningRef.current = false;
        mapRef.current?.flyTo({ center: WORLD_CENTER, zoom: WORLD_ZOOM, duration: 800, essential: true });
      },
    }),
    [],
  );

  return (
    <div className="relative h-80 w-full bg-gradient-to-b from-slate-900 to-indigo-950">
      <div ref={containerRef} className="h-full w-full" />
      {failed && (
        <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-gray-500">
          이 기기에서는 지도를 표시할 수 없어요. 브라우저를 최신 버전으로 업데이트해 주세요.
        </p>
      )}
    </div>
  );
});

export default WorldMap;
