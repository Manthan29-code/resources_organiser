const JSON_HEADERS = {
  "Content-Type": "application/json"
};

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: JSON_HEADERS,
    ...options
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  return response.json();
}

export const api = {
  getData: () => request("/api/data"),
  createCategory: (payload) => request("/api/categories", { method: "POST", body: JSON.stringify(payload) }),
  updateCategory: (id, payload) => request(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteCategory: (id) => request(`/api/categories/${id}`, { method: "DELETE" }),
  createResource: (payload) => request("/api/resources", { method: "POST", body: JSON.stringify(payload) }),
  updateResource: (id, payload) => request(`/api/resources/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteResource: (id) => request(`/api/resources/${id}`, { method: "DELETE" }),
  createNote: (payload) => request("/api/notes", { method: "POST", body: JSON.stringify(payload) }),
  updateNote: (id, payload) => request(`/api/notes/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteNote: (id) => request(`/api/notes/${id}`, { method: "DELETE" }),
  getGithubStatus: () => request("/api/github/status"),
  syncToGithub: () => request("/api/github/sync", { method: "POST" }),
  pushNoteToGithub: (noteId) => request(`/api/github/push-note/${encodeURIComponent(noteId)}`, { method: "POST" })
};
