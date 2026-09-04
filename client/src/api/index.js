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

