import {z} from 'zod'

export const ProductSchema = z.object({
    name:z.string().min(1,"Product name cannot be empty"),
    description:z.string().min(1,"Product description cannot be empty"),
    price:z.float32().positive().min(0,"Product price cannot be less than 0"),
    stock:z.number().min(1,"Product stock cannot be less than 1")
})