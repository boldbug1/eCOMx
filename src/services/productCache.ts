import { redis } from "./redis.js";
import { Product } from "@prisma/client";

export const getCachedProduct = async (id: string) => {
  try {
    const Cachekey = `product:${id}`;
    const cached = await redis.get(Cachekey);
    if (!cached) {
      return null;
    }
    return JSON.parse(cached);
  } catch (e) {
    console.log(e);
    return null;
  }
};

export const setCachedProduct = async (
  id: string,
  product: Product,
  ttl = 3600,
) => {
  try {
    const CacheKey = `product:${id}`;
    const ProductString = JSON.stringify(product);
    await redis.set(CacheKey, ProductString, "EX", ttl);
  } catch (e) {
    console.log(e);
    return null;
  }
};

export const invalidateProduct = async (id: string) => {
  try {
    const CacheKey = `product:${id}`;

    await redis.del(CacheKey);
  } catch (e) {
    console.log(e);
    return null;
  }
};
