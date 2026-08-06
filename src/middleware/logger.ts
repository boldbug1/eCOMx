import type { Request, Response, NextFunction } from 'express';
//to-do
function logger(req: Request, res: Response, next: NextFunction) {
    const timestamp = new Date().toISOString();
    
    console.log(`\n[${timestamp}] ${req.method} ${req.originalUrl}`);
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    
    next();
}

export default logger;