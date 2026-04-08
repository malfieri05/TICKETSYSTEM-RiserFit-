'use client';

import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  ActiveMaintenanceTicketsListBody,
  type OpenMaintenanceTicketLine,
} from '@/components/ui/MaintenanceCountWithTooltip';
import { LocationLink } from '@/components/ui/LocationLink';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type { LatLngExpression, Marker as LeafletMarkerInstance } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getTicketDrawerWidthPx } from '@/lib/ticket-drawer-layout';
import { getDocumentZoom } from '@/lib/zoom';
type LocationForMap = {
  id: string;
  name: string;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Dispatch: open maintenance tickets for this studio (links in popup). */
  openTickets?: OpenMaintenanceTicketLine[];
};

interface LocationsMapProps {
  locations: LocationForMap[];
  onLocationClick?: (locationId: string) => void;
  /** When set, map flies to this marker and it renders larger. When cleared, map fits all markers. */
  selectedLocationId?: string | null;
  /** Dispatch: open ticket from map popup without leaving the page. */
  onViewTicket?: (ticketId: string) => void;
  /** When true (e.g. ticket drawer open), pans the selected pin into the left clear area of the map. */
  ticketDrawerOpen?: boolean;
  /** Highlights the matching row in the marker popup ticket list. */
  highlightedTicketId?: string | null;
  /** Merged onto the map container (default height/border are included; override e.g. `h-[480px] border-0`) */
  className?: string;
  /** Increment (e.g. from a “Default view” control) to fit all markers and undo manual pan/zoom. */
  resetCameraNonce?: number;
}

const MARKER_ICON_URL = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const MARKER_ICON_2X_URL = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
const MARKER_SHADOW_URL = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

/** Default Leaflet pin size */
const DEFAULT_MARKER_ICON = L.icon({
  iconUrl: MARKER_ICON_URL,
  iconRetinaUrl: MARKER_ICON_2X_URL,
  shadowUrl: MARKER_SHADOW_URL,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  shadowAnchor: [12, 41],
});

/** Visually larger pin for the selected location */
const SELECTED_MARKER_ICON = L.icon({
  iconUrl: MARKER_ICON_URL,
  iconRetinaUrl: MARKER_ICON_2X_URL,
  shadowUrl: MARKER_SHADOW_URL,
  iconSize: [34, 55],
  iconAnchor: [17, 55],
  popupAnchor: [1, -48],
  shadowSize: [55, 55],
  shadowAnchor: [17, 55],
});

let leafletIconsConfigured = false;

/** Mean Earth radius in statute miles (WGS84 approximation). */
const EARTH_RADIUS_MI = 3958.7613;

/** Draw connector lines between pins no farther than this (miles). */
const PROXIMITY_LINE_MAX_MILES = 50;

/** Hide proximity lines until the map is this zoomed in (continental overview is usually below this). */
const PROXIMITY_MIN_ZOOM = 10;

function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(a)));
}

function ensureLeafletIconsConfigured() {
  if (leafletIconsConfigured) return;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: MARKER_ICON_2X_URL,
    iconUrl: MARKER_ICON_URL,
    shadowUrl: MARKER_SHADOW_URL,
  });
  leafletIconsConfigured = true;
}

/** Fit all markers when nothing is selected; fly to the selected marker when `selectedLocationId` is set. */
function MapCameraController({
  selectedLocationId,
  validLocations,
  positions,
}: {
  selectedLocationId?: string | null;
  validLocations: LocationForMap[];
  positions: LatLngExpression[];
}) {
  const map = useMap();
  const positionsKeyRef = useRef<string>('');
  const prevSelectedRef = useRef<string | null | undefined>(undefined);

  const positionsKey = useMemo(
    () =>
      positions
        .map((p) => `${Array.isArray(p) ? p.join(',') : String(p)}`)
        .sort()
        .join('|'),
    [positions],
  );

  useEffect(() => {
    if (!positions.length) return;

    const prevSelected = prevSelectedRef.current;
    prevSelectedRef.current = selectedLocationId ?? null;

    if (selectedLocationId) {
      const loc = validLocations.find((l) => l.id === selectedLocationId);
      if (
        loc &&
        typeof loc.latitude === 'number' &&
        typeof loc.longitude === 'number' &&
        !Number.isNaN(loc.latitude) &&
        !Number.isNaN(loc.longitude)
      ) {
        map.flyTo([loc.latitude, loc.longitude], 12, { duration: 0.5 });
      }
      return;
    }

    const selectionCleared =
      prevSelected != null && prevSelected !== '' && !selectedLocationId;
    const positionsChanged = positionsKeyRef.current !== positionsKey;
    if (selectionCleared || positionsChanged) {
      positionsKeyRef.current = positionsKey;
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [map, selectedLocationId, validLocations, positions, positionsKey]);

  return null;
}

/** Fits all markers when `resetCameraNonce` increases (skips the initial mount value). */
function MapFitBoundsOnDemand({
  resetCameraNonce,
  positions,
}: {
  resetCameraNonce: number;
  positions: LatLngExpression[];
}) {
  const map = useMap();
  const seenNonceRef = useRef<number | null>(null);

  useEffect(() => {
    if (seenNonceRef.current === null) {
      seenNonceRef.current = resetCameraNonce;
      return;
    }
    if (seenNonceRef.current === resetCameraNonce) return;
    seenNonceRef.current = resetCameraNonce;
    if (!positions.length) return;
    map.invalidateSize();
    map.fitBounds(L.latLngBounds(positions), { padding: [40, 40] });
  }, [map, resetCameraNonce, positions]);

  return null;
}

/**
 * Pans so the selected pin sits at the **center** of the map area still visible left of the ticket
 * drawer (matches Vendor Dispatch “View ticket” reference: pin + popup centered in that band).
 * Uses `panTo` + container deltas. Visible width clips to the drawer edge in screen space.
 */
function alignSelectedPinForTicketDrawer(map: L.Map, latlng: L.LatLng) {
  if (typeof window === 'undefined') return;
  map.invalidateSize();
  const zoom = getDocumentZoom();
  const drawerW = getTicketDrawerWidthPx(); // zoomed CSS px
  const viewportWZoomed = window.innerWidth / zoom; // convert viewport px → zoomed CSS px
  const drawerLeftZoomed = viewportWZoomed - drawerW;
  const mapEl = map.getContainer();
  const r = mapEl.getBoundingClientRect();
  const rLeftZoomed = r.left / zoom; // convert viewport px → zoomed CSS px
  const w = map.getSize().x; // already zoomed CSS px (uses clientWidth internally)
  /** Map-local width not covered by the drawer overlay. */
  const visibleRightLocal = Math.min(w, Math.max(0, drawerLeftZoomed - rLeftZoomed));
  const visibleW = Math.max(96, visibleRightLocal);
  /** Horizontal center of the visible band (pin tip + popup read centered in remaining map). */
  const targetX = visibleW / 2;
  const h = map.getSize().y;
  /** Slightly below vertical center so the popup above the pin stays inside the map (not clipped at top). */
  const targetY = h * 0.58;
  const pt = map.latLngToContainerPoint(latlng);
  /** Inverted vs (target − pt): flips pan direction if centering landed on the wrong side. */
  const delta = L.point(pt.x - targetX, pt.y - targetY);
  if (Math.abs(delta.x) < 3 && Math.abs(delta.y) < 3) return;
  const centerPt = map.latLngToContainerPoint(map.getCenter());
  const newCenter = map.containerPointToLatLng(centerPt.add(delta));
  map.panTo(newCenter, { animate: true, duration: 0.4 });
}

function MapDrawerAlignController({
  ticketDrawerOpen,
  selectedLocationId,
  validLocations,
  highlightedTicketId,
}: {
  ticketDrawerOpen: boolean;
  selectedLocationId: string | null | undefined;
  validLocations: LocationForMap[];
  /** When this changes (another “View ticket”), re-run centering for the same studio. */
  highlightedTicketId?: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!ticketDrawerOpen || !selectedLocationId) return;
    const loc = validLocations.find((l) => l.id === selectedLocationId);
    if (
      !loc ||
      typeof loc.latitude !== 'number' ||
      typeof loc.longitude !== 'number' ||
      Number.isNaN(loc.latitude) ||
      Number.isNaN(loc.longitude)
    ) {
      return;
    }
    const latlng = L.latLng(loc.latitude, loc.longitude);
    /** Drawer slide + `flyTo` (~500ms) + layout; single delayed align avoids racing `panBy`/`flyTo`. */
    const t = window.setTimeout(() => {
      requestAnimationFrame(() => {
        alignSelectedPinForTicketDrawer(map, latlng);
      });
    }, 720);
    return () => window.clearTimeout(t);
  }, [map, ticketDrawerOpen, selectedLocationId, validLocations, highlightedTicketId]);

  return null;
}

type ProximityEdge = {
  key: string;
  positions: LatLngExpression[];
  miles: number;
};

/** Proximity lines only after a location is selected and the map is zoomed in; edges must touch the selection. */
function ProximityConnectorLayer({
  edges,
  selectedLocationId,
}: {
  edges: ProximityEdge[];
  selectedLocationId: string | null | undefined;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  const onZoomChange = useCallback(() => {
    setZoom(map.getZoom());
  }, [map]);

  useMapEvents({
    zoomend: onZoomChange,
  });

  useEffect(() => {
    setZoom(map.getZoom());
  }, [map, selectedLocationId]);

  const show =
    Boolean(selectedLocationId) && zoom >= PROXIMITY_MIN_ZOOM;

  return (
    <>
      {(show ? edges : []).map((edge) => (
        <Polyline
          key={edge.key}
          positions={edge.positions}
          pathOptions={{
            color: '#2563eb',
            weight: 2,
            opacity: 0.72,
            dashArray: '2 10',
            lineCap: 'round',
            lineJoin: 'round',
          }}
        >
          <Tooltip
            permanent
            direction="center"
            className="!m-0 !border-0 !bg-transparent !p-0 !shadow-none"
            opacity={1}
          >
            <span
              className="whitespace-nowrap text-[15px] font-semibold leading-none text-[var(--color-text-primary)]"
              style={{
                textShadow:
                  '0 0 4px var(--color-bg-surface), 0 0 8px var(--color-bg-surface), 0 1px 2px rgba(0,0,0,0.25)',
              }}
            >
              {edge.miles < 10 ? edge.miles.toFixed(1) : Math.round(edge.miles)} mi
            </span>
          </Tooltip>
        </Polyline>
      ))}
    </>
  );
}

function StudioMapMarker({
  loc,
  isSelected,
  onLocationClick,
  onViewTicket,
  highlightedTicketId,
}: {
  loc: LocationForMap;
  isSelected: boolean;
  onLocationClick?: (locationId: string) => void;
  onViewTicket?: (ticketId: string) => void;
  highlightedTicketId?: string | null;
}) {
  const markerRef = useRef<LeafletMarkerInstance | null>(null);

  useEffect(() => {
    const m = markerRef.current;
    if (!m) return;
    if (isSelected) {
      const open = () => m.openPopup();
      const t = window.setTimeout(open, 520);
      return () => window.clearTimeout(t);
    }
    m.closePopup();
  }, [isSelected]);

  return (
    <Marker
      ref={markerRef}
      position={[loc.latitude as number, loc.longitude as number]}
      icon={isSelected ? SELECTED_MARKER_ICON : DEFAULT_MARKER_ICON}
      eventHandlers={{
        click: () => {
          onLocationClick?.(loc.id);
        },
      }}
    >
      <Popup maxWidth={320}>
        <LocationLink
          studioId={loc.id}
          studioName={loc.name}
          className="text-sm font-medium"
        />
        {loc.formattedAddress && (
          <div className="text-xs mt-1 text-[var(--color-text-muted)]">{loc.formattedAddress}</div>
        )}
        {loc.openTickets != null && loc.openTickets.length > 0 && (
          <div
            className="mt-2 max-h-44 overflow-y-auto border-t pt-2 text-left [scrollbar-width:thin]"
            style={{ borderColor: 'var(--color-border-default)' }}
          >
            <ActiveMaintenanceTicketsListBody
              count={loc.openTickets.length}
              ticketsWithLinks={loc.openTickets}
              onViewTicket={onViewTicket}
              highlightedTicketId={highlightedTicketId}
            />
          </div>
        )}
      </Popup>
    </Marker>
  );
}

export function LocationsMap({
  locations,
  onLocationClick,
  className = '',
  selectedLocationId = null,
  onViewTicket,
  ticketDrawerOpen = false,
  highlightedTicketId = null,
  resetCameraNonce = 0,
}: LocationsMapProps) {
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

  const positions = useMemo(
    (): LatLngExpression[] =>
      validLocations.map((loc) => [loc.latitude as number, loc.longitude as number]),
    [validLocations],
  );

  const proximityEdges = useMemo((): ProximityEdge[] => {
    const edges: ProximityEdge[] = [];
    const pts = validLocations;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const p1 = pts[i];
        const p2 = pts[j];
        const lat1 = p1.latitude as number;
        const lon1 = p1.longitude as number;
        const lat2 = p2.latitude as number;
        const lon2 = p2.longitude as number;
        const miles = haversineMiles(lat1, lon1, lat2, lon2);
        if (miles > 0.01 && miles <= PROXIMITY_LINE_MAX_MILES) {
          const [a, b] = [p1.id, p2.id].sort();
          edges.push({
            key: `${a}__${b}`,
            positions: [
              [lat1, lon1],
              [lat2, lon2],
            ],
            miles,
          });
        }
      }
    }
    return edges;
  }, [validLocations]);

  const hasMarkers = positions.length > 0;
  const defaultCenter: LatLngExpression = hasMarkers
    ? positions[0]
    : [37.5, -95]; // continental US fallback

  if (!hasMarkers) {
    return (
      <div
        className={cn(
          'rounded-lg border flex items-center justify-center h-[620px] w-full',
          className,
        )}
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
      className={cn(
        'relative z-0 isolate rounded-lg border overflow-hidden w-full h-[620px]',
        className,
      )}
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
        <MapCameraController
          selectedLocationId={selectedLocationId}
          validLocations={validLocations}
          positions={positions}
        />
        <MapFitBoundsOnDemand resetCameraNonce={resetCameraNonce} positions={positions} />
        <MapDrawerAlignController
          ticketDrawerOpen={ticketDrawerOpen}
          selectedLocationId={selectedLocationId}
          validLocations={validLocations}
          highlightedTicketId={highlightedTicketId}
        />
        <ProximityConnectorLayer
          edges={proximityEdges}
          selectedLocationId={selectedLocationId}
        />
        {validLocations.map((loc) => (
          <StudioMapMarker
            key={loc.id}
            loc={loc}
            isSelected={loc.id === selectedLocationId}
            onLocationClick={onLocationClick}
            onViewTicket={onViewTicket}
            highlightedTicketId={highlightedTicketId}
          />
        ))}
      </MapContainer>
    </div>
  );
}

