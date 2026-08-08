import express from 'express'
import { Request,Response,Router} from 'express'
import {registerSchema,loginSchema} from '../types/auth.js'
import { prisma } from '../db/prisma.js';
import {Prisma} from '@prisma/client'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken';
import { signToken } from '../services/auth.js';

const authRouter:Router = express.Router();

authRouter.post('/register',async (req:Request,res:Response)=>{
    const result = registerSchema.safeParse(req.body);

    if(!result.success){
        return res.status(400).json({
            message:"Invalid credentials format"
        })
    }

    const {email,password} = result.data;

    try{
        const passwordHash = await bcrypt.hash(password,10);
        const user = await prisma.user.create({
            data:{
                email:email,
                password:passwordHash,//?so we dont store passwords in db , we store it's hash
            },
        })

        if(!process.env.JWT_SECRET){throw new Error("Missing JWT_SECRET")}

        const token = signToken(user);

        return res.status(201).json({
            token,
            message:'User registered'
        })
    }catch(e){
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code==='P2002'){
            return res.status(409).json({
                message:"Email already exists"
            })

        }
            console.log(e);
            return res.status(500).json({
                message:"Internal server error"
            })
    }
        
})

authRouter.post('/login',async(req:Request,res:Response)=>{
    const result = loginSchema.safeParse(req.body);

    if(!result.success){
        return res.status(400).json({
            message:"Invalid credentials"
        })
    }

    const {email,password} = result.data;

    try{
    const user = await prisma.user.findUnique({
            where:{
                email,
            }
        })

    if(!user){
        return res.status(401).json({
            message:"Invalid email or password"
        })
    }

    const passwordMatches = await bcrypt.compare(password,user.password)

    if(!passwordMatches){
        return res.status(401).json({
            message:"Invalid email or password"
        })
    }

    const token = signToken(user);

    return res.status(200).json({
        message:"logged in",
        user:{
            id:user.id,
            email:user.email,
            token,
        }
    });
    }catch(e){
        console.log(e);
        return res.status(500).json({
            message:"Internal server error"
        })
    }
})

export default authRouter;

