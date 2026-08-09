import express from 'express';
import {Request,Response,Router} from 'express'
import {OrderSchema,OrderInputError} from "../types/order.js"
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
        const newOrder = await prisma.$transaction(async (tx) => {
        const productIds = validatedOrder.items.map((i) => i.productId);    
        const products = await tx.product.findMany({ where: { id: { in: productIds } } });
        const byId = new Map(products.map((p) => [p.id, p]));

        for (const item of validatedOrder.items) {
            const product = byId.get(item.productId);
            if (!product) throw new OrderInputError(`Product ${item.productId} does not exist`);
            if (product.stock < item.quantity)
                throw new OrderInputError(`Only ${product.stock} left of "${product.name}"`);
        }

     
        const totalAmount = validatedOrder.items.reduce(
        (sum, i) => sum + byId.get(i.productId)!.price * i.quantity, 0);

        const order = await tx.order.create({
        data: {
            customerName: validatedOrder.customerName,
            totalAmount,
            status: validatedOrder.status,
            userId: req.user!.id,
            items: {
            create: validatedOrder.items.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                price: byId.get(i.productId)!.price,   
            })),
            },
        },
        include: { items: true },
        });

        for (const item of validatedOrder.items) {
        const result = await tx.product.updateMany({
            where: { id: item.productId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
        });
        if (result.count === 0) throw new OrderInputError("Stock changed while ordering , try again");
        }

        return order;
    }); 
    return res.status(201).json({
        order:newOrder,
        message:"Order created"
    })  
    }catch(e){
        if (e instanceof OrderInputError) return res.status(400).json({ message: e.message });
        if (e instanceof Prisma.PrismaClientKnownRequestError) return res.status(400).json({ message: "Invalid order request" });
        console.log(e);
        return res.status(500).json({ message: "Internal server error while creating the order" });
    }
})

orderRouter.get('/orders',requireAuth,async (req:AuthRequest,res:Response)=>{
    try{
        const isStaff = req.user!.role === 'ADMIN'
        let allOrders;
        if(isStaff){
            allOrders = await prisma.order.findMany({
                include:{items:true}
            });
        }else{
            allOrders = await prisma.order.findMany({
                where:{
                    userId:req.user!.id
                },
                include:{items:true}
            });
        }

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
        const isStaff = req.user!.role === 'ADMIN'
        if(Array.isArray(id)){
            id=id[0]
        }

        if (!id || typeof id !== 'string') {
            return res.status(400).json({ error: "Invalid ID format" });
        }
        let order;
        if(isStaff){
            order = await prisma.order.findUnique({
                where:{
                    id:id,
                },
                include:{items:true}
            })
        }else{
            order = await prisma.order.findUnique({
                where:{
                    id:id,
                    userId:req.user!.id,
                },
                include:{items:true}
            })
        }

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

orderRouter.patch('/orders/:id', requireAuth, requirePermission(PERMISSIONS.orders.update), async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const patchSchema = OrderSchema.partial();
    const validatedData = patchSchema.parse(req.body);            

    if (Object.keys(validatedData).length === 0) {
      return res.status(400).json({ message: "Empty request body" });
    }

    const { items, ...otherFields } = validatedData;

    
    const existing = await prisma.order.findUnique({ where: { id, userId: req.user!.id } });
    if (!existing) return res.status(404).json({ message: "Order to be updated not found" });

    const updatedOrder = await prisma.$transaction(async (tx) => {
      
      const current = await tx.order.findUnique({ where: { id }, include: { items: true } });

      const data: Prisma.OrderUpdateInput = { ...otherFields };

      if (items) {
        
        if (current!.status !== 'pending') {
          throw new OrderInputError("Only pending orders can be edited");
        }

        
        for (const oldItem of current!.items) {
          await tx.product.update({
            where: { id: oldItem.productId },
            data: { stock: { increment: oldItem.quantity } },
          });
        }

        
        const productIds = items.map((i) => i.productId);
        const products = await tx.product.findMany({ where: { id: { in: productIds } } });
        const byId = new Map(products.map((p) => [p.id, p]));

        
        for (const item of items) {
          const p = byId.get(item.productId);
          if (!p) throw new OrderInputError(`Product ${item.productId} does not exist`);
          if (p.stock < item.quantity) throw new OrderInputError(`Only ${p.stock} left of "${p.name}"`);
        }

        
        for (const item of items) {
          const r = await tx.product.updateMany({
            where: { id: item.productId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });
          if (r.count === 0) throw new OrderInputError("Stock changed while updating — try again");
        }

        
        data.items = {
          deleteMany: {},
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: byId.get(item.productId)!.price,
          })),
        };
      }

      return tx.order.update({ where: { id }, data, include: { items: true } });
    });

    return res.status(200).json({ order: updatedOrder, message: "Order updated successfully" });
  } catch (e) {
    if (e instanceof OrderInputError) return res.status(400).json({ message: e.message });
    if (e instanceof z.ZodError) return res.status(400).json({ errors: e.issues });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return res.status(404).json({ message: "Order to be updated not found" });  
    }
    console.log(e);
    return res.status(500).json({ message: "Internal server error" });
  }
});

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
