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

// ============================================================================
// Schema API Functions
// ============================================================================

/**
 * Field input type for creating/updating fields.
 */
export interface FieldInput {
  name: string;
  type: "text" | "number" | "boolean" | "datetime" | "json" | "relation";
  required?: boolean;
  options?: { target?: string } | null;
}

/**
 * Field type returned from API.
 */
export interface Field {
  id: string;
  collection_id: string;
  name: string;
  type: "text" | "number" | "boolean" | "datetime" | "json" | "relation";
  required: boolean;
  options: { target?: string } | null;
  created_at: string;
}

/**
 * Collection type returned from API.
 */
export interface Collection {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  fieldCount?: number;
  recordCount?: number;
}

/**
 * Create a new collection with optional fields.
 *
 * @param name - Collection name (must start with letter, alphanumeric + underscore)
 * @param fields - Optional array of field definitions
 * @returns Created collection
 */
export async function createCollection(
  name: string,
  fields: FieldInput[] = []
): Promise<Collection> {
  const response = await fetchWithAuth("/_/api/collections", {
    method: "POST",
    body: JSON.stringify({ name, fields }),
  });
  return response.json();
}

/**
 * Rename a collection.
 *
 * @param name - Current collection name
 * @param newName - New collection name
 * @returns Updated collection
 */
export async function renameCollection(
  name: string,
  newName: string
): Promise<Collection> {
  const response = await fetchWithAuth(`/_/api/collections/${name}`, {
    method: "PATCH",
    body: JSON.stringify({ newName }),
  });
  return response.json();
}

/**
 * Delete a collection and all its records.
 *
 * @param name - Collection name
 */
export async function deleteCollection(name: string): Promise<void> {
  await fetchWithAuth(`/_/api/collections/${name}`, {
    method: "DELETE",
  });
}

/**
 * Add a field to a collection.
 *
 * @param collection - Collection name
 * @param field - Field definition
 * @returns Created field
 */
export async function addField(
  collection: string,
  field: FieldInput
): Promise<Field> {
  const response = await fetchWithAuth(
    `/_/api/collections/${collection}/fields`,
    {
      method: "POST",
      body: JSON.stringify(field),
    }
  );
  return response.json();
}

/**
 * Update a field in a collection.
 *
 * @param collection - Collection name
 * @param fieldName - Current field name
 * @param updates - Fields to update
 * @returns Updated field
 */
export async function updateField(
  collection: string,
  fieldName: string,
  updates: Partial<FieldInput>
): Promise<Field> {
  const response = await fetchWithAuth(
    `/_/api/collections/${collection}/fields/${fieldName}`,
    {
      method: "PATCH",
      body: JSON.stringify(updates),
    }
  );
  return response.json();
}

/**
 * Delete a field from a collection.
 *
 * @param collection - Collection name
 * @param fieldName - Field name
 */
export async function deleteField(
  collection: string,
  fieldName: string
): Promise<void> {
  await fetchWithAuth(
    `/_/api/collections/${collection}/fields/${fieldName}`,
    {
      method: "DELETE",
    }
  );
}

/**
 * Fetch fields for a collection.
 *
 * @param collection - Collection name
 * @returns Array of fields
 */
export async function fetchFields(collection: string): Promise<Field[]> {
  const response = await fetchWithAuth(
    `/_/api/collections/${collection}/fields`
  );
  return response.json();
}

/**
 * Fetch all collections.
 *
 * @returns Array of collections with field and record counts
 */
export async function fetchCollections(): Promise<Collection[]> {
  const response = await fetchWithAuth("/_/api/collections");
  return response.json();
}
