const VALID_ROUTES = new Set(["dashboard", "resources", "categories", "notes"]);

export function getRouteFromHash() {
  const value = window.location.hash.replace(/^#\/?/, "") || "dashboard";
  return VALID_ROUTES.has(value) ? value : "dashboard";
}

export function ensureRoute() {
  if (!window.location.hash) {
    window.location.hash = "#/dashboard";
  }
}
