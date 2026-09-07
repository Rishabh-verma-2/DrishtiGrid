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
    }),
  uploadVideo: (formData) =>
    apiClient.post('/anpr/video/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
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




