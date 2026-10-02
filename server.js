const http = require("http");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");

// Auto-load .env file if present
try {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile();
  } else {
    const envPath = path.join(__dirname, ".env");
    if (fsSync.existsSync(envPath)) {
      const envLines = fsSync.readFileSync(envPath, "utf8").split("\n");
      for (const line of envLines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const [k, ...v] = trimmed.split("=");
          const key = k.trim();
          const val = v.join("=").trim().replace(/^['"]|['"]$/g, "");
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
} catch {
  // Ignore .env loading errors
}

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const RESOURCES_DIR = path.join(DATA_DIR, "resources");
const META_PATH = path.join(DATA_DIR, "meta.json");
const CATEGORIES_PATH = path.join(DATA_DIR, "categories.json");
const NOTES_PATH = path.join(DATA_DIR, "notes.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_REPO = process.env.GITHUB_REPO || "";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk.toString();
      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resourceFilePath(categoryId) {
  const safeName = normalizeString(categoryId).replace(/[^a-zA-Z0-9-_]/g, "_");
  return path.join(RESOURCES_DIR, `${safeName}.json`);
}

async function readJson(filePath, fallback) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

let syncQueue = Promise.resolve();

async function syncToGitHub(filePath, dataOrNull, isDelete = false, retries = 2) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) return;

  try {
    const relativePath = path.relative(ROOT, filePath).replace(/\\/g, "/");
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${relativePath}`;
    const headers = {
      "Authorization": `token ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "ResourceOrganiser-Sync",
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate"
    };

    let sha = null;
    try {
      const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(GITHUB_BRANCH)}&_t=${Date.now()}`, {
        headers,
        cache: "no-store"
      });
      if (getRes.ok) {
        const existing = await getRes.json();
        sha = existing.sha;
      }
    } catch {
      // ignore fetch get error
    }

    if (isDelete) {
      if (!sha) return;
      const delRes = await fetch(apiUrl, {
        method: "DELETE",
        headers,
        body: JSON.stringify({
          message: `chore: delete ${relativePath}`,
          sha,
          branch: GITHUB_BRANCH
        })
      });
      if (delRes.ok) {
        console.log(`[GitHub Sync] Deleted ${relativePath} from ${GITHUB_REPO}`);
      }
      return;
    }

    const contentBase64 = Buffer.from(JSON.stringify(dataOrNull, null, 2), "utf8").toString("base64");
    const payload = {
      message: `chore(data): auto-sync ${relativePath}`,
      content: contentBase64,
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {})
    };

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify(payload)
    });

    if (putRes.ok) {
      console.log(`[GitHub Sync] Synced ${relativePath} to ${GITHUB_REPO}`);
    } else {
      const errData = await putRes.json().catch(() => ({}));
      if ((putRes.status === 409 || errData.message?.includes("expected")) && retries > 0) {
        await new Promise((r) => setTimeout(r, 600));
        return syncToGitHub(filePath, dataOrNull, isDelete, retries - 1);
      }
      console.error(`[GitHub Sync] Failed syncing ${relativePath}:`, errData.message || putRes.statusText);
    }
  } catch (err) {
    console.error(`[GitHub Sync] Error syncing ${filePath}:`, err.message);
  }
}

function queueGitHubSync(filePath, dataOrNull, isDelete = false) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) return;
  syncQueue = syncQueue
    .then(() => syncToGitHub(filePath, dataOrNull, isDelete))
    .catch((err) => console.error("[GitHub Sync Queue Error]", err));
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  queueGitHubSync(filePath, data, false);
}

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    return [value];
  }
  return [];
}

async function ensureStorage() {
  await fs.mkdir(RESOURCES_DIR, { recursive: true });

  if ((await readJson(META_PATH, null)) === null) {
    await writeJson(META_PATH, {
      title: "Resource Organiser",
      description: "Hybrid JSON-backed storage for resources, categories, and notes.",
      updatedAt: new Date().toISOString()
    });
  }

  if ((await readJson(CATEGORIES_PATH, null)) === null) {
    await writeJson(CATEGORIES_PATH, []);
  }

  if ((await readJson(NOTES_PATH, null)) === null) {
    await writeJson(NOTES_PATH, []);
  }
}

async function updateMetaTimestamp() {
  const meta = await readJson(META_PATH, {});
  meta.updatedAt = new Date().toISOString();
  await writeJson(META_PATH, meta);
}

async function getCategories() {
  return ensureArray(await readJson(CATEGORIES_PATH, []));
}

async function saveCategories(categories) {
  await writeJson(CATEGORIES_PATH, categories);
  await updateMetaTimestamp();
}

async function getNotes() {
  return ensureArray(await readJson(NOTES_PATH, []));
}

async function saveNotes(notes) {
  await writeJson(NOTES_PATH, notes);
  await updateMetaTimestamp();
}

async function getResourcesForCategory(categoryId) {
  return ensureArray(await readJson(resourceFilePath(categoryId), []));
}

async function saveResourcesForCategory(categoryId, resources) {
  await writeJson(resourceFilePath(categoryId), resources);
  await updateMetaTimestamp();
}

async function deleteResourceFile(categoryId) {
  const filePath = resourceFilePath(categoryId);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  await updateMetaTimestamp();
  queueGitHubSync(filePath, null, true);
}

async function getAllResources(categories) {
  const groups = await Promise.all(categories.map((category) => getResourcesForCategory(category.id)));
  return groups.flat();
}

async function readDatabase() {
  await ensureStorage();
  const [meta, categories, notes] = await Promise.all([
    readJson(META_PATH, {}),
    getCategories(),
    getNotes()
  ]);
  const resources = await getAllResources(categories);
  return { meta, categories, resources, notes };
}

async function findResource(resourceId) {
  const categories = await getCategories();

  for (const category of categories) {
    const resources = await getResourcesForCategory(category.id);
    const index = resources.findIndex((resource) => resource.id === resourceId);
    if (index !== -1) {
      return { categoryId: category.id, resources, index, resource: resources[index] };
    }
  }

  return null;
}

async function serveStatic(requestPath, response) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const fullPath = path.join(PUBLIC_DIR, safePath);
  const normalized = path.normalize(fullPath);

  if (!normalized.startsWith(PUBLIC_DIR)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(normalized);
    const extension = path.extname(normalized);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream"
    });
    response.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      try {
        const file = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(file);
      } catch {
        sendText(response, 500, "Unable to load app");
      }
      return;
    }

    sendText(response, 500, "Server error");
  }
}

async function createCategory(request, response) {
  const body = await readBody(request);
  const name = normalizeString(body.name);
  if (!name) {
    sendJson(response, 400, { error: "Category name is required" });
    return true;
  }

  const categories = await getCategories();
  const category = {
    id: makeId("cat"),
    name,
    description: normalizeString(body.description),
    icon: normalizeString(body.icon) || "spark",
    accent: normalizeString(body.accent) || "teal"
  };

  categories.unshift(category);
  await saveCategories(categories);
  await saveResourcesForCategory(category.id, []);
  sendJson(response, 201, category);
  return true;
}

async function createResource(request, response) {
  const body = await readBody(request);
  const title = normalizeString(body.title);
  const categoryId = normalizeString(body.categoryId);

  if (!title || !categoryId) {
    sendJson(response, 400, { error: "Resource title and category are required" });
    return true;
  }

  const categories = await getCategories();
  if (!categories.some((category) => category.id === categoryId)) {
    sendJson(response, 400, { error: "Selected category does not exist" });
    return true;
  }

  const now = new Date().toISOString();
  const resource = {
    id: makeId("res"),
    title,
    url: normalizeString(body.url),
    description: normalizeString(body.description),
    categoryId,
    tags: Array.isArray(body.tags)
      ? body.tags.map(normalizeString).filter(Boolean)
      : normalizeString(body.tags).split(",").map((tag) => tag.trim()).filter(Boolean),
    type: normalizeString(body.type) || "resource",
    createdAt: now,
    updatedAt: now
  };

  const resources = await getResourcesForCategory(categoryId);
  resources.unshift(resource);
  await saveResourcesForCategory(categoryId, resources);
  sendJson(response, 201, resource);
  return true;
}

async function createNote(request, response) {
  const body = await readBody(request);
  const title = normalizeString(body.title);
  const content = normalizeString(body.content);

  if (!title || !content) {
    sendJson(response, 400, { error: "Note title and content are required" });
    return true;
  }

  const now = new Date().toISOString();
  const notes = await getNotes();
  const note = {
    id: makeId("note"),
    title,
    kind: normalizeString(body.kind) || "note",
    content,
    relatedCategoryId: normalizeString(body.relatedCategoryId),
    createdAt: now,
    updatedAt: now
  };

  notes.unshift(note);
  await saveNotes(notes);
  sendJson(response, 201, note);
  return true;
}

async function handleCollectionCreate(request, response, pathname) {
  if (request.method === "POST" && pathname === "/api/categories") {
    return createCategory(request, response);
  }

  if (request.method === "POST" && pathname === "/api/resources") {
    return createResource(request, response);
  }

  if (request.method === "POST" && pathname === "/api/notes") {
    return createNote(request, response);
  }

  return false;
}

async function handleCategoryItem(request, response, categoryId) {
  const categories = await getCategories();
  const index = categories.findIndex((item) => item.id === categoryId);
  if (index === -1) {
    sendJson(response, 404, { error: "Not found" });
    return true;
  }

  if (request.method === "PATCH") {
    const body = await readBody(request);
    categories[index] = {
      ...categories[index],
      name: normalizeString(body.name) || categories[index].name,
      description: normalizeString(body.description),
      icon: normalizeString(body.icon) || categories[index].icon,
      accent: normalizeString(body.accent) || categories[index].accent
    };
    await saveCategories(categories);
    sendJson(response, 200, categories[index]);
    return true;
  }

  if (request.method === "DELETE") {
    categories.splice(index, 1);
    await saveCategories(categories);
    await deleteResourceFile(categoryId);

    const notes = await getNotes();
    const updatedNotes = notes.map((note) =>
      note.relatedCategoryId === categoryId ? { ...note, relatedCategoryId: "" } : note
    );
    await saveNotes(updatedNotes);
    sendJson(response, 200, { ok: true });
    return true;
  }

  return false;
}

async function handleResourceItem(request, response, resourceId) {
  const located = await findResource(resourceId);
  if (!located) {
    sendJson(response, 404, { error: "Not found" });
    return true;
  }

  if (request.method === "PATCH") {
    const body = await readBody(request);
    const nextCategoryId = normalizeString(body.categoryId) || located.resource.categoryId;
    const updatedResource = {
      ...located.resource,
      title: normalizeString(body.title) || located.resource.title,
      url: normalizeString(body.url),
      description: normalizeString(body.description),
      categoryId: nextCategoryId,
      tags: Array.isArray(body.tags)
        ? body.tags.map(normalizeString).filter(Boolean)
        : normalizeString(body.tags).split(",").map((tag) => tag.trim()).filter(Boolean),
      type: normalizeString(body.type) || located.resource.type,
      updatedAt: new Date().toISOString()
    };

    if (nextCategoryId === located.categoryId) {
      located.resources[located.index] = updatedResource;
      await saveResourcesForCategory(located.categoryId, located.resources);
      sendJson(response, 200, updatedResource);
      return true;
    }

    const categories = await getCategories();
    if (!categories.some((category) => category.id === nextCategoryId)) {
      sendJson(response, 400, { error: "Selected category does not exist" });
      return true;
    }

    located.resources.splice(located.index, 1);
    await saveResourcesForCategory(located.categoryId, located.resources);

    const targetResources = await getResourcesForCategory(nextCategoryId);
    targetResources.unshift(updatedResource);
    await saveResourcesForCategory(nextCategoryId, targetResources);
    sendJson(response, 200, updatedResource);
    return true;
  }

  if (request.method === "DELETE") {
    located.resources.splice(located.index, 1);
    await saveResourcesForCategory(located.categoryId, located.resources);
    sendJson(response, 200, { ok: true });
    return true;
  }

  return false;
}

async function handleNoteItem(request, response, noteId) {
  const notes = await getNotes();
  const index = notes.findIndex((item) => item.id === noteId);
  if (index === -1) {
    sendJson(response, 404, { error: "Not found" });
    return true;
  }

  if (request.method === "PATCH") {
    const body = await readBody(request);
    notes[index] = {
      ...notes[index],
      title: normalizeString(body.title) || notes[index].title,
      content: normalizeString(body.content) || notes[index].content,
      kind: normalizeString(body.kind) || notes[index].kind,
      relatedCategoryId: normalizeString(body.relatedCategoryId),
      updatedAt: new Date().toISOString()
    };
    await saveNotes(notes);
    sendJson(response, 200, notes[index]);
    return true;
  }

  if (request.method === "DELETE") {
    notes.splice(index, 1);
    await saveNotes(notes);
    sendJson(response, 200, { ok: true });
    return true;
  }

  return false;
}

async function handleCollectionItem(request, response, pathname) {
  const categoryMatch = pathname.match(/^\/api\/categories\/([^/]+)$/);
  if (categoryMatch) {
    return handleCategoryItem(request, response, decodeURIComponent(categoryMatch[1]));
  }

  const resourceMatch = pathname.match(/^\/api\/resources\/([^/]+)$/);
  if (resourceMatch) {
    return handleResourceItem(request, response, decodeURIComponent(resourceMatch[1]));
  }

  const noteMatch = pathname.match(/^\/api\/notes\/([^/]+)$/);
  if (noteMatch) {
    return handleNoteItem(request, response, decodeURIComponent(noteMatch[1]));
  }

  return false;
}

async function handleGithubApi(request, response, pathname) {
  if (pathname === "/api/github/status" && request.method === "GET") {
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
      sendJson(response, 200, {
        configured: false,
        message: "GITHUB_TOKEN or GITHUB_REPO not configured in .env"
      });
      return true;
    }

    try {
      const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
        headers: {
          "Authorization": `token ${GITHUB_TOKEN}`,
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "ResourceOrganiser-Sync"
        }
      });

      if (!ghRes.ok) {
        const errData = await ghRes.json().catch(() => ({}));
        sendJson(response, 200, {
          configured: true,
          connected: false,
          repo: GITHUB_REPO,
          branch: GITHUB_BRANCH,
          error: errData.message || ghRes.statusText
        });
        return true;
      }

      const repoData = await ghRes.json();
      sendJson(response, 200, {
        configured: true,
        connected: true,
        repo: GITHUB_REPO,
        branch: GITHUB_BRANCH,
        repoName: repoData.full_name,
        isPrivate: repoData.private,
        defaultBranch: repoData.default_branch,
        htmlUrl: repoData.html_url,
        updatedAt: repoData.updated_at
      });
      return true;
    } catch (err) {
      sendJson(response, 200, {
        configured: true,
        connected: false,
        repo: GITHUB_REPO,
        branch: GITHUB_BRANCH,
        error: err.message
      });
      return true;
    }
  }

  if (pathname === "/api/github/sync" && request.method === "POST") {
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
      sendJson(response, 400, { error: "GitHub credentials not configured in .env" });
      return true;
    }

    try {
      const db = await readDatabase();
      await syncToGitHub(META_PATH, db.meta);
      await syncToGitHub(CATEGORIES_PATH, db.categories);
      await syncToGitHub(NOTES_PATH, db.notes);

      for (const cat of db.categories) {
        const catRes = await getResourcesForCategory(cat.id);
        await syncToGitHub(resourceFilePath(cat.id), catRes);
      }

      sendJson(response, 200, {
        ok: true,
        message: `Successfully synchronized database and notes to ${GITHUB_REPO} (${GITHUB_BRANCH})`
      });
      return true;
    } catch (err) {
      sendJson(response, 500, { error: err.message });
      return true;
    }
  }

  const pushNoteMatch = pathname.match(/^\/api\/github\/push-note\/([^/]+)$/);
  if (pushNoteMatch && request.method === "POST") {
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
      sendJson(response, 400, { error: "GitHub credentials not configured in .env" });
      return true;
    }

    const noteId = decodeURIComponent(pushNoteMatch[1]);
    const notes = await getNotes();
    const note = notes.find((n) => n.id === noteId);
    if (!note) {
      sendJson(response, 404, { error: "Note not found" });
      return true;
    }

    const categories = await getCategories();
    const cat = categories.find((c) => c.id === note.relatedCategoryId);
    const categoryName = cat ? cat.name : "Uncategorized";

    const safeTitle = note.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || note.id;
    const notePath = `notes/${safeTitle}.md`;

    const mdContent = `---
id: "${note.id}"
title: "${note.title.replace(/"/g, '\\"')}"
kind: "${note.kind || "note"}"
category: "${categoryName}"
createdAt: "${note.createdAt}"
updatedAt: "${note.updatedAt}"
---

# ${note.title}

${note.content}
`;

    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${notePath}`;
    const headers = {
      "Authorization": `token ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "ResourceOrganiser-Sync",
      "Content-Type": "application/json"
    };

    let sha = null;
    try {
      const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(GITHUB_BRANCH)}&_t=${Date.now()}`, {
        headers,
        cache: "no-store"
      });
      if (getRes.ok) {
        const existing = await getRes.json();
        sha = existing.sha;
      }
    } catch {
      // ignore
    }

    const contentBase64 = Buffer.from(mdContent, "utf8").toString("base64");
    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `docs(notes): update ${note.title} [Markdown]`,
        content: contentBase64,
        branch: GITHUB_BRANCH,
        ...(sha ? { sha } : {})
      })
    });

    if (!putRes.ok) {
      const errData = await putRes.json().catch(() => ({}));
      sendJson(response, putRes.status, {
        error: errData.message || "Failed to push note markdown to GitHub"
      });
      return true;
    }

    const resultData = await putRes.json();
    sendJson(response, 200, {
      ok: true,
      path: notePath,
      url: resultData.content?.html_url || `https://github.com/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${notePath}`,
      message: `Pushed "${note.title}" markdown file to GitHub successfully!`
    });
    return true;
  }

  return false;
}

async function handleApi(request, response, pathname) {
  await ensureStorage();

  if (request.method === "GET" && pathname === "/api/data") {
    sendJson(response, 200, await readDatabase());
    return;
  }

  if (await handleGithubApi(request, response, pathname)) {
    return;
  }

  if (await handleCollectionCreate(request, response, pathname)) {
    return;
  }

  if (await handleCollectionItem(request, response, pathname)) {
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url.pathname);
      return;
    }
    await serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Unexpected server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Resource Organiser running at http://localhost:${PORT}`);
  if (GITHUB_TOKEN && GITHUB_REPO) {
    console.log(`[GitHub Sync] Active -> Auto-syncing changes to ${GITHUB_REPO} (branch: ${GITHUB_BRANCH})`);
  } else {
    console.log(`[GitHub Sync] Inactive (No GITHUB_TOKEN or GITHUB_REPO configured)`);
  }
});
