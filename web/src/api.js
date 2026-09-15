const TOKEN_KEY = 'oction.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message ?? body?.error ?? `Request failed (${status})`);
    this.status = status;
    this.code = body?.error;
    this.body = body ?? {};
  }
}

async function request(method, path, { body, formData } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: formData ?? (body ? JSON.stringify(body) : undefined),
  });

  const payload = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, payload);
  return payload;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
  del: (path) => request('DELETE', path),
  upload: (path, formData) => request('POST', path, { formData }),
};
