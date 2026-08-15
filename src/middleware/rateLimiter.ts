// middleware/rateLimiter.ts
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../services/redis.js";

const sendCommand = (...args: string[]) => (redis as any).call(...args) as Promise<any>;

export const appLimiter = rateLimit({
  store: new RedisStore({
    sendCommand,
    prefix:"rl:app"
  }),
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

export const authLimiter = rateLimit({
  store: new RedisStore({
    sendCommand,
    prefix:"rl:auth"
  }),
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Try again in 15 minutes." },
  skipSuccessfulRequests: true,
});
