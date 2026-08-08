import express from 'express';
import type {Request,Response,Application} from 'express';
import orderRouter from './routes/orders.js';
import {logger} from './middleware/logger.js';
import authRouter from './routes/authRoutes.js';
import productsRouter from './routes/products.js';
import cors,{CorsOptions} from 'cors'

export const app:Application = express();

const whiteList = ['http://localhost:3000']

const corsOptions:CorsOptions={
    origin:function(origin,callback){
        if(!origin||whiteList.indexOf(origin) !== -1){
            callback(null,true);
        }else{
            callback(new Error('Not allowed by CORS'))
        }
    },
    optionsSuccessStatus:200
}

//middleware
app.use(cors(corsOptions))
app.use(express.json())
app.use(logger);
app.use('/api/v1',orderRouter);
app.use('/api/v1',authRouter);
app.use('/api/v1',productsRouter);

app.get('/',(req:Request,res:Response)=>{
    return res.status(200).json({
        "health":"ok",
        "State":"Running"
    })
})