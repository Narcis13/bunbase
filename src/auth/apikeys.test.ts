import { test, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, closeDatabase } from "../core/database";
import { createApiKey, verifyApiKey, listApiKeys, revokeApiKey } from "./apikeys";
import { unlinkSync } from "node:fs";

const TEST_DB = "test-apikeys.db";

beforeEach(() => {
  initDatabase(TEST_DB);
});

afterEach(() => {
  closeDatabase();
  try { unlinkSync(TEST_DB); } catch {}
  try { unlinkSync(TEST_DB + "-wal"); } catch {}
  try { unlinkSync(TEST_DB + "-shm"); } catch {}
});

test("createApiKey returns key with bb_ prefix", async () => {
  const result = await createApiKey("test-agent");

  expect(result.key).toStartWith("bb_");
  expect(result.key.length).toBe(35); // "bb_" + 32 chars
  expect(result.name).toBe("test-agent");
  expect(result.id).toBeTruthy();
  expect(result.key_prefix).toBe(result.key.slice(3, 11));
  expect(result.created_at).toBeTruthy();
  expect(result.last_used_at).toBeNull();
});

test("verifyApiKey returns key info for valid key", async () => {
  const created = await createApiKey("my-agent");
  const result = await verifyApiKey(created.key);

  expect(result).not.toBeNull();
  expect(result!.id).toBe(created.id);
  expect(result!.name).toBe("my-agent");
});

test("verifyApiKey returns null for invalid key", async () => {
  await createApiKey("my-agent");
  const result = await verifyApiKey("bb_invalidkeyinvalidkeyinvalidkey12");

  expect(result).toBeNull();
});

test("verifyApiKey returns null for malformed key", async () => {
  expect(await verifyApiKey("not-a-key")).toBeNull();
  expect(await verifyApiKey("bb_short")).toBeNull();
  expect(await verifyApiKey("")).toBeNull();
});

test("verifyApiKey updates last_used_at", async () => {
  const created = await createApiKey("agent");
  expect(listApiKeys()[0].last_used_at).toBeNull();

  await verifyApiKey(created.key);

  const keys = listApiKeys();
  expect(keys[0].last_used_at).toBeTruthy();
});

test("listApiKeys returns all keys without hashes", async () => {
  await createApiKey("key-1");
  await createApiKey("key-2");

  const keys = listApiKeys();
  expect(keys).toHaveLength(2);

  for (const key of keys) {
    expect(key).toHaveProperty("id");
    expect(key).toHaveProperty("name");
    expect(key).toHaveProperty("key_prefix");
    expect(key).toHaveProperty("created_at");
    expect(key).toHaveProperty("last_used_at");
    expect(key).not.toHaveProperty("key_hash");
    expect(key).not.toHaveProperty("key");
  }
});

test("listApiKeys returns empty array when no keys", () => {
  expect(listApiKeys()).toEqual([]);
});

test("revokeApiKey deletes the key", async () => {
  const created = await createApiKey("to-revoke");
  expect(listApiKeys()).toHaveLength(1);

  const deleted = revokeApiKey(created.id);
  expect(deleted).toBe(true);
  expect(listApiKeys()).toHaveLength(0);
});

test("revokeApiKey returns false for nonexistent id", () => {
  expect(revokeApiKey("nonexistent")).toBe(false);
});

test("revoked key can no longer verify", async () => {
  const created = await createApiKey("temp-key");
  revokeApiKey(created.id);

  const result = await verifyApiKey(created.key);
  expect(result).toBeNull();
});
