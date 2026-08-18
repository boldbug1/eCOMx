// middleware/rateLimiter.ts
import rateLimit, { MemoryStore } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../services/redis.js";

const sendCommand = (...args: string[]) => (redis as any).call(...args) as Promise<any>;

function pingWithTimeout(ms = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    redis.ping().then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}

const redisUp = await pingWithTimeout();

if (!redisUp) {
  console.warn(
    "Redis unreachable — falling back to in-memory rate limit store and no-op product cache",
  );
}

function createStore(prefix: string) {
  if (redisUp) return new RedisStore({ sendCommand, prefix });
  return new MemoryStore();
}

export const appLimiter = rateLimit({
  store: createStore("rl:app"),
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

export const authLimiter = rateLimit({
  store: createStore("rl:auth"),
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Try again in 15 minutes." },
  skipSuccessfulRequests: true,
});
