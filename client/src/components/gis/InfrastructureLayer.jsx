import React, { useState } from 'react';
import { Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  Shield,
  Hospital,
  Flame,
  Building2,
  Phone,
  Radio,
  ExternalLink,
} from 'lucide-react';

const INFRA_CONFIG = {
  POLICE_STATION: {
    label: 'Police Station',
    iconChar: '🚓',
    color: '#3b82f6',
    border: '#2563eb',
    bg: 'rgba(59, 130, 246, 0.15)',
  },
  HOSPITAL: {
    label: 'Civil Hospital',
    iconChar: '🏥',
    color: '#f43f5e',
    border: '#e11d48',
    bg: 'rgba(244, 63, 94, 0.15)',
  },
  FIRE_STATION: {
    label: 'Fire Station',
    iconChar: '🔥',
    color: '#f59e0b',
    border: '#d97706',
    bg: 'rgba(245, 158, 11, 0.15)',
  },
  RAILWAY_STATION: {
    label: 'Railway Junction',
    iconChar: '🚉',
    color: '#8b5cf6',
    border: '#7c3aed',
    bg: 'rgba(139, 92, 246, 0.15)',
  },
  AIRPORT: {
    label: 'Airport Hub',
    iconChar: '✈️',
    color: '#06b6d4',
    border: '#0891b2',
    bg: 'rgba(6, 182, 212, 0.15)',
  },
  GOVERNMENT_OFFICE: {
    label: 'Secretariat / Office',
    iconChar: '🏛️',
    color: '#10b981',
    border: '#059669',
    bg: 'rgba(16, 185, 129, 0.15)',
  },
  BRIDGE: {
    label: 'Arterial Bridge',
    iconChar: '🌉',
    color: '#64748b',
    border: '#475569',
    bg: 'rgba(100, 116, 139, 0.15)',
  },
  CRITICAL_INFRASTRUCTURE: {
    label: 'Critical Infrastructure',
    iconChar: '⚠️',
    color: '#ef4444',
    border: '#dc2626',
    bg: 'rgba(239, 68, 68, 0.15)',
  },
};

function createInfraIcon(asset) {
  const cfg = INFRA_CONFIG[asset.type] || INFRA_CONFIG.CRITICAL_INFRASTRUCTURE;

  return L.divIcon({
    className: 'custom-infra-marker',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        border-radius: 10px;
        background: ${cfg.color};
        border: 2px solid #ffffff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        cursor: pointer;
      ">
        <span>${cfg.iconChar}</span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

export default function InfrastructureLayer({
  assets = [],
  onSelectAsset,
  onFindNearbyCameras,
  isLight = false,
  minZoom = 13,
}) {
  const map = useMap();
  const [currentZoom, setCurrentZoom] = useState(map.getZoom());

  useMapEvents({
    zoomend: () => {
      setCurrentZoom(map.getZoom());
    },
  });

  if (!assets || assets.length === 0 || currentZoom < minZoom) return null;

  return (
    <>
      {assets.map((asset) => {
        const lat = asset.latitude || asset.location?.coordinates?.[1];
        const lng = asset.longitude || asset.location?.coordinates?.[0];
        if (!lat || !lng) return null;

        const cfg = INFRA_CONFIG[asset.type] || INFRA_CONFIG.CRITICAL_INFRASTRUCTURE;
        const icon = createInfraIcon(asset);

        return (
          <Marker
            key={asset.assetId || asset._id}
            position={[lat, lng]}
            icon={icon}
            eventHandlers={{
              click: () => {
                if (onSelectAsset) onSelectAsset(asset);
              },
            }}
          >
            <Tooltip sticky direction="top" className="font-sans text-xs">
              <strong>{asset.name}</strong> ({cfg.label})
            </Tooltip>
            <Popup className="cctv-cyber-popup">
              <div className="p-2 space-y-2 text-xs min-w-[240px] font-sans">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
                  <span
                    className="font-mono text-[10px] font-bold px-2 py-0.5 rounded uppercase"
                    style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}
                  >
                    {cfg.label}
                  </span>
                  <span className="font-mono text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {asset.operatingStatus || 'ACTIVE'}
                  </span>
                </div>

                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{asset.name}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">{asset.address?.full || `${asset.district}, Gujarat`}</p>
                </div>

                {asset.emergencyContact?.phone && (
                  <div className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 space-y-1 text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-semibold">
                      <Phone className="w-3 h-3 text-emerald-500" />
                      <span>{asset.emergencyContact.phone}</span>
                    </div>
                    {asset.emergencyContact.nodalOfficer && (
                      <div className="text-[10px] text-slate-400">
                        Nodal: {asset.emergencyContact.nodalOfficer}
                      </div>
                    )}
                  </div>
                )}

                {onFindNearbyCameras && (
                  <button
                    type="button"
                    onClick={() => onFindNearbyCameras([lat, lng], asset.name)}
                    className="w-full py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Radio className="w-3 h-3" />
                    Find Surrounding Cameras
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
