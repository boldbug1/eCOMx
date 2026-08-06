import jwt from 'jsonwebtoken'
// src/services/auth.ts
export function signToken(user: { id: string; role: string }) {
    return jwt.sign(
        { sub: user.id, role: user.role },
        process.env.JWT_SECRET!,
        { expiresIn: '1h' }
    );
}