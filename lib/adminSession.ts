import crypto from "crypto";

export const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

const base64UrlEncode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const base64UrlDecode = (value: string) => Buffer.from(value, "base64url").toString("utf8");

export const getSessionSecret = (passwordFallback: string) =>
  process.env.ADMIN_SESSION_SECRET ||
  crypto.createHash("sha256").update(`${passwordFallback}|portfolio-admin-session`).digest("hex");

export const createSessionToken = (secret: string): string => {
  const payload = base64UrlEncode(JSON.stringify({ exp: Date.now() + ADMIN_SESSION_TTL_MS }));
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
};

export const verifySessionToken = (token: string, secret: string): boolean => {
  if (!token || typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!payload || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }

  try {
    const data = JSON.parse(base64UrlDecode(payload)) as { exp?: number };
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
};

export const getBearerToken = (req: { headers?: Record<string, string | string[] | undefined> }): string => {
  const authHeader = req.headers?.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }
  const tokenHeader = req.headers?.["x-admin-token"];
  if (typeof tokenHeader === "string") return tokenHeader.trim();
  return "";
};
