import { z } from "zod";

export const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8, "Password must be 8 characters"),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
