import axios from 'axios';

const api = axios.create({ baseURL: '/api', withCredentials: true });

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url ?? '';
    if (err.response?.status === 401 && !url.includes('/auth/me') && !url.includes('/auth/login')) {
      window.dispatchEvent(new CustomEvent('session:expired'));
    }
    return Promise.reject(err);
  }
);

export default api;
