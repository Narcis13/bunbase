/**
 * API client for admin UI with authentication handling.
 * All requests include JWT token from localStorage.
 */

const API_BASE = ""; // Same origin

/**
 * Make an authenticated API request.
 * Includes JWT token from localStorage and handles 401 by redirecting to login.
 *
 * @param path - API path (e.g., "/api/collections/users/records")
 * @param options - Fetch options (method, body, etc.)
 * @returns Response object
 * @throws Error if not authenticated or request fails
 */
export async function fetchWithAuth(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = localStorage.getItem("bunbase_token");
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 401) {
    localStorage.removeItem("bunbase_token");
    window.location.href = "/_/login";
    throw new Error("Session expired");
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Request failed");
  }

  return response;
}

/**
 * Login and store token.
 *
 * @param email - Admin email
 * @param password - Admin password
 * @returns Admin user object
 */
export async function login(
  email: string,
  password: string
): Promise<{ token: string; admin: { id: string; email: string } }> {
  const response = await fetch("/_/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Login failed");
  }

  const data = await response.json();
  localStorage.setItem("bunbase_token", data.token);
  return data;
}

/**
 * Logout and clear token.
 */
export function logout(): void {
  localStorage.removeItem("bunbase_token");
  window.location.href = "/_/login";
}

/**
 * Check if user is authenticated.
 *
 * @returns True if token exists in localStorage
 */
export function isAuthenticated(): boolean {
  return !!localStorage.getItem("bunbase_token");
}
