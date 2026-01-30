import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  spyOn,
} from 'bun:test';
import { initDatabase, closeDatabase, getDatabase } from '../core/database';
import { createCollection, deleteCollection } from '../core/schema';
import { HookManager } from '../core/hooks';
import { RealtimeManager } from '../realtime/manager';
import {
  createRouteContext,
  type RouteContext,
  type ContextDependencies,
} from './context';
import { UnauthorizedError } from './errors';
import { createAdminToken } from '../auth/jwt';
import { createAdmin } from '../auth/admin';

// Test configuration
const TEST_JWT_SECRET = 'test-secret-for-context-tests-123456';

describe('RouteContext', () => {
  let hooks: HookManager;
  let realtime: RealtimeManager;
  let deps: ContextDependencies;

  beforeAll(() => {
    // Set JWT secret for auth tests
    process.env.JWT_SECRET = TEST_JWT_SECRET;

    // Initialize test database
    initDatabase(':memory:');

    // Create test collection with public rules
    const publicRules = {
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
    };
    createCollection('items', [
      { name: 'name', type: 'text', required: true },
      { name: 'value', type: 'number', required: false },
    ], { rules: publicRules });
  });

  afterAll(() => {
    try {
      deleteCollection('items');
    } catch {
      // Collection may already be deleted
    }
    closeDatabase();
  });

  beforeEach(() => {
    // Fresh managers for each test
    hooks = new HookManager();
    realtime = new RealtimeManager();
    deps = { hooks, realtime };

    // Clear records
    const db = getDatabase();
    db.run('DELETE FROM "items"');
  });

  describe('createRouteContext()', () => {
    test('returns object with all required properties', () => {
      const req = new Request('http://localhost/test');
      const params = { id: '123' };

      const ctx = createRouteContext(req, params, deps);

      expect(ctx).toHaveProperty('request');
      expect(ctx).toHaveProperty('params');
      expect(ctx).toHaveProperty('db');
      expect(ctx).toHaveProperty('records');
      expect(ctx).toHaveProperty('auth');
      expect(ctx).toHaveProperty('realtime');
      expect(ctx).toHaveProperty('files');
      expect(ctx).toHaveProperty('hooks');
    });

    test('request is the original Request object', () => {
      const req = new Request('http://localhost/test');
      const params = {};

      const ctx = createRouteContext(req, params, deps);

      expect(ctx.request).toBe(req);
    });

    test('params contains route parameters', () => {
      const req = new Request('http://localhost/test');
      const params = { id: '123', action: 'view' };

      const ctx = createRouteContext(req, params, deps);

      expect(ctx.params).toEqual({ id: '123', action: 'view' });
    });

    test('db is the Database instance from getDatabase()', () => {
      const req = new Request('http://localhost/test');
      const params = {};

      const ctx = createRouteContext(req, params, deps);

      // Should be able to query
      const result = ctx.db.query('SELECT 1 as value').get() as { value: number };
      expect(result.value).toBe(1);
    });

    test('hooks is the HookManager passed in deps', () => {
      const req = new Request('http://localhost/test');
      const params = {};

      const ctx = createRouteContext(req, params, deps);

      expect(ctx.hooks).toBe(hooks);
    });

    test('realtime is the RealtimeManager passed in deps', () => {
      const req = new Request('http://localhost/test');
      const params = {};

      const ctx = createRouteContext(req, params, deps);

      expect(ctx.realtime).toBe(realtime);
    });
  });

  describe('RecordsAPI', () => {
    test('records.get() returns null for non-existent record', () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      const result = ctx.records.get('items', 'non-existent-id');

      expect(result).toBeNull();
    });

    test('records.get() returns record when exists', async () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      // Create a record first
      const created = await ctx.records.create('items', { name: 'Test Item' });
      const result = ctx.records.get('items', created.id as string);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Test Item');
    });

    test('records.list() returns paginated response', () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      const result = ctx.records.list('items');

      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('perPage');
      expect(result).toHaveProperty('totalItems');
      expect(result).toHaveProperty('totalPages');
      expect(result).toHaveProperty('items');
      expect(Array.isArray(result.items)).toBe(true);
    });

    test('records.list() returns items when records exist', async () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      // Create some records
      await ctx.records.create('items', { name: 'Item 1' });
      await ctx.records.create('items', { name: 'Item 2' });

      const result = ctx.records.list('items');

      expect(result.totalItems).toBe(2);
      expect(result.items).toHaveLength(2);
    });

    test('records.create() creates record and triggers hooks', async () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      let beforeCreateCalled = false;
      let afterCreateCalled = false;

      hooks.on('beforeCreate', async (hookCtx, next) => {
        beforeCreateCalled = true;
        await next();
      });
      hooks.on('afterCreate', async (hookCtx, next) => {
        afterCreateCalled = true;
        await next();
      });

      const record = await ctx.records.create('items', { name: 'New Item', value: 42 });

      expect(record).toHaveProperty('id');
      expect(record.name).toBe('New Item');
      expect(record.value).toBe(42);
      expect(beforeCreateCalled).toBe(true);
      expect(afterCreateCalled).toBe(true);
    });

    test('records.update() updates record and triggers hooks', async () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      // Create record first
      const created = await ctx.records.create('items', { name: 'Original' });

      let beforeUpdateCalled = false;
      let afterUpdateCalled = false;

      hooks.on('beforeUpdate', async (hookCtx, next) => {
        beforeUpdateCalled = true;
        await next();
      });
      hooks.on('afterUpdate', async (hookCtx, next) => {
        afterUpdateCalled = true;
        await next();
      });

      const updated = await ctx.records.update('items', created.id as string, { name: 'Updated' });

      expect(updated.name).toBe('Updated');
      expect(beforeUpdateCalled).toBe(true);
      expect(afterUpdateCalled).toBe(true);
    });

    test('records.delete() deletes record and triggers hooks', async () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      // Create record first
      const created = await ctx.records.create('items', { name: 'To Delete' });

      let beforeDeleteCalled = false;
      let afterDeleteCalled = false;

      hooks.on('beforeDelete', async (hookCtx, next) => {
        beforeDeleteCalled = true;
        await next();
      });
      hooks.on('afterDelete', async (hookCtx, next) => {
        afterDeleteCalled = true;
        await next();
      });

      await ctx.records.delete('items', created.id as string);

      const result = ctx.records.get('items', created.id as string);
      expect(result).toBeNull();
      expect(beforeDeleteCalled).toBe(true);
      expect(afterDeleteCalled).toBe(true);
    });
  });

  describe('AuthAPI', () => {
    test('auth.buildContext() returns {isAdmin: false, user: null} for no token', async () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      const result = await ctx.auth.buildContext(req);

      expect(result).toEqual({ isAdmin: false, user: null });
    });

    test('auth.buildContext() returns {isAdmin: true, user: null} for valid admin token', async () => {
      // Create admin and get token (createAdmin is async and returns the admin object)
      const admin = await createAdmin('admin@test.com', 'password123');
      const token = await createAdminToken(admin.id);

      const req = new Request('http://localhost/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const ctx = createRouteContext(req, {}, deps);

      const result = await ctx.auth.buildContext(req);

      expect(result.isAdmin).toBe(true);
      expect(result.user).toBeNull();
    });

    test('auth.optionalUser() returns null for no token', async () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      const result = await ctx.auth.optionalUser(req);

      expect(result).toBeNull();
    });

    test('auth.optionalUser() returns null for invalid token', async () => {
      const req = new Request('http://localhost/test', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      const ctx = createRouteContext(req, {}, deps);

      const result = await ctx.auth.optionalUser(req);

      expect(result).toBeNull();
    });

    test('auth.requireAdmin() throws UnauthorizedError for no token', async () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      await expect(ctx.auth.requireAdmin(req)).rejects.toThrow(UnauthorizedError);
    });

    test('auth.requireAdmin() throws UnauthorizedError with correct message', async () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      try {
        await ctx.auth.requireAdmin(req);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedError);
        expect((error as UnauthorizedError).message).toBe('Admin authentication required');
      }
    });

    test('auth.requireAdmin() does not throw for valid admin token', async () => {
      // Create admin and get token (createAdmin is async and returns the admin object)
      const admin = await createAdmin('admin2@test.com', 'password123');
      const token = await createAdminToken(admin.id);

      const req = new Request('http://localhost/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const ctx = createRouteContext(req, {}, deps);

      // Should not throw
      await expect(ctx.auth.requireAdmin(req)).resolves.toBeUndefined();
    });
  });

  describe('FilesAPI', () => {
    test('files.getPath() returns correct path format', () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      const path = ctx.files.getPath('items', 'record123', 'photo.jpg');

      expect(path).toContain('items');
      expect(path).toContain('record123');
      expect(path).toContain('photo.jpg');
    });

    test('files.exists() returns false for non-existent file', async () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      const exists = await ctx.files.exists('items', 'record123', 'nonexistent.jpg');

      expect(exists).toBe(false);
    });

    test('files.save() and files.exists() work together', async () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      // Create a test file
      const file = new File(['test content'], 'test-file.txt', { type: 'text/plain' });
      const recordId = 'test-record-id';

      // Save the file
      const filename = await ctx.files.save('items', recordId, file);

      // Verify it exists
      const exists = await ctx.files.exists('items', recordId, filename);
      expect(exists).toBe(true);

      // Clean up
      await ctx.files.delete('items', recordId, filename);
    });

    test('files.delete() removes file', async () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      // Create and save a file
      const file = new File(['test content'], 'to-delete.txt', { type: 'text/plain' });
      const recordId = 'delete-test-record';
      const filename = await ctx.files.save('items', recordId, file);

      // Delete it
      await ctx.files.delete('items', recordId, filename);

      // Verify it's gone
      const exists = await ctx.files.exists('items', recordId, filename);
      expect(exists).toBe(false);
    });
  });

  describe('Database direct access', () => {
    test('ctx.db allows raw SQL queries', async () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      // Create some records via the API
      await ctx.records.create('items', { name: 'Item A', value: 10 });
      await ctx.records.create('items', { name: 'Item B', value: 20 });

      // Use raw SQL to aggregate
      const result = ctx.db.query('SELECT SUM(value) as total FROM items').get() as { total: number };

      expect(result.total).toBe(30);
    });

    test('ctx.db modifications persist', async () => {
      const req = new Request('http://localhost/test');
      const ctx = createRouteContext(req, {}, deps);

      // Create via records API
      const record = await ctx.records.create('items', { name: 'Original', value: 5 });

      // Modify via raw SQL (bypasses hooks - for advanced use)
      ctx.db.run('UPDATE items SET value = $value WHERE id = $id', { value: 100, id: record.id });

      // Verify change via records API
      const updated = ctx.records.get('items', record.id as string);
      expect(updated!.value).toBe(100);
    });
  });
});
