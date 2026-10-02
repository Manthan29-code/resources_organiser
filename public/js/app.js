import { api } from "./api.js";
import { getRouteFromHash, ensureRoute } from "./router.js";
import { renderCategories, renderDashboard, renderNotes, renderNoteDetail, renderResources } from "./renderers.js";
import { store } from "./store.js";

const view = document.querySelector("#view");
const pageTitle = document.querySelector("#page-title");
const pageEyebrow = document.querySelector("#page-eyebrow");
const navLinks = document.querySelector("#nav-links");
const searchInput = document.querySelector("#global-search");
const statusBanner = document.querySelector("#status-banner");
const refreshDataButton = document.querySelector("#refresh-data-btn");
const openResourceModalButton = document.querySelector("#open-resource-modal");
const openNoteModalButton = document.querySelector("#open-note-modal-btn");
const githubStatusIndicator = document.querySelector("#github-status-indicator");

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

let toastEditorInstance = null;

const pageTitles = {
  dashboard: "Dashboard",
  resources: "Resources",
  categories: "Categories",
  notes: "Notes",
  "note-detail": "Note Details"
};

function showStatus(message, tone = "default") {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner is-visible tone-${tone}`;
  window.clearTimeout(showStatus.timeoutId);
  showStatus.timeoutId = window.setTimeout(() => {
    statusBanner.className = "status-banner";
    statusBanner.textContent = "";
  }, 3200);
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

function initToastEditorIfNeeded() {
  if (toastEditorInstance) return toastEditorInstance;
  const container = document.querySelector("#toastui-note-editor");
  if (!container || !window.toastui || !window.toastui.Editor) return null;

  try {
    toastEditorInstance = new window.toastui.Editor({
      el: container,
      height: "360px",
      initialEditType: "wysiwyg",
      previewStyle: "vertical",
      usageStatistics: false,
      placeholder: "Write your note in rich text or raw Markdown...",
      toolbarItems: [
        ["heading", "bold", "italic", "strike"],
        ["hr", "quote"],
        ["ul", "ol", "task", "indent", "outdent"],
        ["table", "image", "link"],
        ["code", "codeblock"]
      ]
    });
    return toastEditorInstance;
  } catch (err) {
    console.error("Error initializing Toast UI Editor:", err);
    return null;
  }
}

function updateGithubStatusIndicator() {
  if (!githubStatusIndicator) return;
  const gh = store.githubStatus;
  const label = githubStatusIndicator.querySelector(".status-label");

  if (!gh || !gh.configured) {
    githubStatusIndicator.className = "github-status-pill status-disabled";
    label.textContent = "GitHub Sync: Inactive";
    return;
  }

  if (gh.connected) {
    githubStatusIndicator.className = "github-status-pill status-active";
    label.textContent = `Auto-sync: ${gh.repo.split("/")[1] || gh.repo}`;
  } else {
    githubStatusIndicator.className = "github-status-pill status-error";
    label.textContent = "GitHub Sync: Error";
  }
}

function render() {
  const route = store.route;
  updateSelectOptions();
  updateGithubStatusIndicator();

  if (pageTitle) {
    pageTitle.textContent = pageTitles[route] || "Resource Organiser";
  }
  if (pageEyebrow) {
    pageEyebrow.textContent = route === "note-detail" ? "Markdown Note View" : "Local resource system";
  }

  Array.from(navLinks.querySelectorAll("a")).forEach((link) => {
    link.classList.toggle("is-active", link.dataset.route === route || (route === "note-detail" && link.dataset.route === "notes"));
  });

  const renderMap = {
    dashboard: renderDashboard,
    resources: renderResources,
    categories: renderCategories,
    notes: renderNotes,
    "note-detail": renderNoteDetail
  };

  view.classList.remove("route-enter");
  void view.offsetWidth;
  const renderer = renderMap[route] || renderDashboard;
  view.innerHTML = renderer(store);
  view.classList.add("route-enter");

  // If in note-detail view, mount Toast UI Markdown viewer
  if (route === "note-detail") {
    const viewerTarget = document.querySelector("#toastui-viewer-target");
    if (viewerTarget && window.toastui && window.toastui.Editor) {
      const currentNote = store.data.notes.find((n) => n.id === store.routeParam);
      if (currentNote) {
        viewerTarget.innerHTML = "";
        try {
          window.toastui.Editor.factory({
            el: viewerTarget,
            viewer: true,
            initialValue: currentNote.content || "*No content provided.*"
          });
        } catch (e) {
          console.error("Toast UI Viewer error:", e);
          viewerTarget.textContent = currentNote.content;
        }
      }
    }
  }
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
  
  openModal(noteModal);

  const editor = initToastEditorIfNeeded();
  if (editor) {
    editor.setMarkdown(note?.content || "");
    setTimeout(() => {
      if (editor.isWysiwygMode()) {
        editor.changeMode("wysiwyg", true);
      }
    }, 50);
  }
}

async function handleResourceSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(resourceForm).entries());
  try {
    if (payload.id) {
      await api.updateResource(payload.id, payload);
      showStatus("Resource updated & auto-synced to GitHub");
    } else {
      await api.createResource(payload);
      showStatus("Resource created & auto-synced to GitHub");
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
      showStatus("Category updated & auto-synced to GitHub");
    } else {
      await api.createCategory(payload);
      showStatus("Category created & auto-synced to GitHub");
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
  const formData = new FormData(noteForm);
  const payload = Object.fromEntries(formData.entries());

  if (toastEditorInstance) {
    payload.content = toastEditorInstance.getMarkdown();
  }

  if (!payload.title || !payload.content) {
    showStatus("Note title and content are required", "error");
    return;
  }

  try {
    if (payload.id) {
      await api.updateNote(payload.id, payload);
      showStatus("Note saved & auto-synced to GitHub");
    } else {
      await api.createNote(payload);
      showStatus("Note created & auto-synced to GitHub");
    }
    closeModal(noteModal);
    await store.refresh();
    markDataUpdated();
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function handleDelete(action, id, label) {
  const confirmed = window.confirm(`Delete this ${label}? This will update local storage and auto-sync to GitHub.`);
  if (!confirmed) return;

  try {
    await action(id);
    showStatus(`${label[0].toUpperCase()}${label.slice(1)} deleted & auto-synced`);
    await store.refresh();
    markDataUpdated();
    if (store.route === "note-detail") {
      window.location.hash = "#/notes";
    }
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function handleCopyMarkdown(noteId) {
  const note = getNoteById(noteId);
  if (!note || !note.content) return;

  try {
    await navigator.clipboard.writeText(note.content);
    showStatus("Markdown copied to clipboard! 📋");
  } catch {
    showStatus("Failed to copy markdown to clipboard", "error");
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

  const copyMarkdownId = target.dataset.copyMarkdown;
  if (copyMarkdownId) return handleCopyMarkdown(copyMarkdownId);

  const viewNoteId = target.dataset.viewNote;
  if (viewNoteId) {
    window.location.hash = `#/notes/${encodeURIComponent(viewNoteId)}`;
    return;
  }
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
    showStatus("Data refreshed from local JSON storage");
    markDataUpdated();
  });

  openResourceModalButton?.addEventListener("click", () => openResourceModal());
  openNoteModalButton?.addEventListener("click", () => openNoteModal());

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
