import { api } from "./api.js";

const listeners = new Set();

export const store = {
  data: { meta: {}, categories: [], resources: [], notes: [] },
  search: "",
  route: "dashboard",
  async init() {
    this.data = await api.getData();
    this.emit();
  },
  async refresh() {
    this.data = await api.getData();
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
  setRoute(route) {
    this.route = route;
    this.emit();
  }
};
