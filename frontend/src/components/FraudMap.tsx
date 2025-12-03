import React, { useMemo, useState, useEffect } from "react";
import { useFraudAlerts } from "../contexts/FraudAlertsContext";
import { useModelSelector } from "../contexts/ModelSelectorContext";

// US State coordinates (centroids for major states)
const US_STATE_COORDS: Record<string, [number, number]> = {
  AL: [-86.7911, 32.8067], AK: [-152.4044, 61.3707], AZ: [-111.4312, 33.7298],
  AR: [-92.3731, 34.9697], CA: [-119.4179, 36.1162], CO: [-105.3111, 39.0598],
  CT: [-72.7273, 41.5978], DE: [-75.5277, 39.3185], FL: [-81.6868, 27.7663],
  GA: [-83.1132, 33.0406], HI: [-157.4983, 21.0943], ID: [-114.4788, 44.2405],
  IL: [-89.3985, 40.3495], IN: [-86.1477, 39.8494], IA: [-93.2105, 42.0115],
  KS: [-98.4842, 38.5266], KY: [-84.6701, 37.6681], LA: [-91.8749, 31.1695],
  ME: [-69.3819, 44.3235], MD: [-76.8021, 39.0639], MA: [-71.5301, 42.2302],
  MI: [-84.5467, 43.3266], MN: [-94.6859, 46.7296], MS: [-89.6678, 32.7416],
  MO: [-92.1893, 38.4561], MT: [-110.3626, 46.9219], NE: [-98.2681, 41.1254],
  NV: [-117.0554, 38.3135], NH: [-71.5653, 43.4525], NJ: [-74.5210, 40.2989],
  NM: [-106.2485, 34.8405], NY: [-74.9481, 42.1657], NC: [-79.3877, 35.6301],
  ND: [-99.7840, 47.5289], OH: [-82.7649, 40.3888], OK: [-97.5349, 35.5653],
  OR: [-122.0709, 43.8041], PA: [-77.2098, 40.5908], RI: [-71.5118, 41.6809],
  SC: [-80.9450, 33.8569], SD: [-99.9018, 44.2998], TN: [-86.7844, 35.7478],
  TX: [-99.9018, 31.0545], UT: [-111.8926, 40.1500], VT: [-72.7317, 44.0459],
  VA: [-78.1694, 37.7693], WA: [-121.4905, 47.4009], WV: [-80.9696, 38.4912],
  WI: [-89.6165, 44.2685], WY: [-107.3025, 41.1455], DC: [-77.0164, 38.9041],
};

type LocationFraudData = {
  location: string;
  coordinates: [number, number];
  fraudCount: number;
  totalAmount: number;
};

type FraudMapProps = { alerts: any[] };

export default function FraudMap({ alerts }: FraudMapProps) {
  //const { alerts } = useFraudAlerts();
  const { getPrediction, getModelInfo } = useModelSelector();
  const [selectedLocation, setSelectedLocation] = useState<LocationFraudData | null>(null);
  const [mapError, setMapError] = useState<Error | null>(null);
  const [MapComponents, setMapComponents] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Try to load the map library dynamically
  useEffect(() => {
    let cancelled = false;
    import("react-simple-maps")
      .then((module) => {
        if (!cancelled) {
          setMapComponents(module);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("react-simple-maps failed to load:", e);
          setMapError(e instanceof Error ? e : new Error(String(e)));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Aggregate fraud by state/location
  const locationData = useMemo(() => {
    const locationMap = new Map<string, { count: number; amount: number; coords?: [number, number]; city?: string }>();

    alerts.forEach((alert) => {
      const raw = alert.raw || {};
      const isFraud = getPrediction(raw) === 1;

      if (!isFraud) return;

      const state = String(raw.state || raw.State || "").trim().toUpperCase();
      const city = String(raw.city || raw.City || "").trim();
      const lat = raw.lat;
      const lon = raw.long;
      const amount = Number(raw.amt || raw.amount || alert.amount || 0);

      // Use state as primary identifier
      if (!state || state.length !== 2) return;

      const existing = locationMap.get(state) || { count: 0, amount: 0, coords: undefined, city: city || state };

      // Try to get coordinates from state lookup first, then from lat/lon
      let coords: [number, number] | undefined = existing.coords;
      if (!coords && US_STATE_COORDS[state]) {
        coords = US_STATE_COORDS[state];
      } else if (!coords && lat != null && lon != null && !isNaN(Number(lat)) && !isNaN(Number(lon))) {
        // Use average lat/lon if we have coordinates
        if (existing.coords) {
          // Average with existing
          const [exLon, exLat] = existing.coords;
          coords = [(exLon + Number(lon)) / 2, (exLat + Number(lat)) / 2];
        } else {
          coords = [Number(lon), Number(lat)];
        }
      }

      locationMap.set(state, {
        count: existing.count + 1,
        amount: existing.amount + amount,
        coords: coords || existing.coords,
        city: city || existing.city,
      });
    });

    // Convert to array and filter out locations without coordinates
    const result: LocationFraudData[] = [];
    locationMap.forEach((data, location) => {
      if (data.coords) {
        result.push({
          location: `${location}${data.city && data.city !== location ? ` (${data.city})` : ""}`,
          coordinates: data.coords,
          fraudCount: data.count,
          totalAmount: data.amount,
        });
      }
    });

    // Sort by fraud count descending
    return result.sort((a, b) => b.fraudCount - a.fraudCount);
  }, [alerts, getPrediction]);

  const maxFraudCount = Math.max(...locationData.map((d) => d.fraudCount), 1);
  const minFraudCount = Math.min(...locationData.map((d) => d.fraudCount), 1);

  // Calculate marker size (scaled between 8 and 40 pixels)
  // const getMarkerSize = (count: number) => {
  //   if (maxFraudCount === minFraudCount) return 20;
  //   const normalized = (count - minFraudCount) / (maxFraudCount - minFraudCount);
  //   return 8 + normalized * 32;
  // };

  const getMarkerSize = (count: number) => {
    const minSize = 4;
    const maxSize = 18;

    if (maxFraudCount === minFraudCount) return (minSize + maxSize) / 2;

    const normalized =
      (count - minFraudCount) / (maxFraudCount - minFraudCount);

    return minSize + normalized * (maxSize - minSize);
  };


  // Show loading state
  if (loading) {
    return (
      <div className="rounded-xl bg-white shadow-md border border-gray-200 p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900">🌍 Fraud by Location</h2>
          <p className="text-sm text-gray-600 mt-1">Loading map...</p>
        </div>
      </div>
    );
  }

  // If map library failed to load, show a simplified view
  if (mapError || !MapComponents) {
    return (
      <div className="rounded-xl bg-white shadow-md border border-gray-200 p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900">🌍 Fraud by Location</h2>
          <p className="text-sm text-gray-600 mt-1">
            Geographic distribution of fraud cases ({getModelInfo().fullName})
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-600 mb-2">Map visualization temporarily unavailable</p>
          {mapError && (
            <p className="text-xs text-gray-500 mb-4">
              Error: {mapError.message || "Map library failed to load"}
            </p>
          )}
          {locationData.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Top Fraud Locations</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {locationData.slice(0, 9).map((data) => (
                  <div
                    key={data.location}
                    className="flex items-center justify-between text-sm p-2 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors border border-gray-200"
                  >
                    <span className="font-medium text-gray-700">{data.location}</span>
                    <span className="text-red-600 font-semibold">{data.fraudCount} cases</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {locationData.length === 0 && (
            <p className="text-gray-500 text-sm">No fraud cases with location data yet.</p>
          )}
        </div>
      </div>
    );
  }

  // Render the actual map if library loaded successfully
  const { ComposableMap, Geographies, Geography, Marker } = MapComponents;
  //const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
  const geoUrl = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

  return (
    <div className="rounded-xl bg-white shadow-md border border-gray-200 p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900">🌍 Fraud by Location</h2>
        <p className="text-sm text-gray-600 mt-1">
          Geographic distribution of fraud cases ({getModelInfo().fullName}) • {locationData.length} locations with fraud
        </p>
      </div>

      <div className="relative w-full bg-gray-50 rounded-lg overflow-hidden" style={{ height: "500px" }}>
        <ComposableMap
          projection="geoAlbersUsa"
          projectionConfig={{ scale: 1100 }}
          style={{ width: "100%", height: "100%" }}
        >

          <Geographies geography={geoUrl}>
            {({ geographies }: any) =>
              geographies.map((geo: any) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#E5E7EB"
                  stroke="#D1D5DB"
                  style={{
                    default: { outline: "none" },
                    hover: { fill: "#F3F4F6", outline: "none" },
                    pressed: { fill: "#E5E7EB", outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {locationData.map((data, idx) => (
            <Marker
              key={`${data.location}-${idx}`}
              coordinates={data.coordinates}
              onClick={() => setSelectedLocation(data)}
            >
              <g style={{ cursor: "pointer" }}>
                <circle
                  r={getMarkerSize(data.fraudCount)}
                  fill="#EF4444"
                  fillOpacity={0.7}
                  stroke="#DC2626"
                  strokeWidth={2}
                />
                <text
                  textAnchor="middle"
                  y={-getMarkerSize(data.fraudCount) - 8}
                  style={{
                    fontFamily: "system-ui",
                    fill: "#DC2626",
                    fontSize: "11px",
                    fontWeight: "bold",
                    pointerEvents: "none",
                  }}
                >
                  {data.fraudCount}
                </text>
              </g>
            </Marker>
          ))}
        </ComposableMap>

        {/* Tooltip on hover/click */}
        {selectedLocation && (
          <div
            className="absolute top-4 left-4 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-10"
            style={{ maxWidth: "250px" }}
          >
            <div className="text-sm font-semibold text-gray-900 mb-2">{selectedLocation.location}</div>
            <div className="space-y-1 text-xs text-gray-600">
              <div>Fraud Cases: <span className="font-semibold text-red-600">{selectedLocation.fraudCount}</span></div>
              <div>Total Amount: <span className="font-semibold">${selectedLocation.totalAmount.toFixed(2)}</span></div>
            </div>
            <button
              onClick={() => setSelectedLocation(null)}
              className="mt-2 text-xs text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Fraud cases</span>
          </div>
          <div className="text-xs">
            Min: {minFraudCount} • Max: {maxFraudCount}
          </div>
        </div>
      </div>

      {/* Top locations list */}
      {locationData.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Top Fraud Locations</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {locationData.slice(0, 9).map((data) => (
              <div
                key={data.location}
                onClick={() => setSelectedLocation(data)}
                className="flex items-center justify-between text-sm p-2 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors border border-gray-200"
              >
                <span className="font-medium text-gray-700">{data.location}</span>
                <span className="text-red-600 font-semibold">{data.fraudCount} cases</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {locationData.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">
          No fraud cases with location data yet. Map will update as fraud cases are detected.
        </div>
      )}
    </div>
  );
}
