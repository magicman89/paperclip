import { createDb } from "./src/client.ts";
import { agents } from "./src/schema/index.ts";
import { eq } from "drizzle-orm";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL missing");
  const db = createDb(dbUrl);

  const ids = [
    "e8c0f4a5-497a-48b4-bd13-571051559df9", // Hermes
    "e0a6d0de-52e6-40e0-9c26-55b1cc9a4e40", // Chief of Staff
  ];

  for (const id of ids) {
    const [agent] = await db.select({
      name: agents.name,
      status: agents.status,
      adapterType: agents.adapterType,
      adapterConfig: agents.adapterConfig,
    }).from(agents).where(eq(agents.id, id));

    if (agent) {
      const cfg = agent.adapterConfig as any;
      const safe = {
        name: agent.name,
        status: agent.status,
        adapterType: agent.adapterType,
        adapterConfigUrl: cfg?.url ? cfg.url.replace(/https:\/\/[a-zA-Z0-9.-]+(\/|$)/g, 'https://[REDACTED_HOST]/') : null,
        adapterConfigMethod: cfg?.method ?? null,
        adapterConfigHeaders: cfg?.headers ? Object.keys(cfg.headers) : [],
      };
      console.log(JSON.stringify(safe, null, 2));
    }
  }
  process.exit(0);
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
