import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  SetMetadata,
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { prisma as db } from "@commerce/database";
export type Actor = {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
};
export type CommerceRequest = Request & {
  actor?: Actor;
  requestId: string;
  sessionId?: string;
  cartToken?: string;
};
export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
export const Require = (permission = "authenticated") =>
  SetMetadata("permission", permission);
export const safeUser = (u: {
  id: string;
  email: string;
  name: string;
  role: string;
}) => ({ id: u.id, email: u.email, name: u.name, role: u.role });
export const rolePermissions: Record<string, string[]> = {
  admin: ["*"],
  super_admin: ["*"],
  customer: [],
  catalog: [
    "catalog.read",
    "catalog.write",
    "inventory.manage",
    "reviews.manage",
    "content.manage",
  ],
  operations: [
    "orders.read",
    "orders.manage",
    "refunds.issue",
    "customers.read",
    "inventory.manage",
  ],
  support: ["orders.read", "customers.read", "reviews.manage"],
  analyst: ["analytics.read", "catalog.read", "orders.read", "customers.read"],
  viewer: ["analytics.read", "catalog.read", "orders.read"],
};
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<CommerceRequest>();
    const token = req.cookies?.session;
    if (token) {
      const session = await db.session.findUnique({
        where: { tokenHash: digest(token) },
        include: {
          user: {
            include: {
              roles: {
                include: {
                  role: {
                    include: { permissions: { include: { permission: true } } },
                  },
                },
              },
            },
          },
        },
      });
      if (
        session &&
        !session.revokedAt &&
        session.user.status === "active" &&
        session.expiresAt > new Date()
      ) {
        req.actor = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: session.user.roles[0]?.role.name ?? "customer",
          permissions: session.user.roles.flatMap((r) =>
            r.role.permissions.map((p) => p.permission.key),
          ),
        };
        req.sessionId = session.id;
      }
    }
    const permission = this.reflector.getAllAndOverride<string>("permission", [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) return true;
    if (!req.actor) throw new UnauthorizedException("Sign in to continue");
    if (
      permission !== "authenticated" &&
      !req.actor.permissions.includes("*") &&
      !req.actor.permissions.includes(permission)
    )
      throw new ForbiddenException("Your role does not allow this action");
    return true;
  }
}
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<CommerceRequest>();
    const res = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const message =
      error instanceof HttpException
        ? error.message
        : "An unexpected server error occurred";
    if (status === 500)
      console.error(
        JSON.stringify({
          level: "error",
          requestId: req.requestId,
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    res.status(status).json({
      code:
        (
          {
            400: "VALIDATION_ERROR",
            401: "UNAUTHENTICATED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            409: "CONFLICT",
            429: "RATE_LIMITED",
          } as Record<number, string>
        )[status] ?? "INTERNAL_ERROR",
      message,
      requestId: req.requestId,
    });
  }
}
const rates = new Map<string, { count: number; expires: number }>();
export function safety(
  req: CommerceRequest,
  res: Response,
  next: NextFunction,
) {
  req.requestId =
    typeof req.headers["x-request-id"] === "string" &&
    /^[\w-]{1,64}$/.test(req.headers["x-request-id"])
      ? req.headers["x-request-id"]
      : newToken().slice(0, 24);
  res.setHeader("x-request-id", req.requestId);
  const started = Date.now();
  res.on("finish", () =>
    console.log(
      JSON.stringify({
        level: "info",
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - started,
      }),
    ),
  );
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !req.path.endsWith("/payments/webhook")
  ) {
    const origin = req.headers.origin;
    const allowed = (process.env.APP_ORIGIN ?? "http://localhost:3000").split(
      ",",
    );
    if (origin && !allowed.includes(origin))
      return res.status(403).json({
        code: "INVALID_ORIGIN",
        message: "Request origin is not allowed",
        requestId: req.requestId,
      });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return res.status(403).json({
        code: "CSRF_REJECTED",
        message: "Cross-site mutations are not allowed",
        requestId: req.requestId,
      });
  }
  const key = `${req.ip}:${req.path.startsWith("/api/v1/auth") ? "auth" : "api"}`;
  const now = Date.now();
  let r = rates.get(key);
  if (!r || r.expires < now) {
    r = { count: 0, expires: now + 60000 };
    rates.set(key, r);
  }
  r.count++;
  if (r.count > (req.path.startsWith("/api/v1/auth") ? 30 : 600))
    return res.status(429).json({
      code: "RATE_LIMITED",
      message: "Too many requests; try again shortly",
      requestId: req.requestId,
    });
  if (rates.size > 10000)
    for (const [k, v] of rates) if (v.expires < now) rates.delete(k);
  next();
}
