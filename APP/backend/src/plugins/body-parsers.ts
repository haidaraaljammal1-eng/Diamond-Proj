import fp from "fastify-plugin";
import formbody from "@fastify/formbody";
import compress from "@fastify/compress";

export const bodyParsersPlugin = fp(
  async (fastify) => {
    await fastify.register(formbody);
    await fastify.register(compress, { global: true, encodings: ["gzip", "deflate"] });
  },
  { name: "body-parsers" },
);
