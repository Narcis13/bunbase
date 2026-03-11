/**
 * Trello-like Task Management Backend Setup
 *
 * Uses BunBase to create a full Kanban board backend with:
 * - Users (auth), Boards, Lists, Cards, Labels, Checklists, Comments, Activity
 *
 * Usage:
 *   JWT_SECRET=your-secret bun trello-backend/setup.ts
 *
 * Then start the server:
 *   JWT_SECRET=your-secret bunbase serve --port 8090 --db trello.db
 */

const HOST = process.env.TRELLO_HOST || "http://localhost:8090";
const DB = process.env.BUNBASE_DB || "trello.db";

async function adminLogin(): Promise<string> {
  // Get admin password from env or use default
  const password = process.env.BUNBASE_ADMIN_PASSWORD;
  if (!password) {
    console.error("Set BUNBASE_ADMIN_PASSWORD to the admin password shown at server startup");
    process.exit(1);
  }

  const res = await fetch(`${HOST}/_/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@bunbase.local", password }),
  });

  if (!res.ok) throw new Error(`Admin login failed: ${await res.text()}`);
  const { token } = await res.json();
  return token;
}

async function api(token: string, method: string, path: string, body?: any) {
  const res = await fetch(`${HOST}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}

async function setup() {
  console.log("Logging in as admin...");
  const token = await adminLogin();

  // Check existing collections
  const existing = await api(token, "GET", "/_/api/collections");
  const existingNames = new Set(existing.map((c: any) => c.name));

  // ── 1. Users (auth collection) ──────────────────────────────────────
  if (!existingNames.has("users")) {
    console.log("Creating 'users' collection...");
    await api(token, "POST", "/_/api/collections", {
      name: "users",
      type: "auth",
      fields: [
        { name: "display_name", type: "text" },
        { name: "avatar", type: "file", options: { maxFiles: 1, maxSize: 2097152 } },
      ],
    });
  }

  // ── 2. Boards ───────────────────────────────────────────────────────
  if (!existingNames.has("boards")) {
    console.log("Creating 'boards' collection...");
    await api(token, "POST", "/_/api/collections", {
      name: "boards",
      type: "base",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "background_color", type: "text" },
        { name: "owner", type: "relation", required: true, options: { collection: "users" } },
        { name: "is_archived", type: "boolean" },
      ],
    });
  }

  // ── 3. Board Members ────────────────────────────────────────────────
  if (!existingNames.has("board_members")) {
    console.log("Creating 'board_members' collection...");
    await api(token, "POST", "/_/api/collections", {
      name: "board_members",
      type: "base",
      fields: [
        { name: "board", type: "relation", required: true, options: { collection: "boards" } },
        { name: "user", type: "relation", required: true, options: { collection: "users" } },
        { name: "role", type: "text", required: true }, // "admin" | "member" | "viewer"
      ],
    });
  }

  // ── 4. Lists ────────────────────────────────────────────────────────
  if (!existingNames.has("lists")) {
    console.log("Creating 'lists' collection...");
    await api(token, "POST", "/_/api/collections", {
      name: "lists",
      type: "base",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "board", type: "relation", required: true, options: { collection: "boards" } },
        { name: "position", type: "number", required: true },
        { name: "is_archived", type: "boolean" },
      ],
    });
  }

  // ── 5. Labels ───────────────────────────────────────────────────────
  if (!existingNames.has("labels")) {
    console.log("Creating 'labels' collection...");
    await api(token, "POST", "/_/api/collections", {
      name: "labels",
      type: "base",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "color", type: "text", required: true },
        { name: "board", type: "relation", required: true, options: { collection: "boards" } },
      ],
    });
  }

  // ── 6. Cards ────────────────────────────────────────────────────────
  if (!existingNames.has("cards")) {
    console.log("Creating 'cards' collection...");
    await api(token, "POST", "/_/api/collections", {
      name: "cards",
      type: "base",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "list", type: "relation", required: true, options: { collection: "lists" } },
        { name: "position", type: "number", required: true },
        { name: "assignee", type: "relation", options: { collection: "users" } },
        { name: "due_date", type: "datetime" },
        { name: "labels", type: "json" }, // array of label IDs
        { name: "cover_color", type: "text" },
        { name: "is_archived", type: "boolean" },
        { name: "attachment", type: "file", options: { maxFiles: 5, maxSize: 10485760 } },
      ],
    });
  }

  // ── 7. Checklists ──────────────────────────────────────────────────
  if (!existingNames.has("checklists")) {
    console.log("Creating 'checklists' collection...");
    await api(token, "POST", "/_/api/collections", {
      name: "checklists",
      type: "base",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "card", type: "relation", required: true, options: { collection: "cards" } },
        { name: "items", type: "json" }, // [{text: string, done: boolean}]
      ],
    });
  }

  // ── 8. Comments ─────────────────────────────────────────────────────
  if (!existingNames.has("comments")) {
    console.log("Creating 'comments' collection...");
    await api(token, "POST", "/_/api/collections", {
      name: "comments",
      type: "base",
      fields: [
        { name: "text", type: "text", required: true },
        { name: "card", type: "relation", required: true, options: { collection: "cards" } },
        { name: "author", type: "relation", required: true, options: { collection: "users" } },
      ],
    });
  }

  // ── 9. Activity ─────────────────────────────────────────────────────
  if (!existingNames.has("activity")) {
    console.log("Creating 'activity' collection...");
    await api(token, "POST", "/_/api/collections", {
      name: "activity",
      type: "base",
      fields: [
        { name: "action", type: "text", required: true },
        { name: "entity_type", type: "text", required: true },
        { name: "entity_id", type: "text" },
        { name: "board", type: "relation", required: true, options: { collection: "boards" } },
        { name: "user", type: "relation", required: true, options: { collection: "users" } },
        { name: "details", type: "json" },
      ],
    });
  }

  // ── Set Access Rules ────────────────────────────────────────────────
  console.log("Setting access rules...");

  const authRule = "@request.auth.id != ''";

  await api(token, "PATCH", "/_/api/collections/boards/rules", {
    listRule: authRule, viewRule: authRule, createRule: authRule,
    updateRule: "owner = @request.auth.id",
    deleteRule: "owner = @request.auth.id",
  });

  await api(token, "PATCH", "/_/api/collections/board_members/rules", {
    listRule: authRule, viewRule: authRule, createRule: authRule,
    updateRule: null, deleteRule: null,
  });

  for (const coll of ["lists", "labels", "checklists"]) {
    await api(token, "PATCH", `/_/api/collections/${coll}/rules`, {
      listRule: authRule, viewRule: authRule, createRule: authRule,
      updateRule: authRule, deleteRule: authRule,
    });
  }

  await api(token, "PATCH", "/_/api/collections/cards/rules", {
    listRule: authRule, viewRule: authRule, createRule: authRule,
    updateRule: authRule, deleteRule: null,
  });

  await api(token, "PATCH", "/_/api/collections/comments/rules", {
    listRule: authRule, viewRule: authRule, createRule: authRule,
    updateRule: "author = @request.auth.id",
    deleteRule: "author = @request.auth.id",
  });

  await api(token, "PATCH", "/_/api/collections/activity/rules", {
    listRule: authRule, viewRule: authRule, createRule: authRule,
    updateRule: null, deleteRule: null,
  });

  console.log("\nSetup complete! Collections created:");
  console.log("  users        (auth)  - User accounts with display_name & avatar");
  console.log("  boards       (base)  - Kanban boards with title, description, color");
  console.log("  board_members(base)  - Board membership (admin/member/viewer roles)");
  console.log("  lists        (base)  - Columns within boards, ordered by position");
  console.log("  labels       (base)  - Color-coded labels scoped to boards");
  console.log("  cards        (base)  - Task cards with assignee, due date, attachments");
  console.log("  checklists   (base)  - Checklists on cards with JSON items");
  console.log("  comments     (base)  - Card comments with author tracking");
  console.log("  activity     (base)  - Audit log of board actions");
}

setup().catch(console.error);
