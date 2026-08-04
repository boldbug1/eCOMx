import express from 'express';
import type {Request,Response,Application} from 'express';
import orderRouter from './routes/orders.js';
import logger from './middleware/logger.js';

const app:Application = express();

app.get('/',(req:Request,res:Response)=>{
    return res.status(200).json({
        "health":"ok",
        "State":"Running"
    })
})

app.use(express.json())
app.use(logger);
app.use('/api/v1',orderRouter);


app.listen('3000',()=>{
    console.log("Server started....");
});

