import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { geoBounds } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import worldData from "../data/countries-110m.json";
import { colorForCountry } from "../utils/colors";

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

const WORLD_CENTER: [number, number] = [20, 10];
const WORLD_ZOOM = 2;

function pinDivIcon(color: string, active: boolean): L.DivIcon {
  const size = active ? 34 : 26;
  return L.divIcon({
    className: "",
    html: `
      <svg width="${size}" height="${size}" viewBox="-8 -12 16 22" style="filter: drop-shadow(0 1.5px 2px rgba(15,23,42,0.4))">
        <path d="M0 10 C0 10 6.5 5 6.5 0 C6.5 -3.6 3.6 -6.5 0 -6.5 C-3.6 -6.5 -6.5 -3.6 -6.5 0 C-6.5 5 0 10 0 10 Z" fill="${color}" stroke="#fff" stroke-width="1.4"/>
        <circle cx="0" cy="0" r="2.3" fill="#fff"/>
      </svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
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
  const mapRef = useRef<L.Map | null>(null);
  const countryLayerRef = useRef<L.GeoJSON | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  const countries = useMemo(() => {
    const collection = feature(
      worldData as never,
      // @ts-expect-error topojson object key not in generic Objects type
      worldData.objects.countries,
    ) as unknown as FeatureCollection<Geometry, { name: string }>;
    return collection.features as unknown as CountryFeature[];
  }, []);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: WORLD_CENTER,
      zoom: WORLD_ZOOM,
      minZoom: 2,
      maxZoom: 16,
      worldCopyJump: true,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      // React 18 StrictMode runs this effect twice in dev; Leaflet leaves an
      // internal marker on the container after remove() that breaks the next
      // init (animations silently no-op) unless it's cleared here.
      if (containerRef.current) {
        delete (containerRef.current as unknown as { _leaflet_id?: number })._leaflet_id;
      }
      mapRef.current = null;
    };
  }, []);

  // Country tint overlay, redrawn when visited set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    countryLayerRef.current?.remove();
    const layer = L.geoJSON(
      { type: "FeatureCollection", features: countries } as never,
      {
        style: (feat) => {
          const id = (feat as unknown as CountryFeature).id;
          const visited = visitedCodes.has(id);
          return {
            fillColor: visited ? colorForCountry(id) : "#000000",
            fillOpacity: visited ? 0.4 : 0,
            color: visited ? "#ffffff" : "transparent",
            weight: visited ? 1 : 0,
          };
        },
        onEachFeature: (feat, geoLayer) => {
          const cf = feat as unknown as CountryFeature;
          geoLayer.on({
            mouseover: () => onHoverCountry?.(cf.id, cf.properties.name),
            mouseout: () => onHoverCountry?.(null, null),
            click: () => {
              zoomToCountry(cf.id);
              onCountryClick?.(cf.id, cf.properties.name);
            },
          });
        },
      },
    );
    layer.addTo(map);
    countryLayerRef.current = layer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries, visitedCodes]);

  // Pin markers, redrawn when pins/activePinId change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of markersRef.current.values()) marker.remove();
    markersRef.current.clear();

    for (const pin of pins) {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: pinDivIcon(pin.color, pin.tripId === activePinId),
      });
      marker.on("click", () => onPinClick?.(pin.tripId));
      marker.addTo(map);
      markersRef.current.set(pin.tripId, marker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, activePinId]);

  function zoomToCountry(countryCode: string) {
    const map = mapRef.current;
    const feat = countries.find((c) => c.id === countryCode);
    if (!map || !feat) return;
    const [[minLng, minLat], [maxLng, maxLat]] = geoBounds(feat as never);
    map.flyToBounds(
      [
        [minLat, minLng],
        [maxLat, maxLng],
      ],
      { duration: 0.8, maxZoom: 8, padding: [20, 20] },
    );
  }

  useImperativeHandle(
    ref,
    () => ({
      focusCountry: zoomToCountry,
      focusPoint(lat, lng, zoom = 12) {
        mapRef.current?.flyTo([lat, lng], zoom, { duration: 0.8 });
      },
      reset() {
        mapRef.current?.flyTo(WORLD_CENTER, WORLD_ZOOM, { duration: 0.8 });
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [countries],
  );

  return <div ref={containerRef} className="h-72 w-full" />;
});

export default WorldMap;
