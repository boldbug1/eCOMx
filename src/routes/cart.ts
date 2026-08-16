import express from 'express'
import { Request, Response, Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js';
import { prisma } from '../db/prisma.js';
import { AuthRequest } from '../middleware/requireAuth.js';
import { addCartItemSchema, updateCartItemSchema } from '../types/cart.js';

const cartRouter: Router = express.Router();

cartRouter.get('/cart', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    let cart = await prisma.cart.findUnique({
      where: { userId: req.user!.id },
      include: { items: { include: { product: true } } }
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId: req.user!.id },
        include: { items: { include: { product: true } } }
      });
    }

    return res.status(200).json({
      cart,
      message: "Successfully loaded"
    });
  } catch (e) {
    console.log(e);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});


cartRouter.post('/cart/items', requireAuth, async (req: AuthRequest, res: Response) => {
  const result = addCartItemSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      message: "Invalid input format"
    });
  }

  const { productId, quantity } = result.data;

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({
        message: "Product not found"
      });
    }

    let cart = await prisma.cart.findUnique({
      where: { userId: req.user!.id }
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId: req.user!.id }
      });
    }

    const existingItem = await prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId: productId
        }
      }
    });

    let cartItem;

    if (existingItem) {
      cartItem = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: existingItem.quantity + quantity }
      });
    } else {
      cartItem = await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId,
          quantity
        }
      });
    }

    return res.status(200).json({
      cartItem,
      message: "Item added to cart"
    });

  } catch (e) {
    console.log(e);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});


cartRouter.patch('/cart/items/:itemId', requireAuth, async (req: AuthRequest, res: Response) => {
  const result = updateCartItemSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      message: "Invalid input format"
    });
  }

  const itemId = req.params.itemId as string;
  const { quantity } = result.data;

  try {
    const existingItem = await prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true }
    });

    if (!existingItem) {
      return res.status(404).json({
        message: "Cart item not found"
      });
    }

    if (existingItem.cart.userId !== req.user!.id) {
      return res.status(403).json({
        message: "Forbidden"
      });
    }

    const updatedItem = await prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity }
    });

    return res.status(200).json({
      cartItem: updatedItem,
      message: "Cart item updated"
    });

  } catch (e) {
    console.log(e);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});


cartRouter.delete('/cart/items/:itemId', requireAuth, async (req: AuthRequest, res: Response) => {
  const itemId = req.params.itemId as string;

  try {
    const existingItem = await prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true }
    });

    if (!existingItem) {
      return res.status(404).json({
        message: "Cart item not found"
      });
    }

    if (existingItem.cart.userId !== req.user!.id) {
      return res.status(403).json({
        message: "Forbidden"
      });
    }

    await prisma.cartItem.delete({
      where: { id: itemId }
    });

    return res.status(200).json({
      message: "Item removed from cart"
    });

  } catch (e) {
    console.log(e);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});


cartRouter.delete('/cart', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const cart = await prisma.cart.findUnique({
      where: { userId: req.user!.id }
    });

    if (!cart) {
      return res.status(404).json({
        message: "Cart not found"
      });
    }

    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id }
    });

    return res.status(200).json({
      message: "Cart cleared"
    });

  } catch (e) {
    console.log(e);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});


export default cartRouter;