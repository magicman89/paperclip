import { createDb } from "./src/client.ts";
import { agents } from "./src/schema/index.ts";
import { eq } from "drizzle-orm";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL missing");
  const db = createDb(dbUrl);

  const ids = [
    "e8c0f4a5-497a-48b4-bd13-571051559df9", // Hermes
    "0df3f65f-07e1-4ca3-981d-5ec33c576e72", // Server Mechanic (healthy)
  ];

  for (const id of ids) {
    const [agent] = await db.select({
      name: agents.name,
      adapterConfig: agents.adapterConfig,
    }).from(agents).where(eq(agents.id, id));

    if (agent) {
      const cfg = agent.adapterConfig as any;
      console.log(agent.name + ' URL:', cfg?.url || 'NONE');
      if (cfg?.headers) {
        console.log(agent.name + ' has auth header:', 'Authorization' in (cfg.headers||{}));
      }
      console.log('---');
    }
  }
  process.exit(0);
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
