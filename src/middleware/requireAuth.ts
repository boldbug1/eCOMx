import express from 'express'
import { Request,Response,NextFunction } from 'express'
import jwt from 'jsonwebtoken'

interface AuthRequest extends Request{
    user?:{id:string,role:string}
}

export function requireAuth(req:AuthRequest,res:Response,next:NextFunction){
    const header = req.headers.authorization;

    if(!header?.startsWith('Bearer')){
        return res.status(401).json({
            message:"Invalid Missing token"
        })
    }

    try{
        const payload = jwt.verify(header.slice(7),process.env.JWT_SECRET!) as{
            sub:string,
            role:string
        }

        req.user = {
            id:payload.sub,
            role:payload.role
        }
        next();
    }catch(e){
        return res.status(401).json({
            message:"Invalid or expired credentials",
        });
    }
}