import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

let inMemoryAccessToken: string | null = null;

export function setAccessToken(token: string | null) {
  inMemoryAccessToken = token;
}

api.interceptors.request.use((config) => {
  if (inMemoryAccessToken) {
    config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
  }
  return config;
});

/**
 * Single-flight refresh: concurrent callers (React StrictMode's double effect, several 401s at once,
 * AuthContext + the interceptor) share ONE request. Refresh tokens rotate, so sending the same cookie
 * twice would look like token theft to the server.
 */
let refreshInFlight: Promise<{ accessToken: string; user: any }> | null = null;

export function refreshSession(): Promise<{ accessToken: string; user: any }> {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post('/api/auth/refresh', {}, { withCredentials: true })
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        return data;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

const NO_REFRESH = ['/auth/login', '/auth/logout', '/auth/refresh', '/auth/register', '/auth/verify-email', '/auth/resend-verification'];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !NO_REFRESH.some((u) => originalRequest.url?.includes(u))) {
      originalRequest._retry = true;
      try {
        const { accessToken } = await refreshSession();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        setAccessToken(null);
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

/** Shape of every error body the API returns. `code` is stable and safe to branch on. */
export interface ApiErrorInfo {
  message: string;
  code?: string;
  status?: number;
  email?: string;
  retryAfterSeconds?: number;
  attemptsLeft?: number;
  fields?: Record<string, string>;
}

export function parseApiError(err: unknown, fallback = 'Something went wrong. Please try again.'): ApiErrorInfo {
  const e = err as { response?: { status?: number; data?: Partial<ApiErrorInfo> }; message?: string };
  const data = e?.response?.data;
  if (!e?.response) {
    return { message: 'Cannot reach NestWell.BT. Check your connection and try again.', code: 'NETWORK' };
  }
  return { ...data, message: data?.message || fallback, status: e.response.status };
}
