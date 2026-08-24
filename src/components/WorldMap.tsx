import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { geoPath, geoNaturalEarth1 } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import worldData from "../data/countries-110m.json";
import { colorForCountry } from "../utils/colors";

const WIDTH = 480;
const HEIGHT = 260;
const MAX_SCALE = 12;

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
  focusPoint: (lat: number, lng: number, scale?: number) => void;
  reset: () => void;
}

interface Focus {
  cx: number;
  cy: number;
  scale: number;
}

const WorldMap = forwardRef<
  WorldMapHandle,
  {
    visitedCodes: Set<string>;
    pins?: MapPin[];
    activePinId?: string | null;
    onHoverCountry?: (id: string | null, name: string | null) => void;
    onPinClick?: (tripId: string) => void;
  }
>(function WorldMap(
  { visitedCodes, pins = [], activePinId, onHoverCountry, onPinClick },
  ref,
) {
  const [activeCountry, setActiveCountry] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);

  const countries = useMemo(() => {
    const collection = feature(
      worldData as never,
      // @ts-expect-error topojson object key not in generic Objects type
      worldData.objects.countries,
    ) as unknown as FeatureCollection<Geometry, { name: string }>;
    return collection.features as unknown as CountryFeature[];
  }, []);

  const projection = useMemo(
    () =>
      geoNaturalEarth1().fitSize([WIDTH, HEIGHT], {
        type: "FeatureCollection",
        features: countries,
      } as never),
    [countries],
  );
  const path = useMemo(() => geoPath(projection), [projection]);

  useImperativeHandle(
    ref,
    () => ({
      focusCountry(countryCode) {
        const feat = countries.find((c) => c.id === countryCode);
        if (!feat) return;
        const [[x0, y0], [x1, y1]] = path.bounds(feat as never);
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const w = Math.max(x1 - x0, 1);
        const h = Math.max(y1 - y0, 1);
        const scale = Math.min(
          MAX_SCALE,
          Math.max(1.4, Math.min(WIDTH / w, HEIGHT / h) * 0.6),
        );
        setFocus({ cx, cy, scale });
      },
      focusPoint(lat, lng, scale = 6) {
        const projected = projection([lng, lat]);
        if (!projected) return;
        setFocus({ cx: projected[0], cy: projected[1], scale });
      },
      reset() {
        setFocus(null);
      },
    }),
    [countries, path, projection],
  );

  const scale = focus?.scale ?? 1;
  const transform = focus
    ? `translate(${WIDTH / 2 - focus.cx * focus.scale} ${HEIGHT / 2 - focus.cy * focus.scale}) scale(${focus.scale})`
    : "translate(0 0) scale(1)";

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      onMouseLeave={() => {
        setActiveCountry(null);
        onHoverCountry?.(null, null);
      }}
    >
      <g style={{ transition: "transform 0.6s cubic-bezier(0.22,1,0.36,1)" }} transform={transform}>
        {countries.map((c) => {
          const visited = visitedCodes.has(c.id);
          const isActive = activeCountry === c.id;
          return (
            <path
              key={c.id ?? c.properties.name}
              d={path(c as never) ?? undefined}
              fill={visited ? colorForCountry(c.id) : "#e5e7eb"}
              stroke="#fff"
              strokeWidth={0.5 / scale}
              opacity={isActive ? 0.8 : 1}
              onMouseEnter={() => {
                setActiveCountry(c.id);
                onHoverCountry?.(c.id, c.properties.name);
              }}
            />
          );
        })}
        {pins.map((pin) => {
          const projected = projection([pin.lng, pin.lat]);
          if (!projected) return null;
          const [x, y] = projected;
          const isActive = activePinId === pin.tripId;
          return (
            <g
              key={pin.tripId}
              transform={`translate(${x} ${y}) scale(${1 / scale})`}
              onClick={(e) => {
                e.stopPropagation();
                onPinClick?.(pin.tripId);
              }}
              className="cursor-pointer"
            >
              <PinIcon color={pin.color} active={isActive} />
            </g>
          );
        })}
      </g>
    </svg>
  );
});

export default WorldMap;

function PinIcon({ color, active }: { color: string; active: boolean }) {
  const scale = active ? 1.3 : 1;
  return (
    <g transform={`translate(0 -9) scale(${scale})`}>
      <path
        d="M0 9 C0 9 6 4.5 6 0 C6 -3.3 3.3 -6 0 -6 C-3.3 -6 -6 -3.3 -6 0 C-6 4.5 0 9 0 9 Z"
        fill={color}
        stroke="#fff"
        strokeWidth={1}
      />
      <circle cx={0} cy={0} r={2} fill="#fff" />
    </g>
  );
}
