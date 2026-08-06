import {z} from 'zod'


const registerSchema = z.object({
    email:z.email(),
    password:z.string().min(8,"Password must be 8 characters"),
})

const loginSchema = z.object({
    email:z.email(),
    password:z.string().min(1),
})