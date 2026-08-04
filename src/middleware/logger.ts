import express from 'express'
import type { Request,Response,NextFunction} from 'express'

function logger(req:Request,res:Response,next:NextFunction){
    console.log(req.header);
    console.log(req.body);
    next();
}

export default logger;
