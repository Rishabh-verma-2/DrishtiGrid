import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { isCameraInUserDepartment } from '../../utils/permissions';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

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
 * Builds rich metadata popup content conforming to Government Command specifications
 */
function createPopupContent(cam, user, isLight = false) {
  const statusKey = (cam.status || 'offline').toLowerCase();
  const cfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.offline;
  const lat = cam.latitude || cam.location?.coordinates?.[1] || 0;
  const lng = cam.longitude || cam.location?.coordinates?.[0] || 0;
  const address = cam.address?.full || cam.address?.street || cam.address || 'Gujarat, India';
  const locationText = cam.locationName || cam.roadName || cam.landmark || cam.district || 'Main Corridor';
  const deptName = cam.departmentName || 'Gujarat Police Department';
  const healthScore = Math.round(cam.healthMetrics?.uptime24h || (statusKey === 'online' ? 94 : 42));
  const crowdLevel = cam.alertsEnabled?.crowdDetection ? 'HIGH' : 'NORMAL';
  const anprStatus = cam.alertsEnabled?.anprEnabled ? 'ACTIVE' : 'STANDBY';
  
  const currentUser = user || useAuthStore.getState()?.user;
  const userRole = String(currentUser?.role || '').toUpperCase();
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN';
  const canViewLive = isAdmin || isCameraInUserDepartment(currentUser, cam);
  const isAuthorizedFootage = !isAdmin && ['POLICE', 'TRAFFIC_POLICE'].includes(userRole);

  // Real-time dynamic light mode detection (checks DOM classList as fallback)
  const activeLight =
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('theme-light') ||
        document.documentElement.classList.contains('light') ||
        Boolean(isLight)
      : Boolean(isLight);

  // High-contrast Light/Dark adaptive color palette
  const textTitle = activeLight ? '#0f172a' : '#f8fafc';
  const textLabel = activeLight ? '#334155' : '#94a3b8';
  const textVal = activeLight ? '#0f172a' : '#e2e8f0';
  const textSub = activeLight ? '#1e293b' : '#cbd5e1';
  const borderCol = activeLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)';

  const badgeIdBg = activeLight ? '#e0f2fe' : 'rgba(56,189,248,0.15)';
  const badgeIdText = activeLight ? '#0369a1' : '#38bdf8';
  const badgeIdBorder = activeLight ? '#bae6fd' : 'rgba(56,189,248,0.3)';

  const btnAnalyzeBg = activeLight ? '#f1f5f9' : 'rgba(255,255,255,0.1)';
  const btnAnalyzeText = activeLight ? '#0f172a' : '#e2e8f0';
  const btnAnalyzeBorder = activeLight ? '#cbd5e1' : 'rgba(255,255,255,0.15)';

  const btnIntelBg = activeLight ? '#e0f2fe' : 'rgba(56,189,248,0.15)';
  const btnIntelText = activeLight ? '#0284c7' : '#38bdf8';
  const btnIntelBorder = activeLight ? '#bae6fd' : 'rgba(56,189,248,0.3)';

  const btnNearbyBg = activeLight ? '#ede9fe' : 'rgba(99,102,241,0.15)';
  const btnNearbyText = activeLight ? '#4338ca' : '#a5b4fc';
  const btnNearbyBorder = activeLight ? '#ddd6fe' : 'rgba(99,102,241,0.3)';

  return `
    <div class="cctv-rich-popup-card" data-camera-id="${cam.cameraId}" style="min-width: 290px; font-family: inherit;">
      <!-- Header -->
      <div class="cctv-popup-header" style="border-bottom: 1px solid ${borderCol}; padding-bottom: 8px; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
          <span class="cctv-chip-id" style="font-family: monospace; font-size: 11px; font-weight: 800; color: ${badgeIdText}; background: ${badgeIdBg}; padding: 2px 6px; border-radius: 6px; border: 1px solid ${badgeIdBorder};">
            CAMERA ${cam.cameraId}
          </span>
          <span class="status-pill-badge ${cfg.badgeClass}" style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 6px;">
            <span class="status-dot"></span>
            ${cfg.label.toUpperCase()}
          </span>
        </div>
        <h4 class="cctv-title" style="font-size: 13px; font-weight: 700; margin: 0; color: ${textTitle}; line-height: 1.3;">
          ${cam.name || cam.cameraName || 'CCTV Node'}
        </h4>
      </div>

      <!-- Quick Command Telemetry Grid -->
      <div class="cctv-telemetry-grid" style="display: flex; flex-direction: column; gap: 5px; font-size: 11px; margin-bottom: 10px;">
        <div class="cctv-telemetry-row" style="display: flex; justify-content: space-between;">
          <span class="cctv-telemetry-label" style="color: ${textLabel}; font-weight: 600;">Department:</span>
          <span class="cctv-telemetry-val" style="font-weight: 700; color: ${textVal};">${deptName}</span>
        </div>
        <div class="cctv-telemetry-row" style="display: flex; justify-content: space-between;">
          <span class="cctv-telemetry-label" style="color: ${textLabel}; font-weight: 600;">Location:</span>
          <span class="cctv-telemetry-val-sub" style="font-weight: 600; color: ${textSub}; max-width: 170px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${locationText}</span>
        </div>
        <div class="cctv-telemetry-row" style="display: flex; justify-content: space-between;">
          <span class="cctv-telemetry-label" style="color: ${textLabel}; font-weight: 600;">Health Metric:</span>
          <span class="cctv-telemetry-health" style="font-family: monospace; font-weight: 800; color: ${healthScore > 80 ? (activeLight ? '#059669' : '#34d399') : (activeLight ? '#dc2626' : '#f87171')};">
            ${healthScore}/100
          </span>
        </div>
        <div class="cctv-telemetry-row" style="display: flex; justify-content: space-between;">
          <span class="cctv-telemetry-label" style="color: ${textLabel}; font-weight: 600;">Nearby Incidents:</span>
          <span class="cctv-telemetry-incident" style="font-family: monospace; font-weight: 800; color: ${activeLight ? '#dc2626' : '#f87171'};">2 Active</span>
        </div>
        <div class="cctv-telemetry-row" style="display: flex; justify-content: space-between;">
          <span class="cctv-telemetry-label" style="color: ${textLabel}; font-weight: 600;">Crowd Status:</span>
          <span class="cctv-telemetry-crowd" style="font-family: monospace; font-weight: 800; color: ${activeLight ? '#b45309' : '#fbbf24'};">${crowdLevel}</span>
        </div>
        <div class="cctv-telemetry-row" style="display: flex; justify-content: space-between;">
          <span class="cctv-telemetry-label" style="color: ${textLabel}; font-weight: 600;">ANPR Engine:</span>
          <span class="cctv-telemetry-anpr" style="font-family: monospace; font-weight: 800; color: ${activeLight ? '#0284c7' : '#22d3ee'};">${anprStatus}</span>
        </div>
      </div>

      <!-- Action Buttons Grid (Department Access Enforced) -->
      <div style="display: flex; flex-direction: column; gap: 6px; padding-top: 6px; border-top: 1px solid ${borderCol};">
        ${
          canViewLive
            ? `
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn-popup-stream cctv-btn-live" onclick="window.dispatchEvent(new CustomEvent('cctv:open-stream', { detail: '${cam.cameraId}' }))" style="flex: 1; padding: 6px 8px; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; border-radius: 6px; background: #059669; color: #ffffff; border: none; box-shadow: 0 1px 3px rgba(5,150,105,0.3);">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              LIVE VIEW
            </button>
            <button type="button" class="cctv-btn-analyze" onclick="window.location.href = '/anpr?cameraId=' + encodeURIComponent('${cam.cameraId}');" style="flex: 1; padding: 6px 8px; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; border-radius: 6px; background: ${btnAnalyzeBg}; color: ${btnAnalyzeText}; border: 1px solid ${btnAnalyzeBorder};">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><path d="m10 15 5-3-5-3v6Z"></path></svg>
              ANPR ANALYZE
            </button>
          </div>
        `
            : `
          <div style="background: ${activeLight ? '#fffbeb' : 'rgba(245, 158, 11, 0.12)'}; border: 1px solid ${activeLight ? '#fde68a' : 'rgba(245, 158, 11, 0.3)'}; border-radius: 6px; padding: 6px 8px; font-size: 10px; color: ${activeLight ? '#b45309' : '#fbbf24'}; line-height: 1.35;">
            <div style="display: flex; align-items: center; gap: 4px; font-weight: 800; margin-bottom: 2px;">
              <span>🔒 Inter-Department Camera</span>
            </div>
            <span>Live feed belongs to <strong>${deptName}</strong>. As per state rules, submit a Footage Request to Admin to access this feed.</span>
          </div>
          <button type="button" class="cctv-btn-footage" onclick="window.dispatchEvent(new CustomEvent('cctv:request-footage', { detail: '${cam.cameraId}' }))" style="width: 100%; padding: 7px 8px; font-size: 10px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; border-radius: 6px; background: linear-gradient(135deg, #1d4ed8, #2563eb); color: #fff; border: 1px solid rgba(255,255,255,0.25); box-shadow: 0 2px 6px rgba(37,99,235,0.35);">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            REQUEST FOOTAGE FROM ADMIN
          </button>
        `
        }

        <div style="display: flex; gap: 6px;">
          <button type="button" class="cctv-btn-intel" onclick="window.dispatchEvent(new CustomEvent('cctv:area-intel', { detail: '${cam.cameraId}' }))" style="flex: 1; padding: 6px 8px; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; border-radius: 6px; background: ${btnIntelBg}; color: ${btnIntelText}; border: 1px solid ${btnIntelBorder};">
            AREA INTEL
          </button>
          <button type="button" class="cctv-btn-nearby" onclick="window.dispatchEvent(new CustomEvent('cctv:nearby-cams', { detail: '${cam.cameraId}' }))" style="flex: 1; padding: 6px 8px; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; border-radius: 6px; background: ${btnNearbyBg}; color: ${btnNearbyText}; border: 1px solid ${btnNearbyBorder};">
            NEARBY CAMS
          </button>
        </div>



        ${
          isAdmin && ['offline', 'maintenance', 'fault'].includes(statusKey)
            ? `
          <button type="button" class="cctv-btn-report-dept" onclick="window.dispatchEvent(new CustomEvent('cctv:report-dept', { detail: '${cam.cameraId}' }))" style="width: 100%; padding: 6px 8px; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; border-radius: 6px; background: linear-gradient(135deg, #dc2626, #b91c1c); color: #fff; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 2px 6px rgba(220,38,38,0.35);">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
            REPORT OUTAGE TO DEPT
          </button>
        `
            : ''
        }
      </div>
    </div>
  `;
}

export default function CameraClusterLayer({
  cameras = [],
  user = null,
  onOpenStream,
  onRequestFootage,
  onOpenAnalyze,
  onOpenAreaIntel,
  onOpenNearbyCams,
  onReportToDept,
  userRole = 'POLICE',
  isLight = false,
}) {
  const map = useMap();
  const clusterGroupRef = useRef(null);
  const markersMapRef = useRef(new Map());

  // Listen for global button events emitted from popup HTML
  useEffect(() => {
    const handleStreamEvent = (e) => {
      const cameraId = e.detail;
      const cam = cameras.find((c) => c.cameraId === cameraId);
      if (!cam) return;
      if (!isCameraInUserDepartment(user, cam)) {
        toast.error(
          `Access Restricted: Camera belongs to ${cam.departmentName || 'another department'}. Under Gujarat State rules, submit a Footage Request to Admin.`,
          { duration: 5000 }
        );
        if (onRequestFootage) onRequestFootage(cam);
        return;
      }
      if (onOpenStream) onOpenStream(cam);
    };

    const handleRequisitionEvent = (e) => {
      const cameraId = e.detail;
      const cam = cameras.find((c) => c.cameraId === cameraId);
      if (cam && onRequestFootage) onRequestFootage(cam);
    };

    const handleAnalyzeEvent = (e) => {
      const cameraId = e.detail;
      const cam = cameras.find((c) => c.cameraId === cameraId);
      if (cam && onOpenAnalyze) onOpenAnalyze(cam);
    };

    const handleAreaIntelEvent = (e) => {
      const cameraId = e.detail;
      const cam = cameras.find((c) => c.cameraId === cameraId);
      if (cam && onOpenAreaIntel) onOpenAreaIntel(cam);
    };

    const handleNearbyCamsEvent = (e) => {
      const cameraId = e.detail;
      const cam = cameras.find((c) => c.cameraId === cameraId);
      if (cam && onOpenNearbyCams) onOpenNearbyCams(cam);
    };

    const handleReportDeptEvent = (e) => {
      const cameraId = e.detail;
      const cam = cameras.find((c) => c.cameraId === cameraId);
      if (cam && onReportToDept) onReportToDept(cam);
    };

    window.addEventListener('cctv:open-stream', handleStreamEvent);
    window.addEventListener('cctv:request-footage', handleRequisitionEvent);
    window.addEventListener('cctv:analyze', handleAnalyzeEvent);
    window.addEventListener('cctv:area-intel', handleAreaIntelEvent);
    window.addEventListener('cctv:nearby-cams', handleNearbyCamsEvent);
    window.addEventListener('cctv:report-dept', handleReportDeptEvent);

    return () => {
      window.removeEventListener('cctv:open-stream', handleStreamEvent);
      window.removeEventListener('cctv:request-footage', handleRequisitionEvent);
      window.removeEventListener('cctv:analyze', handleAnalyzeEvent);
      window.removeEventListener('cctv:area-intel', handleAreaIntelEvent);
      window.removeEventListener('cctv:nearby-cams', handleNearbyCamsEvent);
      window.removeEventListener('cctv:report-dept', handleReportDeptEvent);
    };
  }, [cameras, onOpenStream, onRequestFootage, onOpenAnalyze, onOpenAreaIntel, onOpenNearbyCams, onReportToDept]);

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

      // Bind rich popup with real-time theme evaluation
      marker.bindPopup(() => createPopupContent(cam, user, isLight), {
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
  }, [map, cameras, user, isLight]);

  return null;
}

