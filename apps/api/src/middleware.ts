
import type {  Request , Response, NextFunction } from "express";
import jwt from "jsonwebtoken";


const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: "USER" | "SERVICE_PROVIDER" };

    req.userId = decoded.id;
    req.role =  decoded.role
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
}
