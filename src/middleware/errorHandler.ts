// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(`[ERROR] ${err.message}`, err.stack);

  // Prisma unique constraint
  if (err.message.includes('Unique constraint')) {
    return res.status(409).json({ error: 'Record already exists' });
  }

  // Prisma record not found
  if (err.message.includes('Record to update not found') ||
      err.message.includes('No Member found')) {
    return res.status(404).json({ error: 'Not found' });
  }

  return res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
}
