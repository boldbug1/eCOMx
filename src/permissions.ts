import { Role } from '@prisma/client';

export const PERMISSIONS = {
  orders: { read: "orders:read", create: "orders:create", update: "orders:update", delete: "orders:delete" },
} as const;

type Resource = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]
export type Permission = Resource[keyof Resource];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  USER:      [PERMISSIONS.orders.read, PERMISSIONS.orders.create],
  MODERATOR: [PERMISSIONS.orders.read, PERMISSIONS.orders.create, PERMISSIONS.orders.update],
  ADMIN:     [PERMISSIONS.orders.read, PERMISSIONS.orders.create, PERMISSIONS.orders.update,PERMISSIONS.orders.delete],
};