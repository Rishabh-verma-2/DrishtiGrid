import apiClient from './apiClient';

export const authAPI = {
  login: (credentials) => apiClient.post('/auth/login', credentials),
  register: (data) => apiClient.post('/auth/register', data),
  logout: () => apiClient.post('/auth/logout'),
  getMe: () => apiClient.get('/auth/me'),
  refreshToken: (refreshToken) => apiClient.post('/auth/refresh', { refreshToken }),
};

export const cameraAPI = {
  getAll: (params) => apiClient.get('/cameras', { params }),
  getById: (id) => apiClient.get(`/cameras/${id}`),
  create: (data) => apiClient.post('/cameras', data),
  update: (id, data) => apiClient.put(`/cameras/${id}`, data),
  delete: (id) => apiClient.delete(`/cameras/${id}`),
  heartbeat: (id, status) => apiClient.patch(`/cameras/${id}/heartbeat`, { status }),
  getStats: () => apiClient.get('/cameras/stats'),
  downloadBulkTemplate: () =>
    apiClient.get('/cameras/bulk/template', { responseType: 'blob' }),
  validateBulk: (formData) =>
    apiClient.post('/cameras/bulk/validate', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  commitBulkImport: (importId) =>
    apiClient.post('/cameras/bulk/import', { importId }),
  getImportSession: (importId) =>
    apiClient.get(`/cameras/bulk/import/${importId}`),
  downloadImportReport: (importId) =>
    apiClient.get(`/cameras/bulk/import/${importId}/report`, { responseType: 'blob' }),
  cancelBulkImport: (importId) =>
    apiClient.post(`/cameras/bulk/import/${importId}/cancel`),
  startStream: (id) => apiClient.post(`/cameras/${id}/stream/start`),
  stopStream: (id) => apiClient.post(`/cameras/${id}/stream/stop`),
  getAnprStatus: (id) => apiClient.get(`/cameras/${id}/anpr/status`),
};

export const alertAPI = {
  getAll: (params) => apiClient.get('/alerts', { params }),
  create: (data) => apiClient.post('/alerts', data),
  acknowledge: (id) => apiClient.patch(`/alerts/${id}/acknowledge`),
  resolve: (id, note) => apiClient.patch(`/alerts/${id}/resolve`, { note }),
  getStats: () => apiClient.get('/alerts/stats'),
};

export const streamAPI = {
  getFeeds: () => apiClient.get('/stream/feeds'),
  getFeedById: (id) => apiClient.get(`/stream/feeds/${id}`),
};

export const footageTicketAPI = {
  getAll: (params) => apiClient.get('/footage-tickets', { params }),
  getStats: () => apiClient.get('/footage-tickets/stats'),
  getById: (id) => apiClient.get(`/footage-tickets/${id}`),
  create: (data) => apiClient.post('/footage-tickets', data),
  approve: (id, data) => apiClient.post(`/footage-tickets/${id}/approve`, data),
  reject: (id, data) => apiClient.post(`/footage-tickets/${id}/reject`, data),
  acknowledge: (id) => apiClient.post(`/footage-tickets/${id}/acknowledge`),
  assign: (id, data) => apiClient.post(`/footage-tickets/${id}/assign`, data),
  getDepartmentOperators: () => apiClient.get('/footage-tickets/department-operators'),
  requestClarification: (id, data) => apiClient.post(`/footage-tickets/${id}/clarify`, data),
  respondClarification: (id, data) => apiClient.post(`/footage-tickets/${id}/clarify-response`, data),
  getEvidenceToken: (id, evidenceId) => apiClient.post(`/footage-tickets/${id}/evidence/${evidenceId}/token`),
  complete: (id, data) => apiClient.post(`/footage-tickets/${id}/complete`, data),
  getEvidencePackage: (id) => apiClient.get(`/footage-tickets/${id}/evidence-package`),
  updateStatus: (id, data) => apiClient.patch(`/footage-tickets/${id}/status`, data),
  uploadEvidence: (id, formData) =>
    apiClient.post(`/footage-tickets/${id}/evidence`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  verifyEvidence: (id, evidenceId) =>
    apiClient.get(`/footage-tickets/${id}/evidence/${evidenceId}/verify`),
  getResponses: (id) => apiClient.get(`/footage-tickets/${id}/responses`),
  addResponse: (id, data) => apiClient.post(`/footage-tickets/${id}/responses`, data),
  getAuditLogs: (id) => apiClient.get(`/footage-tickets/${id}/audit-logs`),
  getAllAuditLogs: (params) => apiClient.get('/footage-tickets/audit-logs/all', { params }),
  dispatch: (id, data) => apiClient.post(`/footage-tickets/${id}/dispatch`, data),
  recordAccess: (id, data) => apiClient.post(`/footage-tickets/${id}/access`, data),
};

export const notificationAPI = {
  getAll: (params) => apiClient.get('/notifications', { params }),
  markRead: (id) => apiClient.patch(`/notifications/${id}/read`),
  markAllRead: () => apiClient.patch('/notifications/read-all'),
  delete: (id) => apiClient.delete(`/notifications/${id}`),
  clearRead: () => apiClient.delete('/notifications/clear-read'),
};

export const userAPI = {
  getAll: (params) => apiClient.get('/users', { params }),
  create: (data) => apiClient.post('/users', data),
  update: (id, data) => apiClient.put(`/users/${id}`, data),
  toggleStatus: (id) => apiClient.patch(`/users/${id}/status`),
};

export const auditLogAPI = {
  getAll: (params) => apiClient.get('/audit-logs', { params }),
};

export const systemHealthAPI = {
  get: () => apiClient.get('/system-health'),
};

export const anprAPI = {
  analyze: (formData) =>
    apiClient.post('/anpr/analyze', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180000,
    }),
  uploadVideo: (formData) =>
    apiClient.post('/anpr/video/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
    }),
  getVideoJobStatus: (jobId) => apiClient.get(`/anpr/video/job/${jobId}`),
  getVideoDetections: (videoId) => apiClient.get(`/anpr/video/detections/${videoId}`),
  getDetections: (params) => apiClient.get('/anpr/detections', { params }),
  getStoredPlates: (params) => apiClient.get('/anpr/stored-plates', { params }),
  getWatchlist: (params) => apiClient.get('/anpr/watchlist', { params }),
  createWatchlistRecord: (data) => apiClient.post('/anpr/watchlist', data),
  updateWatchlistRecord: (id, data) => apiClient.patch(`/anpr/watchlist/${id}`, data),
  deleteWatchlistRecord: (id, hard = false) => apiClient.delete(`/anpr/watchlist/${id}?hard=${hard}`),
  getStats: () => apiClient.get('/anpr/stats'),
  clearIncidents: () => apiClient.delete('/anpr/incidents'),
};

export const analyticsAPI = {
  getCameraHealth: (id, params) => apiClient.get(`/analytics/camera-health/${id}`, { params }),
  getCoverageGaps: (params) => apiClient.get('/analytics/coverage-gaps', { params }),
  getSearchSuggestions: (params) => apiClient.get('/analytics/search-suggestions', { params }),
};

export const departmentAPI = {
  getAll: () => apiClient.get('/departments'),
};

export const reportAPI = {
  dispatch: (data) => apiClient.post('/reports/dispatch', data),
  getHistory: () => apiClient.get('/reports/history'),
  download: (fileName) => apiClient.get(`/reports/download/${fileName}`, { responseType: 'blob' }),
};

export const deptReportAPI = {
  /** Create a new dept escalation report — Admin only */
  create: (data) => apiClient.post('/dept-reports', data),
  /** Get inbox list (role-filtered server side) */
  getAll: (params) => apiClient.get('/dept-reports', { params }),
  /** Get single report with full thread */
  getById: (reportId) => apiClient.get(`/dept-reports/${reportId}`),
  /** Reply to a thread */
  reply: (reportId, data) => apiClient.post(`/dept-reports/${reportId}/reply`, data),
  /** Update report status */
  updateStatus: (reportId, data) => apiClient.patch(`/dept-reports/${reportId}/status`, data),
  /** Get blocked attempt logs (Admin only) */
  getAttempts: () => apiClient.get('/dept-reports/attempts'),
};

export const crowdAPI = {
  /**
   * Upload a single image frame for on-demand crowd density analysis.
   * @param {File|Blob} imageFile  - The image file
   * @param {string}   cameraId   - Camera identifier
   * @param {Object}   [opts]     - { confThreshold, gridRows, gridCols }
   *
   * Response data fields:
   *   detected_count    {number}  - Persons YOLO directly detected
   *   occluded_est      {number}  - Estimated hidden/occluded persons
   *   total_count       {number}  - detected_count + occluded_est
   *   crowd_level       {string}  - LOW | MEDIUM | HIGH | CRITICAL
   *   density_score     {number}  - 0-1
   *   zones             {Array}   - Density grid zones
   *   person_detections {Array}   - Per-person bbox + confidence
   *   object_inventory  {Object}  - vehicles: {car,truck,...}, vehicle_total, other_objects
   *   surge             {Object}  - surge_detected, baseline_avg, surge_percent
   *   annotated_image_b64 {string}- Annotated frame with heatmap + panels
   */
  analyzeFrame: (imageFile, cameraId = 'default', opts = {}) => {
    const form = new FormData();
    form.append('image', imageFile);
    form.append('camera_id', cameraId);
    form.append('conf_threshold', String(opts.confThreshold ?? 0.30));
    form.append('grid_rows', String(opts.gridRows ?? 3));
    form.append('grid_cols', String(opts.gridCols ?? 4));
    return apiClient.post('/crowd/analyze', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** Fetch crowd_surge alerts with optional filters */
  getAlerts: (params) => apiClient.get('/crowd/alerts', { params }),

  /** Aggregate crowd stats */
  getStats: () => apiClient.get('/crowd/stats'),

  /** Reset per-camera surge baseline + alert cooldown */
  resetBaseline: (camId) => apiClient.post(`/crowd/reset/${camId}`),
};

export const gisAPI = {
  search: (params) => apiClient.get('/gis/search', { params }),
  getNearby: (params) => apiClient.get('/gis/nearby', { params }),
  getAreaIntelligence: (params) => apiClient.get('/gis/area-intelligence', { params }),
  discoverRouteCameras: (data) => apiClient.post('/gis/route-cameras', data),
  getCoverage: (params) => apiClient.get('/gis/coverage', { params }),
  getInfrastructure: (params) => apiClient.get('/gis/infrastructure', { params }),
  createInfrastructure: (data) => apiClient.post('/gis/infrastructure', data),
  getZones: (params) => apiClient.get('/gis/zones', { params }),
  createZone: (data) => apiClient.post('/gis/zones', data),
  updateZone: (id, data) => apiClient.patch(`/gis/zones/${id}`, data),
  deleteZone: (id) => apiClient.delete(`/gis/zones/${id}`),
  getIncidentContext: (id, params) => apiClient.get(`/gis/incident/${id}/context`, { params }),
  getIncidents: (params) => apiClient.get('/gis/incidents', { params }),
  createIncident: (data) => apiClient.post('/gis/incidents', data),
  updateIncidentStatus: (id, data) => apiClient.patch(`/gis/incidents/${id}/status`, data),
  deleteIncident: (id) => apiClient.delete(`/gis/incidents/${id}`),
};

export const gapAnalysisAPI = {
  analyze: (data) => apiClient.post('/gap-analysis/analyze', data),
  getAll: (params) => apiClient.get('/gap-analysis', { params }),
  getById: (id) => apiClient.get(`/gap-analysis/${id}`),
  send: (id, data) => apiClient.post(`/gap-analysis/${id}/send`, data),
  updateStatus: (id, data) => apiClient.patch(`/gap-analysis/${id}/status`, data),
};

export const investigationAPI = {
  getCases: (params) => apiClient.get('/investigation/cases', { params }),
  getCaseById: (id) => apiClient.get(`/investigation/cases/${id}`),
  createCase: (formData) =>
    apiClient.post('/investigation/cases', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  reviewCase: (id, data) => apiClient.post(`/investigation/cases/${id}/review`, data),
  getWatchlist: (params) => apiClient.get('/investigation/watchlist', { params }),
  assignDepartments: (id, data) => apiClient.post(`/investigation/watchlist/${id}/assign`, data),
  batchCreateAndDistributeWatchlist: (data) =>
    apiClient.post('/investigation/watchlist/batch-create-and-distribute', data),
  getAssignments: (params) => apiClient.get('/investigation/assignments', { params }),
  runSearch: (data) => apiClient.post('/investigation/search', data),
  submitResult: (formData) =>
    apiClient.post('/investigation/results', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  validateResult: (id, data) => apiClient.post(`/investigation/results/${id}/validate`, data),
  forwardResult: (id, data) => apiClient.post(`/investigation/results/${id}/forward`, data),
  acknowledgeResult: (id, data) => apiClient.post(`/investigation/results/${id}/acknowledge`, data),
  checkDuplicate: (params) => apiClient.get('/investigation/check-duplicate', { params }),
  getAnalytics: () => apiClient.get('/investigation/analytics'),
};




