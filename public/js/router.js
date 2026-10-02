const BASE_ROUTES = new Set(["dashboard", "resources", "categories", "notes"]);

export function getRouteFromHash() {
  const raw = window.location.hash.replace(/^#\/?/, "") || "dashboard";
  const parts = raw.split("/").filter(Boolean);

  if (parts.length === 2 && parts[0] === "notes") {
    return { route: "note-detail", param: decodeURIComponent(parts[1]) };
  }

  const base = parts[0] || "dashboard";
  if (BASE_ROUTES.has(base)) {
    return { route: base, param: null };
  }

  return { route: "dashboard", param: null };
}

export function ensureRoute() {
  if (!window.location.hash) {
    window.location.hash = "#/dashboard";
  }
}
