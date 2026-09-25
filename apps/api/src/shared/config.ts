import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

// Load the repo-root .env regardless of the process cwd (tsx watch, scripts, etc.).
const rootEnvPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.env");
dotenv.config({ path: rootEnvPath, quiet: true });

const envSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://", "DATABASE_URL must be a postgresql:// URL"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  ADMIN_TOKEN: z.string().min(1, "ADMIN_TOKEN is required"),
  PLOTGO_AUTH_MODE: z.enum(["dev", "privy"]).default("dev"),
  PRIVY_APP_ID: z.string().optional(),
  PRIVY_APP_SECRET: z.string().optional(),
  WEB_ORIGIN: z.string().url().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:\n" + parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`).join("\n"));
  process.exit(1);
}

if (parsed.data.PLOTGO_AUTH_MODE === "privy" && (!parsed.data.PRIVY_APP_ID || !parsed.data.PRIVY_APP_SECRET)) {
  console.error("Invalid environment: PLOTGO_AUTH_MODE=privy requires PRIVY_APP_ID and PRIVY_APP_SECRET");
  process.exit(1);
}

export const env = {
  databaseUrl: parsed.data.DATABASE_URL,
  port: parsed.data.PORT,
  adminToken: parsed.data.ADMIN_TOKEN,
  authMode: parsed.data.PLOTGO_AUTH_MODE,
  privyAppId: parsed.data.PRIVY_APP_ID ?? "",
  privyAppSecret: parsed.data.PRIVY_APP_SECRET ?? "",
  webOrigin: parsed.data.WEB_ORIGIN ?? "",
};
