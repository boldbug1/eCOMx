import express from 'express';
import {Request,Response,Router} from 'express'
import {OrderSchema} from "../types/order.js"
import { prisma } from '../db/prisma.js';
const orderRouter:Router = express.Router();
import {z} from 'zod'
import { Prisma } from '@prisma/client';
import { AuthRequest, requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSIONS } from '../permissions.js';


orderRouter.post('/orders',requireAuth,requirePermission(PERMISSIONS.orders.create),async (req:AuthRequest,res:Response)=>{
    const result = OrderSchema.safeParse(req.body);

    if(!result.success){
        return res.status(400).json({
            message:'Invalid result data',
            errors:result.error.format(),
        });
    }

    const validatedOrder = result.data;

    try{
        const newOrder = await prisma.order.create({
            data:{
                customerName:validatedOrder.customerName,
                totalAmount:validatedOrder.totalAmount,
                status:validatedOrder.status,
                items:{
                    create:validatedOrder.items,
                },
                userId:req.user!.id,
            },

            include:{
                items:true,
            }
        });

        return res.status(201).json({
            message:"Order created",
            order:newOrder
        })
    }catch(e){
        console.log("Error creating order: ",e);
        return res.status(500).json({
            message:"Internal server error while creating the order",
        })
    }
})

orderRouter.get('/orders',requireAuth,async (req:AuthRequest,res:Response)=>{
    try{
        const allOrders = await prisma.order.findMany({
            where:{
                userId:req.user!.id
            },
            include:{items:true}
        });

        return res.status(200).json({
            orders:allOrders,
            message:"All orders were loaded succesfully"
        })
    }catch(e){
        return res.status(500).json({
            message:"Internal server error while fetching the database"
        })
    }


})

orderRouter.get('/orders/:id',requireAuth,async (req:AuthRequest,res:Response)=>{
    try{
         let id = req.params.id;

        if(Array.isArray(id)){
            id=id[0]
        }

        if (!id || typeof id !== 'string') {
            return res.status(400).json({ error: "Invalid ID format" });
        }

        const order = await prisma.order.findUnique({
            where:{
                id:id,
                userId:req.user!.id,
            },
            include:{items:true}
        })

        if(!order){
            return res.status(404).json({
                message:"Order not found",
            })
        }

        return res.status(200).json({
            order:order,
            message:"order succesfully found",
        })
    }catch(e){
        return res.status(500).json({
            message:"Internal server error",
        })
    }
})

orderRouter.patch('/orders/:id',requireAuth,requirePermission(PERMISSIONS.orders.update),async (req:AuthRequest,res:Response)=>{
try{
    let id =req.params.id as string; 

    if(Array.isArray(id)){
        id = id[0]
    }

    const patchSchema = OrderSchema.partial();
    const validatedData = patchSchema.parse(req.body);

    if(Object.keys(validatedData).length == 0){
        return res.status(400).json({
            message:"Empty request body"
        })
    }

    const {items,...otherFields} = validatedData;

    const prismaUpdateData:Prisma.OrderUpdateInput = {...otherFields};

    if(items){
        prismaUpdateData.items = {
            deleteMany:{},
            create:items.map(item=>({
                productId:item.productId,
                price:item.price,
                quantity:item.quantity,
            }))
        };
    }

    
    const updatedOrder = await prisma.order.update({
            where:{
                id:id,
                userId:req.user!.id,
            },
            data:prismaUpdateData,
            include:{items:true}
        });

    return res.status(200).json({
            order:updatedOrder,
            message:"Order updated successfully"
        })
    }catch(e){
        if (e instanceof z.ZodError) {
            return res.status(400).json({ errors: e.issues });
        }

        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return res.status(404).json({
                    message: "Order to be updated not found"
                });
            }
        }

        console.log(e);
        return res.status(500).json({
            message: "Internal server error"
        });
    }
})

orderRouter.delete('/orders/:id',requireAuth,requirePermission(PERMISSIONS.orders.delete),async (req:AuthRequest,res:Response)=>{
    try{
        const id = req.params.id as string;

        const deletedOrder = await prisma.order.delete({
            where:{
                id:id,
                userId:req.user!.id,
            }
        })

    return res.status(200).json({
            message:"Deleted succesfully"
        })
    }catch(e){
        if(e instanceof Prisma.PrismaClientKnownRequestError){
            if(e.code === 'P2025'){
                return res.status(404).json({
                    message:"Order to be deleted not found"
                })
            }
        }

        return res.status(500).json({
            message:"Internal server error",
        })
    }
})

export default orderRouter;

