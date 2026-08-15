import { Response, NextFunction } from "express";
import { AuthRequest } from "./requireAuth.js";
import { ROLE_PERMISSIONS } from "../permissions.js";
import { Permission } from "../permissions.js";

export const requirePermission =
  (permission: Permission) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user)
      return res.status(401).json({ message: "Not authenticated" });
    if (!ROLE_PERMISSIONS[req.user.role].includes(permission)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
