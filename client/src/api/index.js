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
