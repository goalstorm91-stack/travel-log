import { setWorkerUrl, type StyleSpecification } from "maplibre-gl";

// MapLibre finds its worker by file name next to the main module, which a
// bundler breaks. vite.config.ts serves the worker files untouched here.
setWorkerUrl(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`);

// OpenFreeMap serves free vector tiles with no API key. "positron" is a quiet
// grayscale basemap, so our colored country tints and pins stand out on it.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

// Labels: Korean name when the tile has one, then English, then the local script.
const KOREAN_LABEL = ["coalesce", ["get", "name:ko"], ["get", "name_en"], ["get", "name"]];

// Small palette tweaks so water/parks read as such instead of all-gray.
const PAINT_OVERRIDES: Record<string, Record<string, string>> = {
  background: { "background-color": "#f5f4ef" },
  water: { "fill-color": "#c9def0" },
  waterway: { "line-color": "#c9def0" },
  park: { "fill-color": "#e0ead9" },
  landcover_wood: { "fill-color": "#d8e4d1" },
  water_name_point_label: { "text-color": "#5b7aa6" },
  water_name_line_label: { "text-color": "#5b7aa6" },
};

export interface BaseStyle {
  style: StyleSpecification;
  /** false when the style could not be fetched and a blank fallback is used */
  online: boolean;
}

// Used when the style can't be fetched (offline): our own country polygons
// are drawn over this, so the map is still usable.
const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#dbe8f3" } }],
};

function customize(style: StyleSpecification): StyleSpecification {
  for (const layer of style.layers) {
    const raw = layer as unknown as {
      id: string;
      layout?: Record<string, unknown>;
      paint?: Record<string, unknown>;
    };
    const textField = raw.layout?.["text-field"];
    if (textField !== undefined && JSON.stringify(textField).includes("name")) {
      raw.layout!["text-field"] = KOREAN_LABEL;
    }
    const override = PAINT_OVERRIDES[raw.id];
    if (override) raw.paint = { ...raw.paint, ...override };
  }
  return style;
}

let cached: Promise<BaseStyle> | null = null;

export function loadBaseStyle(): Promise<BaseStyle> {
  return (cached ??= (async () => {
    try {
      const res = await fetch(STYLE_URL);
      if (!res.ok) throw new Error(`style ${res.status}`);
      return { style: customize((await res.json()) as StyleSpecification), online: true };
    } catch {
      cached = null; // retry next time the map mounts
      return { style: OFFLINE_STYLE, online: false };
    }
  })());
}
