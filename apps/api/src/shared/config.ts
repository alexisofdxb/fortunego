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
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:\n" + parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`).join("\n"));
  process.exit(1);
}

export const env = {
  databaseUrl: parsed.data.DATABASE_URL,
  port: parsed.data.PORT,
  adminToken: parsed.data.ADMIN_TOKEN,
};
