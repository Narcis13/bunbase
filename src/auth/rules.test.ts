import { describe, test, expect } from "bun:test";
import { evaluateRule, getRuleForOperation, RuleContext } from "./rules";
import type { AuthenticatedUser } from "./middleware";
import type { CollectionRules } from "../types/collection";

// Helper to create a test user
function createTestUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user123",
    email: "test@example.com",
    verified: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    collectionId: "col123",
    collectionName: "users",
    ...overrides,
  };
}

describe("evaluateRule", () => {
  describe("admin bypass", () => {
    test("returns true for admin regardless of rule", () => {
      const context: RuleContext = { isAdmin: true, auth: null };

      // Even with null rule (admin only), admin should have access
      expect(evaluateRule(null, context)).toBe(true);

      // Even with locked rule
      expect(evaluateRule("@request.auth.id != ''", context)).toBe(true);
    });
  });

  describe("null rule (admin only)", () => {
    test("returns false for non-admin", () => {
      const context: RuleContext = { isAdmin: false, auth: null };
      expect(evaluateRule(null, context)).toBe(false);
    });

    test("returns false for authenticated non-admin", () => {
      const context: RuleContext = { isAdmin: false, auth: createTestUser() };
      expect(evaluateRule(null, context)).toBe(false);
    });
  });

  describe("empty string rule (public)", () => {
    test("returns true for unauthenticated user", () => {
      const context: RuleContext = { isAdmin: false, auth: null };
      expect(evaluateRule('', context)).toBe(true);
    });

    test("returns true for authenticated user", () => {
      const context: RuleContext = { isAdmin: false, auth: createTestUser() };
      expect(evaluateRule('', context)).toBe(true);
    });
  });

  describe("@request.auth expressions", () => {
    test("@request.auth.id != '' matches authenticated user", () => {
      const context: RuleContext = { isAdmin: false, auth: createTestUser() };
      expect(evaluateRule('@request.auth.id != ""', context)).toBe(true);
    });

    test("@request.auth.id != '' fails for unauthenticated user", () => {
      const context: RuleContext = { isAdmin: false, auth: null };
      expect(evaluateRule('@request.auth.id != ""', context)).toBe(false);
    });

    test("@request.auth.id = id matches owner", () => {
      const context: RuleContext = {
        isAdmin: false,
        auth: createTestUser({ id: "user123" }),
        record: { id: "rec1", user_id: "user123" },
      };
      expect(evaluateRule('@request.auth.id = user_id', context)).toBe(true);
    });

    test("@request.auth.id = id fails for non-owner", () => {
      const context: RuleContext = {
        isAdmin: false,
        auth: createTestUser({ id: "user456" }),
        record: { id: "rec1", user_id: "user123" },
      };
      expect(evaluateRule('@request.auth.id = user_id', context)).toBe(false);
    });

    test("@request.auth.email matches user email", () => {
      const context: RuleContext = {
        isAdmin: false,
        auth: createTestUser({ email: "test@example.com" }),
      };
      expect(evaluateRule('@request.auth.email = "test@example.com"', context)).toBe(true);
    });

    test("@request.auth.verified = true matches verified user", () => {
      const context: RuleContext = {
        isAdmin: false,
        auth: createTestUser({ verified: true }),
      };
      expect(evaluateRule('@request.auth.verified = true', context)).toBe(true);
    });

    test("@request.auth.verified = true fails for unverified user", () => {
      const context: RuleContext = {
        isAdmin: false,
        auth: createTestUser({ verified: false }),
      };
      expect(evaluateRule('@request.auth.verified = true', context)).toBe(false);
    });

    test("@request.auth.collectionName matches collection", () => {
      const context: RuleContext = {
        isAdmin: false,
        auth: createTestUser({ collectionName: "users" }),
      };
      expect(evaluateRule('@request.auth.collectionName = "users"', context)).toBe(true);
    });
  });

  describe("logical operators", () => {
    test("&& requires all conditions to be true", () => {
      const context: RuleContext = {
        isAdmin: false,
        auth: createTestUser({ id: "user123", verified: true }),
        record: { user_id: "user123" },
      };

      // Both conditions true
      expect(evaluateRule('@request.auth.id = user_id && @request.auth.verified = true', context)).toBe(true);

      // First condition false
      const context2: RuleContext = {
        isAdmin: false,
        auth: createTestUser({ id: "user456", verified: true }),
        record: { user_id: "user123" },
      };
      expect(evaluateRule('@request.auth.id = user_id && @request.auth.verified = true', context2)).toBe(false);

      // Second condition false
      const context3: RuleContext = {
        isAdmin: false,
        auth: createTestUser({ id: "user123", verified: false }),
        record: { user_id: "user123" },
      };
      expect(evaluateRule('@request.auth.id = user_id && @request.auth.verified = true', context3)).toBe(false);
    });

    test("|| requires any condition to be true", () => {
      const context1: RuleContext = {
        isAdmin: false,
        auth: createTestUser({ id: "user123" }),
        record: { user_id: "user123", status: "draft" },
      };

      // First condition true
      expect(evaluateRule('@request.auth.id = user_id || status = "published"', context1)).toBe(true);

      // Second condition true
      const context2: RuleContext = {
        isAdmin: false,
        auth: createTestUser({ id: "user456" }),
        record: { user_id: "user123", status: "published" },
      };
      expect(evaluateRule('@request.auth.id = user_id || status = "published"', context2)).toBe(true);

      // Neither condition true
      const context3: RuleContext = {
        isAdmin: false,
        auth: createTestUser({ id: "user456" }),
        record: { user_id: "user123", status: "draft" },
      };
      expect(evaluateRule('@request.auth.id = user_id || status = "published"', context3)).toBe(false);
    });
  });

  describe("comparison operators", () => {
    test("!= operator works", () => {
      const context: RuleContext = {
        isAdmin: false,
        auth: createTestUser(),
        record: { status: "active" },
      };
      expect(evaluateRule('status != "deleted"', context)).toBe(true);
      expect(evaluateRule('status != "active"', context)).toBe(false);
    });

    test("number comparisons work", () => {
      const context: RuleContext = {
        isAdmin: false,
        auth: createTestUser(),
        record: { price: 100 },
      };
      expect(evaluateRule('price > 50', context)).toBe(true);
      expect(evaluateRule('price < 50', context)).toBe(false);
      expect(evaluateRule('price >= 100', context)).toBe(true);
      expect(evaluateRule('price <= 100', context)).toBe(true);
      expect(evaluateRule('price = 100', context)).toBe(true);
    });
  });

  describe("string literals", () => {
    test("double-quoted strings work", () => {
      const context: RuleContext = {
        isAdmin: false,
        auth: createTestUser(),
        record: { status: "active" },
      };
      expect(evaluateRule('status = "active"', context)).toBe(true);
    });

    test("single-quoted strings work", () => {
      const context: RuleContext = {
        isAdmin: false,
        auth: createTestUser(),
        record: { status: "active" },
      };
      expect(evaluateRule("status = 'active'", context)).toBe(true);
    });
  });

  describe("invalid expressions", () => {
    test("invalid expression fails closed (returns false)", () => {
      const context: RuleContext = { isAdmin: false, auth: createTestUser() };

      // Suppress console.warn for this test
      const originalWarn = console.warn;
      console.warn = () => {};

      expect(evaluateRule('invalid expression without operator', context)).toBe(false);

      console.warn = originalWarn;
    });
  });

  describe("@request.body references", () => {
    test("body references work in create rules", () => {
      const context: RuleContext = {
        isAdmin: false,
        auth: createTestUser({ id: "user123" }),
        body: { user_id: "user123" },
      };
      expect(evaluateRule('@request.auth.id = @request.body.user_id', context)).toBe(true);
    });
  });
});

describe("getRuleForOperation", () => {
  const rules: CollectionRules = {
    listRule: '',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id = user_id',
    deleteRule: null,
  };

  test("returns correct rule for each operation", () => {
    expect(getRuleForOperation(rules, 'list')).toBe('');
    expect(getRuleForOperation(rules, 'view')).toBe('@request.auth.id != ""');
    expect(getRuleForOperation(rules, 'create')).toBe('@request.auth.id != ""');
    expect(getRuleForOperation(rules, 'update')).toBe('@request.auth.id = user_id');
    expect(getRuleForOperation(rules, 'delete')).toBe(null);
  });

  test("returns null when rules is null", () => {
    expect(getRuleForOperation(null, 'list')).toBe(null);
    expect(getRuleForOperation(null, 'view')).toBe(null);
    expect(getRuleForOperation(null, 'create')).toBe(null);
    expect(getRuleForOperation(null, 'update')).toBe(null);
    expect(getRuleForOperation(null, 'delete')).toBe(null);
  });
});
