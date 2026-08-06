import express from 'express';
import type {Request,Response,Application} from 'express';
import orderRouter from './routes/orders.js';
import {logger} from './middleware/logger.js';
import authRouter from './routes/authRoutes.js';

const app:Application = express();
const PORT = process.env.PORT ?process.env.PORT:3000

//middleware
app.use(express.json())
app.use(logger);
app.use('/api/v1',orderRouter);
app.use('/api/v1',authRouter);

app.get('/',(req:Request,res:Response)=>{
    return res.status(200).json({
        "health":"ok",
        "State":"Running"
    })
})


app.listen(PORT,()=>{
    console.log("Server running on http://localhost:3000/");
});

