/**
 * Seed sample data for the Trello-like backend
 *
 * Prerequisites: Run setup.ts first, then:
 *   bun trello-backend/seed.ts
 */

const HOST = process.env.TRELLO_HOST || "http://localhost:8090";

async function adminLogin(): Promise<string> {
  const password = process.env.BUNBASE_ADMIN_PASSWORD;
  if (!password) {
    console.error("Set BUNBASE_ADMIN_PASSWORD to the admin password");
    process.exit(1);
  }
  const res = await fetch(`${HOST}/_/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@bunbase.local", password }),
  });
  if (!res.ok) throw new Error(`Admin login failed: ${await res.text()}`);
  return (await res.json()).token;
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

async function seed() {
  const token = await adminLogin();

  // ── Create Users ────────────────────────────────────────────────────
  console.log("Creating users...");

  const users = [
    { email: "alice@example.com", password: "password123", display_name: "Alice Johnson" },
    { email: "bob@example.com", password: "password123", display_name: "Bob Smith" },
    { email: "carol@example.com", password: "password123", display_name: "Carol Davis" },
  ];

  const userIds: Record<string, string> = {};

  for (const u of users) {
    const signup = await fetch(`${HOST}/api/collections/users/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: u.email, password: u.password }),
    });
    const { user } = await signup.json();
    userIds[u.email] = user.id;

    // Set display name & verify
    await api(token, "PATCH", `/api/collections/users/records/${user.id}`, {
      display_name: u.display_name,
    });
    await api(token, "POST", "/_/api/collections/users/auth/set-verified", {
      userId: user.id,
      verified: true,
    });
  }

  const alice = userIds["alice@example.com"];
  const bob = userIds["bob@example.com"];
  const carol = userIds["carol@example.com"];

  // ── Create Boards ──────────────────────────────────────────────────
  console.log("Creating boards...");

  const board1 = await api(token, "POST", "/api/collections/boards/records", {
    title: "Product Launch",
    description: "Q2 product launch planning and execution",
    background_color: "#0079BF",
    owner: alice,
    is_archived: false,
  });

  const board2 = await api(token, "POST", "/api/collections/boards/records", {
    title: "Engineering Sprint",
    description: "Current sprint tasks and bugs",
    background_color: "#D29034",
    owner: bob,
    is_archived: false,
  });

  // ── Board Members ──────────────────────────────────────────────────
  console.log("Adding board members...");

  await api(token, "POST", "/api/collections/board_members/records", { board: board1.id, user: alice, role: "admin" });
  await api(token, "POST", "/api/collections/board_members/records", { board: board1.id, user: bob, role: "member" });
  await api(token, "POST", "/api/collections/board_members/records", { board: board1.id, user: carol, role: "member" });
  await api(token, "POST", "/api/collections/board_members/records", { board: board2.id, user: bob, role: "admin" });
  await api(token, "POST", "/api/collections/board_members/records", { board: board2.id, user: alice, role: "member" });

  // ── Labels ─────────────────────────────────────────────────────────
  console.log("Creating labels...");

  const labelData = [
    { name: "Bug", color: "#EB5A46", board: board1.id },
    { name: "Feature", color: "#61BD4F", board: board1.id },
    { name: "Urgent", color: "#F2D600", board: board1.id },
    { name: "Design", color: "#C377E0", board: board1.id },
    { name: "Docs", color: "#00C2E0", board: board1.id },
    { name: "Bug", color: "#EB5A46", board: board2.id },
    { name: "Enhancement", color: "#61BD4F", board: board2.id },
    { name: "Tech Debt", color: "#FF9F1A", board: board2.id },
  ];

  const labels: Record<string, string> = {};
  for (const l of labelData) {
    const label = await api(token, "POST", "/api/collections/labels/records", l);
    labels[`${l.board}:${l.name}`] = label.id;
  }

  // ── Lists for Board 1 ──────────────────────────────────────────────
  console.log("Creating lists...");

  const b1Lists = [
    { title: "Backlog", board: board1.id, position: 1, is_archived: false },
    { title: "To Do", board: board1.id, position: 2, is_archived: false },
    { title: "In Progress", board: board1.id, position: 3, is_archived: false },
    { title: "Review", board: board1.id, position: 4, is_archived: false },
    { title: "Done", board: board1.id, position: 5, is_archived: false },
  ];

  const b2Lists = [
    { title: "Sprint Backlog", board: board2.id, position: 1, is_archived: false },
    { title: "In Dev", board: board2.id, position: 2, is_archived: false },
    { title: "Testing", board: board2.id, position: 3, is_archived: false },
    { title: "Deployed", board: board2.id, position: 4, is_archived: false },
  ];

  const listIds: Record<string, string> = {};
  for (const l of [...b1Lists, ...b2Lists]) {
    const list = await api(token, "POST", "/api/collections/lists/records", l);
    listIds[`${l.board}:${l.title}`] = list.id;
  }

  // ── Cards for Board 1 ──────────────────────────────────────────────
  console.log("Creating cards...");

  const b1 = board1.id;
  const cards = [
    // Backlog
    { title: "Research competitor pricing", description: "Analyze top 5 competitor pricing models and prepare comparison doc", list: listIds[`${b1}:Backlog`], position: 1, labels: [labels[`${b1}:Feature`]], is_archived: false },
    { title: "Write blog post for launch", description: "Draft announcement blog post with screenshots and feature highlights", list: listIds[`${b1}:Backlog`], position: 2, labels: [labels[`${b1}:Docs`]], is_archived: false },
    { title: "Plan social media campaign", description: "Create posting schedule for Twitter, LinkedIn, and Product Hunt", list: listIds[`${b1}:Backlog`], position: 3, is_archived: false },

    // To Do
    { title: "Design landing page mockup", description: "Create Figma mockup for the new landing page with hero, features, pricing sections", list: listIds[`${b1}:To Do`], position: 1, assignee: carol, due_date: "2026-03-20T00:00:00Z", labels: [labels[`${b1}:Design`]], is_archived: false },
    { title: "Set up CI/CD pipeline", description: "Configure GitHub Actions for automated testing and deployments", list: listIds[`${b1}:To Do`], position: 2, assignee: alice, due_date: "2026-03-18T00:00:00Z", labels: [labels[`${b1}:Feature`], labels[`${b1}:Urgent`]], is_archived: false },
    { title: "Create onboarding email sequence", description: "Design 5-email drip campaign for new signups", list: listIds[`${b1}:To Do`], position: 3, assignee: bob, due_date: "2026-03-22T00:00:00Z", is_archived: false },

    // In Progress
    { title: "Fix login redirect bug", description: "Users are not redirected to their intended page after OAuth login. The callback URL is lost during the session.", list: listIds[`${b1}:In Progress`], position: 1, assignee: alice, labels: [labels[`${b1}:Bug`], labels[`${b1}:Urgent`]], cover_color: "#EB5A46", is_archived: false },
    { title: "Implement user dashboard", description: "Build the main dashboard with analytics widgets, recent activity feed, and quick actions", list: listIds[`${b1}:In Progress`], position: 2, assignee: bob, due_date: "2026-03-25T00:00:00Z", labels: [labels[`${b1}:Feature`], labels[`${b1}:Design`]], is_archived: false },

    // Review
    { title: "API rate limiting", description: "Implement token bucket rate limiting on all API endpoints", list: listIds[`${b1}:Review`], position: 1, assignee: alice, labels: [labels[`${b1}:Feature`]], is_archived: false },

    // Done
    { title: "Set up project repository", description: "Initialize repo with monorepo structure, linting, and commit hooks", list: listIds[`${b1}:Done`], position: 1, assignee: alice, is_archived: false },
    { title: "Define database schema", description: "Design and document the initial DB schema with migrations", list: listIds[`${b1}:Done`], position: 2, assignee: bob, is_archived: false },
    { title: "Configure development environment", description: "Docker compose setup with hot reload for all services", list: listIds[`${b1}:Done`], position: 3, assignee: carol, is_archived: false },
  ];

  const cardIds: Record<string, string> = {};
  for (const c of cards) {
    const card = await api(token, "POST", "/api/collections/cards/records", c);
    cardIds[c.title] = card.id;
  }

  // Cards for Board 2
  const b2 = board2.id;
  const b2Cards = [
    { title: "Upgrade Bun to latest", description: "Update Bun runtime and fix any breaking changes", list: listIds[`${b2}:Sprint Backlog`], position: 1, assignee: bob, labels: [labels[`${b2}:Tech Debt`]], is_archived: false },
    { title: "Add WebSocket reconnection", description: "Implement exponential backoff reconnection for WebSocket clients", list: listIds[`${b2}:In Dev`], position: 1, assignee: alice, labels: [labels[`${b2}:Enhancement`]], is_archived: false },
    { title: "Fix memory leak in SSE handler", description: "SSE connections not being cleaned up properly on disconnect", list: listIds[`${b2}:In Dev`], position: 2, assignee: bob, labels: [labels[`${b2}:Bug`]], is_archived: false },
    { title: "Database query optimization", description: "Add indexes for frequently filtered columns", list: listIds[`${b2}:Testing`], position: 1, assignee: alice, labels: [labels[`${b2}:Tech Debt`]], is_archived: false },
  ];

  for (const c of b2Cards) {
    const card = await api(token, "POST", "/api/collections/cards/records", c);
    cardIds[c.title] = card.id;
  }

  // ── Checklists ─────────────────────────────────────────────────────
  console.log("Creating checklists...");

  await api(token, "POST", "/api/collections/checklists/records", {
    title: "Design tasks",
    card: cardIds["Design landing page mockup"],
    items: [
      { text: "Desktop layout", done: true },
      { text: "Mobile responsive layout", done: false },
      { text: "Tablet breakpoints", done: false },
      { text: "Dark mode variant", done: false },
    ],
  });

  await api(token, "POST", "/api/collections/checklists/records", {
    title: "Bug fix steps",
    card: cardIds["Fix login redirect bug"],
    items: [
      { text: "Reproduce the issue locally", done: true },
      { text: "Write failing test", done: true },
      { text: "Fix redirect logic in auth middleware", done: false },
      { text: "Test with all OAuth providers", done: false },
      { text: "Deploy to staging", done: false },
    ],
  });

  await api(token, "POST", "/api/collections/checklists/records", {
    title: "Dashboard widgets",
    card: cardIds["Implement user dashboard"],
    items: [
      { text: "Activity feed component", done: true },
      { text: "Stats cards (users, revenue, growth)", done: true },
      { text: "Charts (line, bar, pie)", done: false },
      { text: "Quick action buttons", done: false },
      { text: "Notification bell", done: false },
    ],
  });

  await api(token, "POST", "/api/collections/checklists/records", {
    title: "CI/CD tasks",
    card: cardIds["Set up CI/CD pipeline"],
    items: [
      { text: "Configure test runner", done: false },
      { text: "Set up lint checks", done: false },
      { text: "Add staging deploy step", done: false },
      { text: "Add production deploy step", done: false },
      { text: "Configure Slack notifications", done: false },
    ],
  });

  // ── Comments ───────────────────────────────────────────────────────
  console.log("Creating comments...");

  await api(token, "POST", "/api/collections/comments/records", {
    text: "I'll start on the desktop version first. Should have wireframes by end of day.",
    card: cardIds["Design landing page mockup"],
    author: carol,
  });

  await api(token, "POST", "/api/collections/comments/records", {
    text: "Make sure we follow the new brand guidelines for the color palette.",
    card: cardIds["Design landing page mockup"],
    author: alice,
  });

  await api(token, "POST", "/api/collections/comments/records", {
    text: "Found the root cause - the callback URL isn't being preserved in the session store. The Redis key expires before the OAuth flow completes.",
    card: cardIds["Fix login redirect bug"],
    author: alice,
  });

  await api(token, "POST", "/api/collections/comments/records", {
    text: "Can you check if this also affects the mobile app OAuth flow?",
    card: cardIds["Fix login redirect bug"],
    author: bob,
  });

  await api(token, "POST", "/api/collections/comments/records", {
    text: "Good catch - yes it does. I'll fix both in the same PR.",
    card: cardIds["Fix login redirect bug"],
    author: alice,
  });

  await api(token, "POST", "/api/collections/comments/records", {
    text: "The analytics widgets are looking great! Just need to add the date range picker.",
    card: cardIds["Implement user dashboard"],
    author: carol,
  });

  await api(token, "POST", "/api/collections/comments/records", {
    text: "Let's use a token bucket approach - it handles burst traffic better than sliding window.",
    card: cardIds["API rate limiting"],
    author: alice,
  });

  // ── Activity Log ───────────────────────────────────────────────────
  console.log("Creating activity log...");

  await api(token, "POST", "/api/collections/activity/records", {
    action: "created", entity_type: "board", entity_id: board1.id,
    board: board1.id, user: alice,
    details: { title: "Product Launch" },
  });

  await api(token, "POST", "/api/collections/activity/records", {
    action: "added_member", entity_type: "board", entity_id: board1.id,
    board: board1.id, user: alice,
    details: { member: "Bob Smith", role: "member" },
  });

  await api(token, "POST", "/api/collections/activity/records", {
    action: "moved", entity_type: "card", entity_id: cardIds["Fix login redirect bug"],
    board: board1.id, user: alice,
    details: { from: "To Do", to: "In Progress", card_title: "Fix login redirect bug" },
  });

  await api(token, "POST", "/api/collections/activity/records", {
    action: "moved", entity_type: "card", entity_id: cardIds["API rate limiting"],
    board: board1.id, user: alice,
    details: { from: "In Progress", to: "Review", card_title: "API rate limiting" },
  });

  await api(token, "POST", "/api/collections/activity/records", {
    action: "completed", entity_type: "card", entity_id: cardIds["Set up project repository"],
    board: board1.id, user: alice,
    details: { card_title: "Set up project repository" },
  });

  console.log("\nSeed complete!");
  console.log(`  3 users, 2 boards, 5 members, 8 labels`);
  console.log(`  9 lists, 16 cards, 4 checklists, 7 comments, 5 activity entries`);
  console.log(`\nTest credentials:`);
  console.log(`  alice@example.com / password123`);
  console.log(`  bob@example.com   / password123`);
  console.log(`  carol@example.com / password123`);
}

seed().catch(console.error);
