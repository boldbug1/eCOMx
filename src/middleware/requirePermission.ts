import { Request,Response,NextFunction } from 'express'
import { AuthRequest } from './requireAuth.js';
import { ROLE_PERMISSIONS } from '../permissions.js';
import { Permission } from '../permissions.js';

export const requirePermission = (permission: Permission) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    // order matters: requireAuth runs FIRST, so req.user should be set
    if (!req.user) return 401;                          // not authenticated
    if (!ROLE_PERMISSIONS[req.user.role].includes(permission)) return 403;  // authenticated, not allowed
    next();
  };