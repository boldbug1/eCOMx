import { Request, Response, NextFunction } from "express";

export const logger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const { method, originalUrl } = req;
    const { statusCode } = res;

    // Pick color based on HTTP status code
    let statusColor = "\x1b[32m"; // Green (2xx)
    if (statusCode >= 500)
      statusColor = "\x1b[31m"; // Red (5xx)
    else if (statusCode >= 400)
      statusColor = "\x1b[33m"; // Yellow (4xx)
    else if (statusCode >= 300) statusColor = "\x1b[36m"; // Cyan (3xx)

    const reset = "\x1b[0m";
    const timestamp = new Date().toLocaleTimeString();

    console.log(
      `[${timestamp}] ${method} ${originalUrl} ${statusColor}${statusCode}${reset} - ${duration}ms`,
    );
  });

  next();
};
