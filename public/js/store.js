import { api } from "./api.js";

const listeners = new Set();

export const store = {
  data: { meta: {}, categories: [], resources: [], notes: [] },
  search: "",
  route: "dashboard",
  routeParam: null,
  githubStatus: null,
  async init() {
    this.data = await api.getData();
    try {
      this.githubStatus = await api.getGithubStatus();
    } catch {
      this.githubStatus = { configured: false };
    }
    this.emit();
  },
  async refresh() {
    this.data = await api.getData();
    try {
      this.githubStatus = await api.getGithubStatus();
    } catch {
      // keep previous
    }
    this.emit();
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  emit() {
    listeners.forEach((listener) => listener(this));
  },
  setSearch(search) {
    this.search = search.trim().toLowerCase();
    this.emit();
  },
  setRoute(routeInfo) {
    if (typeof routeInfo === "string") {
      this.route = routeInfo;
      this.routeParam = null;
    } else {
      this.route = routeInfo.route;
      this.routeParam = routeInfo.param || null;
    }
    this.emit();
  }
};
