import express, { Router,Request,Response } from 'express'
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSIONS } from '../permissions.js';
import { ProductSchema } from '../types/product.js';
import {AuthRequest} from '../middleware/requireAuth.js'
import { Prisma } from '@prisma/client';
import {redis} from '../services/redis.js' 

const productsRouter:Router = express.Router();

productsRouter.get('/products',async (req:Request,res:Response)=>{
    const products = await prisma.product.findMany({});

    return res.status(200).json({
        products:products,
        message:"Products loaded successfully"
    })
})

productsRouter.get('/products/:id',async (req:Request,res:Response)=>{
    let id = req.params.id as string;

    const cacheKey = `product:${id}`;//creates cache key
    const cached = await redis.get(cacheKey);//looks up in cache
    if(cached){//cache hit
        try{
            return res.status(200).json({
                product:JSON.parse(cached),
                message:"found"
            });    
        }catch(e){
            console.log(e);
            return res.status(500).json({
                message:"Internal server error"
            })
        }
    }
    try{//cache miss
        const product = await prisma.product.findUnique({
            where:{
                id:id,
            }
        })
    
        if(!product){
            return res.status(404).json({
                message:"Not found"
            })
        }
        
        await redis.set(cacheKey,JSON.stringify(product),"EX",3600);
        return res.status(200).json({
            product:product,
            message:"Product found"
        })
    }catch(e){
        if(e instanceof Prisma.PrismaClientKnownRequestError){
            return res.status(404).json({
                message:"Id not found"
            })
        }

        console.log(e);
        return res.status(500).json({
            message:"Internal server error"
        })
    }
})

productsRouter.post('/products',requireAuth,requirePermission(PERMISSIONS.products.create),async(req:AuthRequest,res:Response)=>{
    const result = ProductSchema.safeParse(req.body);

    if(!result.success){
        return res.status(400).json({
            message:"Invalid product format"
        })
    }

    const validatedProduct = result.data;

    try{
        const createdProduct = await prisma.product.create({
            data:{
                ...validatedProduct,
                createdById:req.user!.id,
            }
        })

        return res.status(201).json({
            product:createdProduct,
            message:"Product created"
        })
    }catch(e){
        return res.status(500).json({
            message:"Internal server error"
        })
    }
})

productsRouter.patch('/products/:id',requireAuth,requirePermission(PERMISSIONS.products.update),async(req:AuthRequest,res:Response)=>{
    let id = req.params.id as string;

    const patchSchema = ProductSchema.partial();
    const result = patchSchema.safeParse(req.body);

    if(!result.success){
        return res.status(400).json({
            message:"Invalid product format"
        })
    }

    const validatedData = result.data

    if(Object.keys(validatedData).length === 0){
        return res.status(400).json({
            message:"Empty body"
        })
    }
    try{
        const updatedProduct = await prisma.product.update({
            where:{
                id:id,
            },
            data:{
                ...validatedData
            }
        })

        await redis.del(`product:${id}`);

        return res.status(200).json({
            product:updatedProduct,
            message:"Product updated",
        })
    }catch(e){
        if(e instanceof Prisma.PrismaClientKnownRequestError){
            return res.status(404).json({
                message:"Id not found"
            })
        }
        console.log(e);
        return res.status(500).json({
            message:"Internal server error"
        })
    }
})

productsRouter.delete('/products/:id',requireAuth,requirePermission(PERMISSIONS.products.delete),async(req:AuthRequest,res:Response)=>{
    let id = req.params.id as string;

    const usedCount = await prisma.orderItem.count({ where: { productId: id } });
    if (usedCount > 0) {
        return res.status(400).json({ message: "Cannot delete — product has order history. Set stock to 0 instead." });
    }
    try{
        const deletedProduct = await prisma.product.delete({
            where:{
                id:id,
            }
        })

        await redis.del(`product:${id}`);

        return res.status(200).json({
                product:deletedProduct,
                message:"Deleted successfully"
        })
    }catch(e){
       if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') return res.status(404).json({ message: "Product not found" });
            if (e.code === 'P2003') return res.status(400).json({ message: "Cannot delete , product has order history. Set stock to 0 instead." });
            }

        console.log(e);
        return res.status(500).json({
            message:"Internal server error"
        })
    }
})

export default productsRouter;