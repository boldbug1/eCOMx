import express from 'express';
import {Request,Response,Router} from 'express'
import {OrderSchema} from "../types/order.js"
import { prisma } from '../db/prisma.js';
const orderRouter:Router = express.Router();


orderRouter.post('/orders',async (req:Request,res:Response)=>{
    const result = OrderSchema.safeParse(req.body);

    if(!result.success){
        return res.status(400).json({
            message:'Invalid result data',
            erros:result.error.format(),
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

orderRouter.get('/orders',async (req:Request,res:Response)=>{
    
    try{
        const allOrders = await prisma.order.findMany();

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

export default orderRouter;

