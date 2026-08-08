import {z} from 'zod';

export const OrderSchema = z.object({
    customerName:z.string().min(1,"Customer name is required"),
    items:z.array(
        z.object({
            productId:z.string(),
            quantity:z.number().int().positive(),
        })
    ).min(1,"Order must contain atleast 1 item"),
    status:z.enum(["pending","processing","completed"]).default("pending"),
})

export class OrderInputError extends Error {};
export type OrderSchema = z.infer<typeof OrderSchema>;
