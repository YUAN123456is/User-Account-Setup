import { defineConfig } from "drizzle-kit";
import path from "path";

const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error("NEON_DATABASE_URL or DATABASE_URL must be set. Did you forget to provision a database?");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: { url },
});
