import { api } from "./api.js";
import { getRouteFromHash, ensureRoute } from "./router.js";
import { renderCategories, renderDashboard, renderNotes, renderResources } from "./renderers.js";
import { store } from "./store.js";

const view = document.querySelector("#view");
const pageTitle = document.querySelector("#page-title");
const navLinks = document.querySelector("#nav-links");
const searchInput = document.querySelector("#global-search");
const statusBanner = document.querySelector("#status-banner");
const refreshDataButton = document.querySelector("#refresh-data-btn");
const openResourceModalButton = document.querySelector("#open-resource-modal");

const resourceModal = document.querySelector("#resource-modal");
const resourceForm = document.querySelector("#resource-form");
const resourceModalTitle = document.querySelector("#resource-modal-title");
const resourceCategorySelect = document.querySelector("#resource-category-select");

const categoryModal = document.querySelector("#category-modal");
const categoryForm = document.querySelector("#category-form");
const categoryModalTitle = document.querySelector("#category-modal-title");

const noteModal = document.querySelector("#note-modal");
const noteForm = document.querySelector("#note-form");
const noteModalTitle = document.querySelector("#note-modal-title");
const noteCategorySelect = document.querySelector("#note-category-select");

const pageTitles = {
  dashboard: "Dashboard",
  resources: "Resources",
  categories: "Categories",
  notes: "Notes"
};

function showStatus(message, tone = "default") {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner is-visible tone-${tone}`;
  window.clearTimeout(showStatus.timeoutId);
  showStatus.timeoutId = window.setTimeout(() => {
    statusBanner.className = "status-banner";
    statusBanner.textContent = "";
  }, 2600);
}

function markDataUpdated() {
  view.classList.remove("data-updated");
  void view.offsetWidth;
  view.classList.add("data-updated");
}

function updateSelectOptions() {
  const options = store.data.categories.map((category) => `<option value="${category.id}">${category.name}</option>`).join("");
  resourceCategorySelect.innerHTML = options;
  noteCategorySelect.innerHTML = `<option value="">No linked category</option>${options}`;
}

function getResourceById(id) {
  return store.data.resources.find((resource) => resource.id === id);
}

function getCategoryById(id) {
  return store.data.categories.find((category) => category.id === id);
}

function getNoteById(id) {
  return store.data.notes.find((note) => note.id === id);
}

function render() {
  const route = store.route;
  updateSelectOptions();
  pageTitle.textContent = pageTitles[route];
  Array.from(navLinks.querySelectorAll("a")).forEach((link) => {
    link.classList.toggle("is-active", link.dataset.route === route);
  });

  const renderMap = {
    dashboard: renderDashboard,
    resources: renderResources,
    categories: renderCategories,
    notes: renderNotes
  };

  view.classList.remove("route-enter");
  void view.offsetWidth;
  view.innerHTML = renderMap[route](store);
  view.classList.add("route-enter");
}

function openModal(modal) {
  if (!modal.open) modal.showModal();
}

function closeModal(modal) {
  if (modal.open) modal.close();
}

function openResourceModal(resource = null) {
  resourceForm.reset();
  updateSelectOptions();
  resourceModalTitle.textContent = resource ? "Edit resource" : "Create resource";
  resourceForm.elements.id.value = resource?.id || "";
  resourceForm.elements.title.value = resource?.title || "";
  resourceForm.elements.url.value = resource?.url || "";
  resourceForm.elements.description.value = resource?.description || "";
  resourceForm.elements.categoryId.value = resource?.categoryId || store.data.categories[0]?.id || "";
  resourceForm.elements.tags.value = (resource?.tags || []).join(", ");
  resourceForm.elements.type.value = resource?.type || "";
  openModal(resourceModal);
}

function openCategoryModal(category = null) {
  categoryForm.reset();
  categoryModalTitle.textContent = category ? "Edit category" : "Create category";
  categoryForm.elements.id.value = category?.id || "";
  categoryForm.elements.name.value = category?.name || "";
  categoryForm.elements.description.value = category?.description || "";
  categoryForm.elements.icon.value = category?.icon || "";
  categoryForm.elements.accent.value = category?.accent || "";
  openModal(categoryModal);
}

function openNoteModal(note = null) {
  noteForm.reset();
  updateSelectOptions();
  noteModalTitle.textContent = note ? "Edit note" : "Create note";
  noteForm.elements.id.value = note?.id || "";
  noteForm.elements.title.value = note?.title || "";
  noteForm.elements.kind.value = note?.kind || "";
  noteForm.elements.relatedCategoryId.value = note?.relatedCategoryId || "";
  noteForm.elements.content.value = note?.content || "";
  openModal(noteModal);
}

async function handleResourceSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(resourceForm).entries());
  try {
    if (payload.id) {
      await api.updateResource(payload.id, payload);
      showStatus("Resource updated in hybrid JSON storage");
    } else {
      await api.createResource(payload);
      showStatus("Resource created in hybrid JSON storage");
    }
    closeModal(resourceModal);
    await store.refresh();
    markDataUpdated();
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function handleCategorySubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(categoryForm).entries());
  try {
    if (payload.id) {
      await api.updateCategory(payload.id, payload);
      showStatus("Category updated in hybrid JSON storage");
    } else {
      await api.createCategory(payload);
      showStatus("Category created in hybrid JSON storage");
    }
    closeModal(categoryModal);
    await store.refresh();
    markDataUpdated();
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function handleNoteSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(noteForm).entries());
  try {
    if (payload.id) {
      await api.updateNote(payload.id, payload);
      showStatus("Note updated in hybrid JSON storage");
    } else {
      await api.createNote(payload);
      showStatus("Note created in hybrid JSON storage");
    }
    closeModal(noteModal);
    await store.refresh();
    markDataUpdated();
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function handleDelete(action, id, label) {
  const confirmed = window.confirm(`Delete this ${label}? This will update the JSON storage files immediately.`);
  if (!confirmed) return;

  try {
    await action(id);
    showStatus(`${label[0].toUpperCase()}${label.slice(1)} deleted`);
    await store.refresh();
    markDataUpdated();
  } catch (error) {
    showStatus(error.message, "error");
  }
}

function handleViewClick(event) {
  const target = event.target.closest("button, a");
  if (!target) return;

  const routeJump = target.dataset.routeJump;
  if (routeJump) {
    window.location.hash = `#/${routeJump}`;
    return;
  }

  const openModalType = target.dataset.openModal;
  if (openModalType === "resource") return openResourceModal();
  if (openModalType === "category") return openCategoryModal();
  if (openModalType === "note") return openNoteModal();

  const editResourceId = target.dataset.editResource;
  if (editResourceId) return openResourceModal(getResourceById(editResourceId));

  const editCategoryId = target.dataset.editCategory;
  if (editCategoryId) return openCategoryModal(getCategoryById(editCategoryId));

  const editNoteId = target.dataset.editNote;
  if (editNoteId) return openNoteModal(getNoteById(editNoteId));

  const deleteResourceId = target.dataset.deleteResource;
  if (deleteResourceId) return handleDelete(api.deleteResource, deleteResourceId, "resource");

  const deleteCategoryId = target.dataset.deleteCategory;
  if (deleteCategoryId) return handleDelete(api.deleteCategory, deleteCategoryId, "category");

  const deleteNoteId = target.dataset.deleteNote;
  if (deleteNoteId) return handleDelete(api.deleteNote, deleteNoteId, "note");
}

function attachDialogCloseHandlers() {
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      closeModal(document.getElementById(button.dataset.closeModal));
    });
  });
}

function wireEvents() {
  window.addEventListener("hashchange", () => store.setRoute(getRouteFromHash()));
  refreshDataButton.addEventListener("click", async () => {
    await store.refresh();
    showStatus("Data refreshed from hybrid JSON storage");
    markDataUpdated();
  });
  openResourceModalButton.addEventListener("click", () => openResourceModal());
  searchInput.addEventListener("input", (event) => store.setSearch(event.target.value));
  view.addEventListener("click", handleViewClick);
  resourceForm.addEventListener("submit", handleResourceSubmit);
  categoryForm.addEventListener("submit", handleCategorySubmit);
  noteForm.addEventListener("submit", handleNoteSubmit);
  attachDialogCloseHandlers();
}

async function init() {
  ensureRoute();
  wireEvents();
  store.subscribe(render);
  store.setRoute(getRouteFromHash());

  try {
    await store.init();
    render();
  } catch (error) {
    showStatus(`Unable to load data: ${error.message}`, "error");
  }
}

init();
