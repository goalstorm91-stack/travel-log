import { useMemo, useState } from "react";
import { geoPath, geoNaturalEarth1 } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import worldData from "../data/countries-110m.json";

const WIDTH = 480;
const HEIGHT = 260;

interface CountryFeature {
  type: "Feature";
  id: string;
  properties: { name: string };
  geometry: Geometry;
}

export default function WorldMap({
  visitedCodes,
  onHover,
}: {
  visitedCodes: Set<string>;
  onHover?: (id: string | null, name: string | null) => void;
}) {
  const [active, setActive] = useState<string | null>(null);

  const countries = useMemo(() => {
    const collection = feature(
      worldData as never,
      // @ts-expect-error topojson object key not in generic Objects type
      worldData.objects.countries,
    ) as unknown as FeatureCollection<Geometry, { name: string }>;
    return collection.features as unknown as CountryFeature[];
  }, []);

  const projection = useMemo(
    () => geoNaturalEarth1().fitSize([WIDTH, HEIGHT], {
      type: "FeatureCollection",
      features: countries,
    } as never),
    [countries],
  );
  const path = useMemo(() => geoPath(projection), [projection]);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      onMouseLeave={() => {
        setActive(null);
        onHover?.(null, null);
      }}
    >
      {countries.map((c) => {
        const visited = visitedCodes.has(c.id);
        const isActive = active === c.id;
        return (
          <path
            key={c.id ?? c.properties.name}
            d={path(c as never) ?? undefined}
            fill={visited ? "#6366f1" : "#e5e7eb"}
            stroke="#fff"
            strokeWidth={0.5}
            opacity={isActive ? 0.8 : 1}
            onMouseEnter={() => {
              setActive(c.id);
              onHover?.(c.id, c.properties.name);
            }}
          />
        );
      })}
    </svg>
  );
}
