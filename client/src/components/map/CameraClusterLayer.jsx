import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

const STATUS_CONFIG = {
  online: {
    label: 'Online',
    color: '#10b981',
    border: '#059669',
    bg: 'rgba(16, 185, 129, 0.15)',
    glow: 'rgba(16, 185, 129, 0.4)',
    badgeClass: 'status-online',
  },
  offline: {
    label: 'Offline',
    color: '#ef4444',
    border: '#dc2626',
    bg: 'rgba(239, 68, 68, 0.15)',
    glow: 'rgba(239, 68, 68, 0.4)',
    badgeClass: 'status-offline',
  },
  maintenance: {
    label: 'Maintenance',
    color: '#f59e0b',
    border: '#d97706',
    bg: 'rgba(245, 158, 11, 0.15)',
    glow: 'rgba(245, 158, 11, 0.4)',
    badgeClass: 'status-maintenance',
  },
  fault: {
    label: 'Fault',
    color: '#f87171',
    border: '#ef4444',
    bg: 'rgba(248, 113, 113, 0.15)',
    glow: 'rgba(248, 113, 113, 0.4)',
    badgeClass: 'status-fault',
  },
};

/**
 * Creates a custom marker icon for a single camera
 */
function createCameraIcon(cam, isSelected = false) {
  const statusKey = (cam.status || 'offline').toLowerCase();
  const cfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.offline;
  const typeLetter = (cam.type || cam.cameraType || 'F')[0].toUpperCase();
  const isPtz = (cam.type || cam.cameraType) === 'PTZ';

  return L.divIcon({
    className: 'custom-camera-marker-wrapper',
    html: `
      <div class="custom-camera-marker ${statusKey} ${isSelected ? 'selected' : ''}" style="--c-color: ${cfg.color}; --c-glow: ${cfg.glow};">
        <div class="marker-pulse-ring"></div>
        <div class="marker-bubble">
          <svg class="camera-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            ${
              isPtz
                ? '<circle cx="12" cy="12" r="7"></circle><path d="M12 9v6M9 12h6"></path><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path>'
                : '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle>'
            }
          </svg>
          <span class="type-pill">${typeLetter}</span>
        </div>
        <div class="marker-pointer"></div>
      </div>
    `,
    iconSize: [36, 44],
    iconAnchor: [18, 42],
    popupAnchor: [0, -42],
  });
}

/**
 * Builds rich metadata popup content
 */
function createPopupContent(cam) {
  const statusKey = (cam.status || 'offline').toLowerCase();
  const cfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.offline;
  const lat = cam.latitude || cam.location?.coordinates?.[1] || 0;
  const lng = cam.longitude || cam.location?.coordinates?.[0] || 0;
  const address = cam.address?.full || cam.address?.street || cam.address || 'Gujarat, India';
  const streamId = cam.streamId || `GJ-STREAM-${cam.cameraId}`;
  const model = cam.camera_model || cam.model || 'Commercial IP Surveillance';

  return `
    <div class="cctv-rich-popup-card" data-camera-id="${cam.cameraId}">
      <!-- Header -->
      <div class="cctv-popup-header">
        <div class="header-top-row">
          <span class="camera-id-chip">${cam.cameraId}</span>
          <span class="status-pill-badge ${cfg.badgeClass}">
            <span class="status-dot"></span>
            ${cfg.label}
          </span>
          ${cam.verified ? '<span class="verified-tag">✓ Verified</span>' : '<span class="simulated-tag">Simulated</span>'}
        </div>
        <h4 class="camera-title">${cam.name || cam.cameraName || 'CCTV Surveillance Camera'}</h4>
      </div>

      <!-- Main Metadata Grid -->
      <div class="cctv-popup-body">
        <!-- Location Section -->
        <div class="popup-section">
          <div class="section-title">
            <svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            Location & Placement
          </div>
          <div class="meta-row"><span class="label">Location Name</span><span class="val font-semibold">${cam.locationName || 'Main Corridor'}</span></div>
          <div class="meta-row"><span class="label">Landmark</span><span class="val">${cam.landmark || '—'}</span></div>
          <div class="meta-row"><span class="label">Road / Street</span><span class="val">${cam.roadName || '—'}</span></div>
          <div class="meta-row"><span class="label">Taluka & District</span><span class="val">${cam.taluka ? cam.taluka + ', ' : ''}${cam.district || 'Gujarat'}</span></div>
          <div class="meta-row"><span class="label">Pincode</span><span class="val font-mono">${cam.pincode || cam.address?.pincode || '—'}</span></div>
          <div class="meta-row"><span class="label">Full Address</span><span class="val text-address">${address}</span></div>
          <div class="meta-row"><span class="label">GIS Coords</span><span class="val font-mono text-cyan-400">${Number(lat).toFixed(5)}°N, ${Number(lng).toFixed(5)}°E</span></div>
        </div>

        <!-- Hardware & Stream Specs -->
        <div class="popup-section">
          <div class="section-title">
            <svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
            Feed & Camera Specifications
          </div>
          <div class="meta-grid-2">
            <div class="meta-box"><span class="box-label">Camera Type</span><span class="box-val">${cam.type || cam.cameraType || 'Fixed'}</span></div>
            <div class="meta-box"><span class="box-label">Model</span><span class="box-val text-truncate">${model}</span></div>
            <div class="meta-box"><span class="box-label">Stream Protocol</span><span class="box-val text-emerald-400 font-mono">${cam.streamType || 'RTSP'} (${cam.streamStatus || 'ACTIVE'})</span></div>
            <div class="meta-box"><span class="box-label">Stream ID</span><span class="box-val font-mono text-truncate">${streamId}</span></div>
            <div class="meta-box"><span class="box-label">Framerate</span><span class="box-val">${cam.fps || 25} FPS</span></div>
            <div class="meta-box"><span class="box-label">History Retain</span><span class="box-val">${cam.recording_history_days || 30} Days</span></div>
            <div class="meta-box"><span class="box-label">Field of View</span><span class="box-val">${cam.fieldOfView || 90}°</span></div>
            <div class="meta-box"><span class="box-label">Mount Height</span><span class="box-val">${cam.mountingHeight || 6} Meters</span></div>
          </div>
        </div>

        <!-- Administrative -->
        <div class="popup-section">
          <div class="section-title">
            <svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            Authority & Department
          </div>
          <div class="meta-row"><span class="label">Managing Dept</span><span class="val font-medium text-slate-200">${cam.departmentName || 'Gujarat Police Command'}</span></div>
          <div class="meta-row"><span class="label">Data Source</span><span class="val text-slate-400">${cam.dataSource || 'Integrated Gujarat Grid'}</span></div>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="cctv-popup-footer" style="display: flex; gap: 8px; align-items: center;">
        <button type="button" class="btn-popup-stream" onclick="window.dispatchEvent(new CustomEvent('cctv:open-stream', { detail: '${cam.cameraId}' }))" style="flex: 1;">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          Live Feed
        </button>
        <button type="button" class="btn-popup-requisition" onclick="window.dispatchEvent(new CustomEvent('cctv:request-footage', { detail: '${cam.cameraId}' }))" style="flex: 1; background: linear-gradient(135deg, #1d4ed8, #2563eb); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 7px 10px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 5px; cursor: pointer; box-shadow: 0 2px 8px rgba(37,99,235,0.35);">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          Request Footage
        </button>
      </div>
    </div>
  `;
}

export default function CameraClusterLayer({ cameras = [], onOpenStream, onRequestFootage }) {
  const map = useMap();
  const clusterGroupRef = useRef(null);
  const markersMapRef = useRef(new Map());

  // Listen for global button events emitted from popup HTML
  useEffect(() => {
    const handleStreamEvent = (e) => {
      const cameraId = e.detail;
      const cam = cameras.find((c) => c.cameraId === cameraId);
      if (cam && onOpenStream) {
        onOpenStream(cam);
      }
    };

    const handleRequisitionEvent = (e) => {
      const cameraId = e.detail;
      const cam = cameras.find((c) => c.cameraId === cameraId);
      if (cam && onRequestFootage) {
        onRequestFootage(cam);
      }
    };

    window.addEventListener('cctv:open-stream', handleStreamEvent);
    window.addEventListener('cctv:request-footage', handleRequisitionEvent);
    return () => {
      window.removeEventListener('cctv:open-stream', handleStreamEvent);
      window.removeEventListener('cctv:request-footage', handleRequisitionEvent);
    };
  }, [cameras, onOpenStream, onRequestFootage]);

  useEffect(() => {
    if (!map) return;
    const Leaflet = (typeof window !== 'undefined' && window.L) || L;
    const isClusterAvailable = typeof Leaflet.markerClusterGroup === 'function';

    let clusterGroup;
    if (isClusterAvailable) {
      clusterGroup = Leaflet.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        maxClusterRadius: 55,
        disableClusteringAtZoom: 17,
        iconCreateFunction: (cluster) => {
          const count = cluster.getChildCount();
          let sizeClass = 'small';
          let size = 44;

          if (count > 50) {
            sizeClass = 'large';
            size = 58;
          } else if (count > 15) {
            sizeClass = 'medium';
            size = 50;
          }

          return Leaflet.divIcon({
            html: `
              <div class="cctv-cluster-node cluster-${sizeClass}">
                <div class="cluster-radar-halo"></div>
                <div class="cluster-core">
                  <span class="cluster-number">${count}</span>
                  <span class="cluster-sub">CAMS</span>
                </div>
              </div>
            `,
            className: 'cctv-cluster-custom-icon',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });
        },
      });
    } else {
      console.warn('Leaflet markerClusterGroup not available, falling back to FeatureGroup');
      clusterGroup = Leaflet.featureGroup();
    }

    clusterGroupRef.current = clusterGroup;
    markersMapRef.current.clear();

    const markersToAdd = [];

    cameras.forEach((cam) => {
      const lat = cam.latitude || cam.location?.coordinates?.[1];
      const lng = cam.longitude || cam.location?.coordinates?.[0];

      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
        return;
      }

      const icon = createCameraIcon(cam);
      const marker = Leaflet.marker([lat, lng], {
        icon,
        title: `${cam.cameraId} - ${cam.name || cam.cameraName || ''}`,
      });

      // Bind rich popup
      const popupHtml = createPopupContent(cam);
      marker.bindPopup(popupHtml, {
        maxWidth: 380,
        minWidth: 320,
        className: 'cctv-cyber-popup',
        autoPanPadding: [20, 20],
      });

      markersMapRef.current.set(cam.cameraId, marker);
      markersToAdd.push(marker);
    });

    if (isClusterAvailable && typeof clusterGroup.addLayers === 'function') {
      clusterGroup.addLayers(markersToAdd);
    } else {
      markersToAdd.forEach((m) => clusterGroup.addLayer(m));
    }
    map.addLayer(clusterGroup);

    return () => {
      if (clusterGroupRef.current) {
        map.removeLayer(clusterGroupRef.current);
      }
    };
  }, [map, cameras]);

  return null;
}

