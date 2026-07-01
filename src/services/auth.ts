import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET!;

export function signToken(id: string): string {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): { id: string } {
  return jwt.verify(token, JWT_SECRET) as { id: string };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  try {
    const token = header.split(' ')[1];
    const payload = verifyToken(token);
    (req as any).ownerId = payload.id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}