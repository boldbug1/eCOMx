import { Redis } from "ioredis";
import type { RedisOptions } from "ioredis";

const options: RedisOptions = {
  maxRetriesPerRequest: 2,
  retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 1000)),
};

export const redis = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
  options,
);

redis.on("error", () => {});