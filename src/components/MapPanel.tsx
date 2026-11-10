"use client";

import { useEffect } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { Employee, Place } from "@/lib/types";
import "leaflet/dist/leaflet.css";

const officeIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:3px;background:#1f4b3a;border:2px solid #f3efe6"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function personIcon(active: boolean) {
  return new L.DivIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${active ? "#c4a35a" : "#8a8578"};border:2px solid #1a1a1a;box-shadow:0 0 0 2px rgba(243,239,230,.8)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function FitBounds({ employees, places }: { employees: Employee[]; places: Place[] }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    for (const e of employees) {
      if (e.last_lat != null && e.last_lon != null) pts.push([e.last_lat, e.last_lon]);
    }
    for (const p of places.filter((x) => x.status === "approved")) {
      pts.push([p.lat, p.lon]);
    }
    if (pts.length) {
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
    }
  }, [employees, places, map]);
  return null;
}

export default function MapPanel({
  employees,
  places,
}: {
  employees: Employee[];
  places: Place[];
}) {
  const center: [number, number] = [43.25, 76.93];

  return (
    <MapContainer
      center={center}
      zoom={13}
      className="h-full w-full rounded-none"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> · карта демо (2ГИС MapGL — по ключу)'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds employees={employees} places={places} />
      {places
        .filter((p) => p.status === "approved")
        .map((p) => (
          <Circle
            key={p.id}
            center={[p.lat, p.lon]}
            radius={p.radius_m}
            pathOptions={{
              color: p.type === "office" ? "#1f4b3a" : "#c4a35a",
              fillColor: p.type === "office" ? "#1f4b3a" : "#c4a35a",
              fillOpacity: 0.12,
              weight: 1,
            }}
          >
            <Popup>
              <strong>{p.name}</strong>
              <br />
              {p.address}
              <br />
              радиус {p.radius_m} м
            </Popup>
          </Circle>
        ))}
      {places
        .filter((p) => p.type === "office")
        .map((p) => (
          <Marker key={`m-${p.id}`} position={[p.lat, p.lon]} icon={officeIcon}>
            <Popup>{p.name}</Popup>
          </Marker>
        ))}
      {employees
        .filter((e) => e.last_lat != null && e.last_lon != null)
        .map((e) => (
          <Marker
            key={e.id}
            position={[e.last_lat!, e.last_lon!]}
            icon={personIcon(e.collection_enabled)}
          >
            <Popup>
              <strong>{e.name}</strong>
              <br />
              {e.last_status}
              <br />
              {e.last_seen_at
                ? new Date(e.last_seen_at).toLocaleString("ru-RU", {
                    timeZone: "Asia/Qyzylorda",
                  })
                : "нет сигнала"}
            </Popup>
          </Marker>
        ))}
    </MapContainer>
  );
}
