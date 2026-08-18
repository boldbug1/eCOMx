import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export const notFoundHandler = (req: Request, res: Response) => {
  return res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: "Invalid request data",
      errors: err.issues,
    });
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      message: "Malformed JSON body",
    });
  }

  console.error(err);
  return res.status(500).json({
    message: "Internal server error",
  });
};
