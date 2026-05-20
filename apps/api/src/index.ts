import { loadRuntimeConfig } from "./env";
import { buildServer } from "./server";

const config = loadRuntimeConfig();
const port = Number(process.env.PORT ?? config.apiPort ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const server = buildServer();

server.listen({ port, host }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});
