import { Role } from '@prisma/client';

export const PERMISSIONS = {
  orders: { read: "orders:read", create: "orders:create", update: "orders:update", delete: "orders:delete" },
  products: { read: "products:read", create: "products:create", update: "products:update", delete: "products:delete" },
} as const;

type Resource = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]
export type Permission = Resource[keyof Resource];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  USER:      [PERMISSIONS.orders.read, PERMISSIONS.orders.create,PERMISSIONS.products.read],
  MODERATOR: [PERMISSIONS.orders.read, PERMISSIONS.orders.create, PERMISSIONS.orders.update,PERMISSIONS.products.create,PERMISSIONS.products.read,PERMISSIONS.products.update],
  ADMIN:     [PERMISSIONS.orders.read, PERMISSIONS.orders.create, PERMISSIONS.orders.update,PERMISSIONS.orders.delete,PERMISSIONS.products.read,PERMISSIONS.products.create,PERMISSIONS.products.update,PERMISSIONS.products.delete],
};