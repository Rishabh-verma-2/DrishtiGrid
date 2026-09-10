import React from 'react';
import { Polygon, Circle, Popup, Tooltip } from 'react-leaflet';
import { Compass, Users, Car, ShieldAlert, Clock } from 'lucide-react';

const ZONE_COLORS = {
  EVENT: { color: '#8b5cf6', fill: '#8b5cf6', label: 'Event Zone' },
  VIP: { color: '#f59e0b', fill: '#f59e0b', label: 'VIP Corridor' },
  RESTRICTED: { color: '#ef4444', fill: '#ef4444', label: 'Restricted Area' },
  EMERGENCY: { color: '#f43f5e', fill: '#f43f5e', label: 'Emergency Zone' },
  SURVEILLANCE: { color: '#06b6d4', fill: '#06b6d4', label: 'Surveillance Zone' },
  OPERATIONAL: { color: '#3b82f6', fill: '#3b82f6', label: 'Operational Zone' },
};

export default function OperationalZonesLayer({
  zones = [],
  onSelectZone,
  onManageZone,
  visible = true,
  isLight = false,
}) {
  if (!visible || !zones || zones.length === 0) return null;

  return (
    <>
      {zones.map((zone) => {
        const typeCfg = ZONE_COLORS[zone.type] || ZONE_COLORS.OPERATIONAL;
        const isPolygon = zone.geometry?.type === 'Polygon';
        const isPoint = zone.geometry?.type === 'Point';

        const pathOptions = {
          color: typeCfg.color,
          fillColor: typeCfg.fill,
          fillOpacity: isLight ? 0.16 : 0.22,
          weight: 2,
          dashArray: zone.type === 'VIP' ? '6, 6' : zone.type === 'RESTRICTED' ? '4, 4' : null,
        };

        const popupContent = (
          <div className="text-xs space-y-2 p-1 font-sans min-w-[220px]">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded uppercase" style={{ backgroundColor: `${typeCfg.color}20`, color: typeCfg.color }}>
                {typeCfg.label}
              </span>
              <span className="font-mono text-[10px] uppercase font-bold text-slate-400">
                {zone.severity}
              </span>
            </div>

            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{zone.name}</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">{zone.description || `${zone.district} Jurisdiction`}</p>
            </div>

            <div className="space-y-1 text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800/60">
              <div className="flex justify-between">
                <span className="text-slate-500">Crowd Threshold:</span>
                <span className="font-mono font-bold text-amber-500">{zone.rules?.crowdThreshold || 100}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Speed Limit:</span>
                <span className="font-mono font-bold text-cyan-500">{zone.rules?.speedLimitKmh || 50} km/h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Active Schedule:</span>
                <span className="font-mono text-[10px]">
                  {zone.schedule?.isAlwaysActive ? '24/7 Continuous' : `${zone.schedule?.startTime || '18:00'} - ${zone.schedule?.endTime || '01:00'}`}
                </span>
              </div>
            </div>

            {onManageZone && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onManageZone(zone);
                }}
                className="mt-2 w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition-all cursor-pointer text-center"
              >
                ⚙️ Manage Geofence Rules
              </button>
            )}
          </div>
        );

        if (isPolygon && Array.isArray(zone.geometry?.coordinates?.[0])) {
          // Polygon coordinates are [lng, lat], Leaflet requires [lat, lng]
          const positions = zone.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]);

          return (
            <Polygon key={zone.zoneId || zone._id} positions={positions} pathOptions={pathOptions}>
              <Tooltip sticky direction="top" className="font-sans text-xs">
                <strong>{zone.name}</strong> ({typeCfg.label})
              </Tooltip>
              <Popup>{popupContent}</Popup>
            </Polygon>
          );
        }

        if (isPoint && Array.isArray(zone.geometry?.coordinates)) {
          const [lng, lat] = zone.geometry.coordinates;
          return (
            <Circle
              key={zone.zoneId || zone._id}
              center={[lat, lng]}
              radius={zone.radiusMeters || 500}
              pathOptions={pathOptions}
            >
              <Tooltip sticky direction="top">
                <strong>{zone.name}</strong> ({typeCfg.label})
              </Tooltip>
              <Popup>{popupContent}</Popup>
            </Circle>
          );
        }

        return null;
      })}
    </>
  );
}
