import React, { useState } from 'react';
import { Marker, Circle, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gisAPI } from '../../api';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Radio,
  FileText,
  Shield,
  Hospital,
  Flame,
  Camera,
  CheckSquare,
  Square,
  ArrowRight,
  Trash2,
  CheckCircle2,
} from 'lucide-react';

function createIncidentMarkerIcon(priority = 'P2', isSelected = false) {
  const isP1 = priority === 'P1';

  return L.divIcon({
    className: 'custom-incident-marker',
    html: `
      <div style="
        width: ${isSelected ? '36px' : '30px'};
        height: ${isSelected ? '36px' : '30px'};
        border-radius: 50%;
        background: ${isP1 ? '#dc2626' : '#ea580c'};
        border: 2px solid #ffffff;
        box-shadow: 0 0 16px ${isP1 ? 'rgba(220,38,38,0.7)' : 'rgba(234,88,12,0.6)'};
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        animation: pulse 1.8s infinite;
      ">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ffffff" stroke-width="2.5">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

export default function IncidentRadiusLayer({
  incidents = [],
  selectedIncident,
  onSelectIncident,
  onRequestEvidenceFootage,
  isLight = false,
  userRole = 'POLICE',
}) {
  const [incidentRadius, setIncidentRadius] = useState(500); // 250, 500, 1000 meters
  const [selectedCamerasForEvidence, setSelectedCamerasForEvidence] = useState([]);
  const queryClient = useQueryClient();
  const isAdmin = String(userRole || '').toUpperCase() === 'ADMIN' || String(userRole || '').toUpperCase() === 'SUPERADMIN';

  const resolveIncidentMutation = useMutation({
    mutationFn: (id) => gisAPI.updateIncidentStatus(id, { status: 'resolved' }),
    onSuccess: () => {
      queryClient.invalidateQueries(['gis-incidents']);
      toast.success('Incident marked as Resolved and cleared from active surveillance grid');
    },
    onError: () => toast.error('Failed to update incident status'),
  });

  const deleteIncidentMutation = useMutation({
    mutationFn: (id) => gisAPI.deleteIncident(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['gis-incidents']);
      toast.success('Incident deleted successfully');
    },
    onError: () => toast.error('Failed to delete incident'),
  });

  const selId = selectedIncident?.incidentId || selectedIncident?._id;

  // Query incident radius context from backend
  const { data: contextData } = useQuery({
    queryKey: ['gis-incident-context', selId, incidentRadius],
    queryFn: async () => {
      const res = await gisAPI.getIncidentContext(selId, { radius: incidentRadius });
      return res.data.data;
    },
    enabled: !!selId,
    staleTime: 15000,
  });

  const toggleCameraSelection = (camId) => {
    setSelectedCamerasForEvidence((prev) =>
      prev.includes(camId) ? prev.filter((id) => id !== camId) : [...prev, camId]
    );
  };

  const handleCreateEvidenceRequest = () => {
    if (!onRequestEvidenceFootage || !selectedIncident) return;
    const cams =
      selectedCamerasForEvidence.length > 0
        ? selectedCamerasForEvidence
        : (contextData?.suggestedEvidenceCameras || []).map((c) => c.cameraId);

    onRequestEvidenceFootage({
      incident: selectedIncident,
      cameraIds: cams,
    });
  };

  return (
    <>
      {incidents.map((inc) => {
        const lat = inc.location?.coordinates?.[1];
        const lng = inc.location?.coordinates?.[0];
        if (!lat || !lng) return null;

        const isSelected = selectedIncident?._id === inc._id || selectedIncident?.incidentId === inc.incidentId;
        const icon = createIncidentMarkerIcon(inc.priority, isSelected);

        return (
          <React.Fragment key={inc.incidentId || inc._id}>
            <Marker
              position={[lat, lng]}
              icon={icon}
              eventHandlers={{
                click: () => {
                  if (onSelectIncident) onSelectIncident(inc);
                },
              }}
            >
              <Tooltip sticky direction="top">
                <strong>#{inc.incidentId}</strong>: {inc.title}
              </Tooltip>

              <Popup className="cctv-cyber-popup" maxWidth={360}>
                <div className="p-2.5 space-y-2.5 text-xs min-w-[280px] font-sans">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/15 text-red-500 border border-red-500/20">
                      INCIDENT #{inc.incidentId}
                    </span>
                    <span className="font-mono text-[10px] font-bold uppercase text-amber-500">
                      Priority {inc.priority || 'P2'}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{inc.title}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">{inc.description || 'Active operational event'}</p>
                  </div>

                  {/* Radius Selector */}
                  <div className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Surveillance Radius:</span>
                      <div className="flex items-center gap-1 font-mono text-[10px]">
                        {[250, 500, 1000].map((r) => (
                          <button
                            key={r}
                            onClick={() => setIncidentRadius(r)}
                            className={`px-2 py-0.5 rounded transition-colors ${
                              incidentRadius === r
                                ? 'bg-blue-600 text-white font-bold shadow-xs'
                                : 'text-slate-700 dark:text-slate-400 bg-white dark:bg-transparent border border-slate-200 dark:border-transparent hover:text-slate-950 dark:hover:text-white'
                            }`}
                          >
                            {r}m
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Context Stats */}
                    {contextData && (
                      <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                          <span>Cameras:</span>
                          <strong className="text-slate-900 dark:text-slate-100">{contextData.counts.cameras}</strong>
                        </div>
                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                          <span>Active Alerts:</span>
                          <strong className="text-red-500 dark:text-red-400">{contextData.counts.activeIncidents}</strong>
                        </div>
                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                          <span>Police PS:</span>
                          <strong className="text-blue-600 dark:text-blue-400">{contextData.counts.policeStations}</strong>
                        </div>
                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                          <span>Hospitals:</span>
                          <strong className="text-rose-600 dark:text-rose-400">{contextData.counts.hospitals}</strong>
                        </div>
                      </div>
                    )}

                    {/* Management & Status Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-white/10 mt-2">
                      <button
                        type="button"
                        onClick={() => resolveIncidentMutation.mutate(inc._id || inc.incidentId)}
                        disabled={resolveIncidentMutation.isPending}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                        title="Mark as resolved (removes from active surveillance map)"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{resolveIncidentMutation.isPending ? 'Resolving...' : 'Resolve Incident'}</span>
                      </button>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Permanently delete incident #${inc.incidentId}?`)) {
                              deleteIncidentMutation.mutate(inc._id || inc.incidentId);
                            }
                          }}
                          disabled={deleteIncidentMutation.isPending}
                          className="py-1.5 px-2.5 rounded-lg bg-red-600/15 hover:bg-red-600/25 text-red-500 hover:text-red-600 border border-red-500/30 transition-colors cursor-pointer flex items-center justify-center gap-1 text-[11px] font-semibold disabled:opacity-50"
                          title="Delete Incident"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Suggested Evidence Cameras */}
                  {contextData?.suggestedEvidenceCameras?.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Suggested Evidence Sources:</span>
                        <span className="text-emerald-400 font-bold">✓ Verified Ready</span>
                      </div>

                      <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                        {contextData.suggestedEvidenceCameras.map((c) => {
                          const isChecked = selectedCamerasForEvidence.includes(c.cameraId);
                          return (
                            <div
                              key={c.cameraId}
                              onClick={() => toggleCameraSelection(c.cameraId)}
                              className="flex items-center justify-between p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer text-[11px] bg-white dark:bg-transparent"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-blue-600 dark:text-blue-400 font-mono font-bold">{c.cameraId}</span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400">({c.distanceMeters}m)</span>
                              </div>
                              <span className="text-blue-600 dark:text-blue-500 font-bold">
                                {isChecked ? '✓ Selected' : '+ Select'}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={handleCreateEvidenceRequest}
                        className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-blue-500/25 mt-2"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Create Footage Request
                      </button>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>

            {/* Visual radius circle around selected incident */}
            {isSelected && (
              <Circle
                center={[lat, lng]}
                radius={incidentRadius}
                pathOptions={{
                  color: '#ef4444',
                  fillColor: '#ef4444',
                  fillOpacity: 0.12,
                  weight: 2,
                  dashArray: '4, 4',
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}
