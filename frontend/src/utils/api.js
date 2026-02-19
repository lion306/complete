import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// Request interceptor: attach token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor: handle token expiry, errors
api.interceptors.response.use(
  res => res,
  async error => {
    const original = error.config;

    if (error.response?.status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED' && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const res = await axios.post('/api/auth/refresh', { refreshToken });
        localStorage.setItem('accessToken', res.data.accessToken);
        localStorage.setItem('refreshToken', res.data.refreshToken);
        original.headers.Authorization = `Bearer ${res.data.accessToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
      }
    }

    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    }

    const message = error.response?.data?.error || error.message || 'Unbekannter Fehler';
    if (error.response?.status !== 401) {
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

// ---- Auth ----
export const authApi = {
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/change-password', data),
};

// ---- Fahrzeuge ----
export const fahrzeugeApi = {
  list: (params) => api.get('/fahrzeuge', { params }),
  get: (id) => api.get(`/fahrzeuge/${id}`),
  create: (data) => api.post('/fahrzeuge', data),
  update: (id, data) => api.put(`/fahrzeuge/${id}`, data),
  remove: (id) => api.delete(`/fahrzeuge/${id}`),
  updateStatus: (id, data) => api.post(`/fahrzeuge/${id}/status`, data),
  statusHistory: (id) => api.get(`/fahrzeuge/${id}/history`),
  verkaufen: (id, data) => api.post(`/fahrzeuge/${id}/verkauf`, data),
  qrCode: (id) => api.get(`/fahrzeuge/${id}/qr-code`),
  stats: () => api.get('/fahrzeuge/stats'),
};

// ---- Stellplätze ----
export const stellplaetzeApi = {
  list: (params) => api.get('/stellplaetze', { params }),
  raster: (standort_id) => api.get(`/stellplaetze/raster/${standort_id}`),
  scan: (data) => api.post('/stellplaetze/scan', data),
  create: (data) => api.post('/stellplaetze', data),
  update: (id, data) => api.put(`/stellplaetze/${id}`, data),
  generateRaster: (data) => api.post('/stellplaetze/generate-raster', data),
};

// ---- Kunden ----
export const kundenApi = {
  list: (params) => api.get('/kunden', { params }),
  get: (id) => api.get(`/kunden/${id}`),
  create: (data) => api.post('/kunden', data),
  update: (id, data) => api.put(`/kunden/${id}`, data),
};

// ---- Leads ----
export const leadsApi = {
  list: (params) => api.get('/leads', { params }),
  get: (id) => api.get(`/leads/${id}`),
  create: (data) => api.post('/leads', data),
  update: (id, data) => api.put(`/leads/${id}`, data),
  addActivity: (id, data) => api.post(`/leads/${id}/aktivitaet`, data),
  assign: (id, data) => api.post(`/leads/${id}/zuweisen`, data),
  convert: (id) => api.post(`/leads/${id}/konvertieren`),
  importEmail: () => api.post('/leads/import/email'),
  parseEmail: (data) => api.post('/leads/import/parse', data),
};

// ---- Provisionen ----
export const provisionenApi = {
  list: (params) => api.get('/provisionen', { params }),
  dashboard: (params) => api.get('/provisionen/dashboard', { params }),
  berechnen: (data) => api.post('/provisionen/berechnen', data),
  genehmigen: (id) => api.post(`/provisionen/${id}/genehmigen`),
  ausbezahlt: (id) => api.post(`/provisionen/${id}/ausbezahlt`),
  plzRegionen: () => api.get('/provisionen/plz-regionen'),
};

// ---- Dokumente ----
export const dokumenteApi = {
  list: (fahrzeug_id) => api.get(`/dokumente/fahrzeug/${fahrzeug_id}`),
  generieren: (data) => api.post('/dokumente/generieren', data),
  vorschau: (data) => api.post('/dokumente/vorschau', data),
  templates: () => api.get('/dokumente/templates'),
  saveTemplate: (data) => api.post('/dokumente/templates', data),
};

// ---- Schaeden ----
export const schaedenApi = {
  list: (fahrzeug_id) => api.get(`/schaeden/fahrzeug/${fahrzeug_id}`),
  create: (data) => api.post('/schaeden', data),
  update: (id, data) => api.put(`/schaeden/${id}`, data),
  remove: (id) => api.delete(`/schaeden/${id}`),
  toggleReparieren: (id) => api.post(`/schaeden/${id}/toggle-reparieren`),
};

// ---- Fotos ----
export const fotosApi = {
  list: (fahrzeug_id) => api.get(`/fotos/fahrzeug/${fahrzeug_id}`),
  upload: (fahrzeug_id, formData, onProgress) => api.post(
    `/fotos/fahrzeug/${fahrzeug_id}`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    }
  ),
  setTitelbild: (id) => api.post(`/fotos/${id}/titelbild`),
  updatePosition: (id, position) => api.put(`/fotos/${id}/position`, { position }),
  remove: (id) => api.delete(`/fotos/${id}`),
};

// ---- Standorte ----
export const standorteApi = {
  list: () => api.get('/standorte'),
  get: (id) => api.get(`/standorte/${id}`),
  create: (data) => api.post('/standorte', data),
  update: (id, data) => api.put(`/standorte/${id}`, data),
};

// ---- Nutzer ----
export const nutzerApi = {
  list: () => api.get('/nutzer'),
  get: (id) => api.get(`/nutzer/${id}`),
  create: (data) => api.post('/nutzer', data),
  update: (id, data) => api.put(`/nutzer/${id}`, data),
  deactivate: (id) => api.delete(`/nutzer/${id}`),
  resetPassword: (id, data) => api.post(`/nutzer/${id}/reset-password`, data),
};

// ---- Export ----
export const exportApi = {
  toMobileDe: (data) => api.post('/export/mobilede', data),
  toAutoScout: (data) => api.post('/export/autoscout', data),
};

export default api;
