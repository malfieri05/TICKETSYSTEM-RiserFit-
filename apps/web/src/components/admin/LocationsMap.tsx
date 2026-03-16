'use client';

import React, { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MaintenanceCountWithTooltip } from '@/components/ui/MaintenanceCountWithTooltip';

type LocationForMap = {
  id: string;
  name: string;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  activeMaintenanceCount?: number;
  activeMaintenanceCategoryNames?: string[];
};

interface LocationsMapProps {
  locations: LocationForMap[];
  onLocationClick?: (locationId: string) => void;
}

let leafletIconsConfigured = false;

function ensureLeafletIconsConfigured() {
  if (leafletIconsConfigured) return;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
  leafletIconsConfigured = true;
}

function FitBounds({ positions }: { positions: LatLngExpression[] }) {
  const map = useMap();

  useEffect(() => {
    if (!positions.length) return;
    const bounds = L.latLngBounds(positions);
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, positions]);

  return null;
}

export function LocationsMap({ locations, onLocationClick }: LocationsMapProps) {
  useEffect(() => {
    ensureLeafletIconsConfigured();
  }, []);
  const validLocations = useMemo(
    () =>
      locations.filter((loc) => {
        const hasCoords =
          typeof loc.latitude === 'number' &&
          typeof loc.longitude === 'number' &&
          loc.latitude != null &&
          loc.longitude != null;
        if (!hasCoords && process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.warn(
            '[LocationsMap] Skipping location without coordinates:',
            loc.name,
          );
        }
        return hasCoords;
      }),
    [locations],
  );

  const positions: LatLngExpression[] = validLocations.map(
    (loc) => [loc.latitude as number, loc.longitude as number],
  );

  const hasMarkers = positions.length > 0;
  const defaultCenter: LatLngExpression = hasMarkers
    ? positions[0]
    : [37.5, -95]; // continental US fallback

  if (!hasMarkers) {
    return (
      <div
        className="rounded-lg border flex items-center justify-center h-[620px]"
        style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-bg-surface)' }}
      >
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No locations with coordinates to display on the map.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border overflow-hidden w-full h-[620px]"
      style={{ borderColor: 'var(--color-border-default)' }}
    >
      <MapContainer
        center={defaultCenter}
        zoom={5}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds positions={positions} />
        {validLocations.map((loc) => (
          <Marker
            key={loc.id}
            position={[loc.latitude as number, loc.longitude as number]}
            eventHandlers={{
              click: () => {
                onLocationClick?.(loc.id);
              },
            }}
          >
            <Popup>
              <div className="text-sm font-medium">{loc.name} <MaintenanceCountWithTooltip count={loc.activeMaintenanceCount ?? 0} categoryNames={loc.activeMaintenanceCategoryNames ?? []} /></div>
              {loc.formattedAddress && (
                <div className="text-xs mt-1">{loc.formattedAddress}</div>
              )}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

