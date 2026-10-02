function getCategoryMap(categories) {
  return new Map(categories.map((category) => [category.id, category]));
}

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createEmptyState(title, copy, actionLabel, actionType) {
  return `
    <div class="empty-state">
      <p class="eyebrow">No data found</p>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(copy)}</p>
      ${actionLabel ? `<button class="primary-button" data-open-modal="${actionType}" type="button">${escapeHtml(actionLabel)}</button>` : ""}
    </div>
  `;
}

function matchesSearch(resource, search) {
  if (!search) return true;
  const haystack = [resource.title, resource.url, resource.description, resource.type, ...(resource.tags || [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(search);
}

function noteMatchesSearch(note, search) {
  if (!search) return true;
  return [note.title, note.content, note.kind].join(" ").toLowerCase().includes(search);
}

export function renderDashboard(store) {
  const { categories, resources, notes, meta } = store.data;
  const filteredResources = resources.filter((resource) => matchesSearch(resource, store.search));
  const recentResources = filteredResources.slice(0, 5);
  const categoryMap = getCategoryMap(categories);

  return `
    <section class="hero-grid">
      <article class="hero-card">
        <p class="eyebrow">Overview</p>
        <h3>Build a live catalogue for everything you collect.</h3>
        <div class="accent-line"></div>
        <p>
          This interface turns your notes into a dynamic workspace. Routing feels like a real app,
          CRUD updates persist into the local JSON file, and the layout stays calm enough for everyday scanning.
        </p>
        <div class="quick-actions">
          <button class="primary-button" data-route-jump="resources" type="button">Browse resources</button>
          <button class="ghost-button" data-open-modal="resource" type="button">Create resource</button>
          <button class="ghost-button" data-open-modal="note" type="button">Save note</button>
        </div>
      </article>

      <article class="content-card">
        <p class="eyebrow">Database status</p>
        <h3>JSON-backed and ready</h3>
        <p>Last sync: ${new Date(meta.updatedAt).toLocaleString()}</p>
        <div class="chip-row">
          <span class="badge">data/data.json</span>
          <span class="badge">${resources.length} resources</span>
          <span class="badge">${categories.length} categories</span>
          <span class="badge">${notes.length} notes</span>
        </div>
      </article>
    </section>

    <section class="stats-grid">
      <article class="stat-card"><p class="eyebrow">Resources</p><div class="stat-value">${resources.length}</div><p class="stat-copy">Links, tools, and saved references.</p></article>
      <article class="stat-card"><p class="eyebrow">Categories</p><div class="stat-value">${categories.length}</div><p class="stat-copy">Organized lanes for fast scanning.</p></article>
      <article class="stat-card"><p class="eyebrow">Notes</p><div class="stat-value">${notes.length}</div><p class="stat-copy">Prompts, snippets, and context saved beside your tools.</p></article>
    </section>

    <section class="feature-grid">
      <article class="feature-card"><p class="eyebrow">Routing</p><h4>Smooth section switching</h4><p>Hash-based routing keeps the app lightweight while still feeling like a product.</p></article>
      <article class="feature-card"><p class="eyebrow">Persistence</p><h4>Real file updates</h4><p>Creating, editing, and deleting items writes back to your local JSON file through the Node server.</p></article>
      <article class="feature-card"><p class="eyebrow">Design</p><h4>Editorial resource cards</h4><p>White canvas, signature surfaces, and tidy controls keep the workspace readable without visual noise.</p></article>
    </section>

    <section class="content-grid">
      <article class="content-card">
        <div class="toolbar">
          <div><p class="eyebrow">Recent resources</p><h3>Quick scan</h3></div>
          <button class="ghost-button" data-route-jump="resources" type="button">Open full list</button>
        </div>
        <div class="list-stack">
          ${
            recentResources.length
              ? recentResources
                  .map(
                    (resource) => `
                    <article class="table-like-row">
                      <div><h4>${escapeHtml(resource.title)}</h4><p>${escapeHtml(resource.description || "No description yet.")}</p></div>
                      <div><span class="type-pill">${escapeHtml(resource.type || "resource")}</span></div>
                      <div><span class="badge">${escapeHtml(categoryMap.get(resource.categoryId)?.name || "Unassigned")}</span></div>
                      <div class="card-actions">
                        <button class="ghost-button" data-edit-resource="${resource.id}" type="button">Edit</button>
                        <button class="danger-button" data-delete-resource="${resource.id}" type="button">Delete</button>
                      </div>
                    </article>
                  `
                  )
                  .join("")
              : createEmptyState("No resources match the current search.", "Try changing the search term or add a new resource.", "Add resource", "resource")
          }
        </div>
      </article>

      <article class="content-card">
        <div class="toolbar">
          <div><p class="eyebrow">Categories</p><h3>Structure</h3></div>
          <button class="ghost-button" data-open-modal="category" type="button">New category</button>
        </div>
        <div class="list-stack">
          ${categories
            .slice(0, 5)
            .map((category) => {
              const total = resources.filter((resource) => resource.categoryId === category.id).length;
              return `
                <article class="table-like-row">
                  <div><h4>${escapeHtml(category.name)}</h4><p>${escapeHtml(category.description || "No description yet.")}</p></div>
                  <div><span class="badge">${escapeHtml(category.icon || "icon")}</span></div>
                  <div><span class="badge">${total} items</span></div>
                  <div class="card-actions"><button class="ghost-button" data-edit-category="${category.id}" type="button">Edit</button></div>
                </article>
              `;
            })
            .join("")}
        </div>
      </article>
    </section>
  `;
}

export function renderResources(store) {
  const { categories, resources } = store.data;
  const categoryMap = getCategoryMap(categories);
  const filtered = resources.filter((resource) => matchesSearch(resource, store.search));

  if (!filtered.length) {
    return createEmptyState("No resources found", "There are no resources matching the current filters. Add one to start building out the collection.", "Add resource", "resource");
  }

  return `
    <section class="toolbar">
      <button class="primary-button" data-open-modal="resource" type="button">Create resource</button>
      <button class="ghost-button" data-route-jump="categories" type="button">Manage categories</button>
    </section>
    <section class="resource-grid">
      ${filtered
        .map(
          (resource) => `
          <article class="resource-card">
            <p class="eyebrow">${escapeHtml(categoryMap.get(resource.categoryId)?.name || "Unassigned")}</p>
            <h4>${escapeHtml(resource.title)}</h4>
            <p>${escapeHtml(resource.description || "No description provided.")}</p>
            <div class="resource-meta">
              <span class="type-pill">${escapeHtml(resource.type || "resource")}</span>
              ${(resource.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
            </div>
            <div class="card-footer">
              <div class="card-actions card-actions--split">
                ${resource.url ? `<a class="ghost-button" href="${escapeHtml(resource.url)}" target="_blank" rel="noreferrer">Visit</a>` : ""}
              </div>
              <div class="card-actions card-actions--end">
                <button class="ghost-button" data-edit-resource="${resource.id}" type="button">Edit</button>
                <button class="danger-button" data-delete-resource="${resource.id}" type="button">Delete</button>
              </div>
            </div>
          </article>
        `
        )
        .join("")}
    </section>
  `;
}

export function renderCategories(store) {
  const { categories, resources } = store.data;

  if (!categories.length) {
    return createEmptyState("No categories yet", "Add a category to start organizing the resources.", "Add category", "category");
  }

  return `
    <section class="toolbar">
      <button class="primary-button" data-open-modal="category" type="button">Create category</button>
      <button class="ghost-button" data-route-jump="resources" type="button">Open resources</button>
    </section>
    <section class="category-grid">
      ${categories
        .map((category) => {
          const count = resources.filter((resource) => resource.categoryId === category.id).length;
          return `
            <article class="category-card">
              <p class="eyebrow">${escapeHtml(category.accent || "accent")} accent</p>
              <h4>${escapeHtml(category.name)}</h4>
              <p>${escapeHtml(category.description || "No description provided.")}</p>
              <div class="category-meta">
                <span class="badge">${escapeHtml(category.icon || "icon")}</span>
                <span class="badge">${count} resources</span>
              </div>
              <div class="card-footer">
                <div class="card-actions card-actions--end">
                <button class="ghost-button" data-edit-category="${category.id}" type="button">Edit</button>
                <button class="danger-button" data-delete-category="${category.id}" type="button">Delete</button>
                </div>
              </div>
            </article>
          `;
        })
        .join("")}
    </section>
  `;
}

export function renderNotes(store) {
  const { categories, notes } = store.data;
  const categoryMap = getCategoryMap(categories);
  const filtered = notes.filter((note) => noteMatchesSearch(note, store.search));

  if (!filtered.length) {
    return createEmptyState("No notes found", "Save a prompt, snippet, or checklist so it stays alongside the resources.", "Add note", "note");
  }

  return `
    <section class="toolbar">
      <button class="primary-button" data-open-modal="note" type="button">+ Create note</button>
      <button class="ghost-button" data-route-jump="dashboard" type="button">Back to dashboard</button>
    </section>
    <section class="note-grid">
      ${filtered
        .map(
          (note) => `
          <article class="note-card">
            <div class="note-card-top">
              <p class="eyebrow">${escapeHtml(note.kind || "note")}</p>
              <h4>${escapeHtml(note.title)}</h4>
            </div>
            <p class="note-card-excerpt">${escapeHtml(note.content || "")}</p>
            <div class="note-meta">
              <span class="badge">${escapeHtml(categoryMap.get(note.relatedCategoryId)?.name || "No linked category")}</span>
            </div>
            <div class="card-footer">
              <div class="card-actions">
                <a class="primary-button btn-view-note" href="#/notes/${encodeURIComponent(note.id)}" data-view-note="${note.id}">View</a>
              </div>
              <div class="card-actions card-actions--end">
                <button class="ghost-button" data-edit-note="${note.id}" type="button" title="Edit in Toast UI Editor">Edit</button>
                <button class="danger-button" data-delete-note="${note.id}" type="button">Delete</button>
              </div>
            </div>
          </article>
        `
        )
        .join("")}
    </section>
  `;
}

export function renderNoteDetail(store) {
  const { notes, categories } = store.data;
  const noteId = store.routeParam;
  const note = notes.find((n) => n.id === noteId);
  const categoryMap = getCategoryMap(categories);

  if (!note) {
    return createEmptyState(
      "Note not found",
      "The requested note does not exist or may have been removed.",
      "Back to notes",
      "notes"
    );
  }

  const categoryName = categoryMap.get(note.relatedCategoryId)?.name || "No linked category";
  const updatedDate = new Date(note.updatedAt || note.createdAt || Date.now()).toLocaleString();
  const wordCount = (note.content || "").trim().split(/\s+/).filter(Boolean).length;

  return `
    <article class="note-detail-wrapper">
      <div class="note-detail-top-nav">
        <button class="ghost-button back-nav-btn" data-route-jump="notes" type="button">
          ← Back to Notes
        </button>
        <div class="note-detail-meta-pills">
          <span class="type-pill">${escapeHtml(note.kind || "note")}</span>
          <span class="badge">${escapeHtml(categoryName)}</span>
          <span class="meta-timestamp">Updated ${escapeHtml(updatedDate)}</span>
        </div>
      </div>

      <header class="note-detail-hero">
        <div class="note-detail-header-text">
          <p class="eyebrow">${escapeHtml(note.kind || "markdown document")}</p>
          <h1 class="note-detail-heading">${escapeHtml(note.title)}</h1>
        </div>

        <div class="note-detail-actions-bar">
          <button class="primary-button" data-edit-note="${note.id}" type="button">
            ✏️ Edit Note
          </button>
          <button class="ghost-button" data-copy-markdown="${note.id}" type="button">
            📋 Copy Markdown
          </button>
          <button class="danger-button" data-delete-note="${note.id}" type="button">
            Delete
          </button>
        </div>
      </header>

      <section class="note-detail-content-card">
        <div class="viewer-top-bar">
          <div class="viewer-mode-badge">
            <span class="viewer-dot"></span> Markdown Rendered View
          </div>
          <span class="viewer-stats">${wordCount} words &bull; ${note.content ? note.content.length : 0} characters</span>
        </div>
        <div id="toastui-viewer-target" class="note-markdown-rendered-view" data-note-id="${note.id}">
          <!-- Toast UI Editor Viewer will be mounted here -->
        </div>
      </section>
    </article>
  `;
}
