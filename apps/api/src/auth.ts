import { scrypt, timingSafeEqual, randomBytes, randomInt } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const otpTtlMinutes = 10;

export function createSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createOtpExpiry(now = new Date()): Date {
  return new Date(now.getTime() + otpTtlMinutes * 60 * 1000);
}

export function createOwnerSessionToken(input: { userId: string; email?: string }): string {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

export function parseOwnerSessionToken(token: string): { userId: string; email?: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as {
      userId?: unknown;
      email?: unknown;
    };
    if (typeof parsed.userId !== "string") return null;
    return {
      userId: parsed.userId,
      email: typeof parsed.email === "string" ? parsed.email : undefined
    };
  } catch {
    return null;
  }
}

export async function hashOtpCode(code: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(code, salt, 32) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyOtpCode(code: string, hash: string): Promise<boolean> {
  const [salt, expectedHex] = hash.split(":");
  if (!salt || !expectedHex) return false;
  const actual = await scryptAsync(code, salt, 32) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
