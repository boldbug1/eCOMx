import express, { Router,Request,Response } from 'express'
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
const productRouter:Router = express.Router();


productRouter.get('/products',async (req:Request,res:Response)=>{
    const products = await prisma.product.findMany({});

    return res.status(200).json({
        products:products,
        message:"Products loaded successfully"
    })
})

productRouter.post('/products',requireAuth,requirePermission,(req:Request,res:Response)=>{
    
})