import { test, expect, describe } from "bun:test";
import { validatePassword, PasswordValidationError } from "./validation";

describe("validatePassword", () => {
  test("accepts valid passwords (8+ chars, has letter, has number)", () => {
    // These should not throw
    expect(() => validatePassword("password1")).not.toThrow();
    expect(() => validatePassword("Password123")).not.toThrow();
    expect(() => validatePassword("a1234567")).not.toThrow();
    expect(() => validatePassword("1234567a")).not.toThrow();
    expect(() => validatePassword("Test1234")).not.toThrow();
    expect(() => validatePassword("ABCDEFG1")).not.toThrow();
  });

  test("rejects passwords that are too short", () => {
    expect(() => validatePassword("pass1")).toThrow(PasswordValidationError);
    expect(() => validatePassword("pass1")).toThrow(
      "Password must be at least 8 characters"
    );
    expect(() => validatePassword("a1")).toThrow(PasswordValidationError);
    expect(() => validatePassword("")).toThrow(PasswordValidationError);
  });

  test("rejects passwords without letters", () => {
    expect(() => validatePassword("12345678")).toThrow(PasswordValidationError);
    expect(() => validatePassword("12345678")).toThrow(
      "Password must contain at least one letter"
    );
    expect(() => validatePassword("!@#$%^&*1")).toThrow(PasswordValidationError);
  });

  test("rejects passwords without numbers", () => {
    expect(() => validatePassword("abcdefgh")).toThrow(PasswordValidationError);
    expect(() => validatePassword("abcdefgh")).toThrow(
      "Password must contain at least one number"
    );
    expect(() => validatePassword("Password!")).toThrow(PasswordValidationError);
  });

  test("rejects empty/null passwords", () => {
    expect(() => validatePassword("")).toThrow(PasswordValidationError);
    expect(() => validatePassword("")).toThrow("Password is required");
    // @ts-expect-error testing null input
    expect(() => validatePassword(null)).toThrow(PasswordValidationError);
    // @ts-expect-error testing undefined input
    expect(() => validatePassword(undefined)).toThrow(PasswordValidationError);
  });

  test("respects custom minLength", () => {
    // With minLength of 4, shorter passwords should work
    expect(() => validatePassword("ab1c", 4)).not.toThrow();
    expect(() => validatePassword("a1bc", 4)).not.toThrow();

    // But still need the minimum
    expect(() => validatePassword("a1b", 4)).toThrow(
      "Password must be at least 4 characters"
    );

    // With minLength of 12, longer passwords required
    expect(() => validatePassword("password1", 12)).toThrow(
      "Password must be at least 12 characters"
    );
    expect(() => validatePassword("password1234", 12)).not.toThrow();
  });

  test("PasswordValidationError has correct name", () => {
    try {
      validatePassword("short");
    } catch (e) {
      expect(e).toBeInstanceOf(PasswordValidationError);
      expect((e as Error).name).toBe("PasswordValidationError");
    }
  });
});
