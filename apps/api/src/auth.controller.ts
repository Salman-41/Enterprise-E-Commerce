import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  BadRequestException,
  UnauthorizedException,
  Delete,
  Param,
} from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { prisma as db } from "@commerce/database";
import * as argon2 from "argon2";
import type { Response } from "express";
import { z } from "zod";
import { CommerceRequest, digest, newToken, Require } from "./security";
import { emit, parse, serial } from "./helpers";
const credentials = z
  .object({
    email: z.email().transform((v) => v.toLowerCase()),
    password: z.string().min(8).max(128),
  })
  .strict();
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 30 * 86400000,
};
@Controller("auth")
@ApiTags("Authentication")
export class AuthController {
  private async session(userId: string, req: CommerceRequest, res: Response) {
    const token = newToken();
    await db.session.create({
      data: {
        userId,
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + 30 * 86400000),
        userAgent: req.headers["user-agent"]?.slice(0, 300),
      },
    });
    res.cookie("session", token, cookieOptions);
  }
  @Get("me") me(@Req() req: CommerceRequest) {
    return { user: req.actor ?? null };
  }
  @Post("register")
  @ApiOperation({ summary: "Register and create an HttpOnly session" })
  async register(
    @Body() raw: unknown,
    @Req() req: CommerceRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parse(
      credentials.extend({ name: z.string().min(2).max(100) }),
      raw,
    );
    if (await db.user.findUnique({ where: { email: input.email } }))
      throw new BadRequestException("This email is already registered");
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    const user = await serial(async (tx) => {
      const role = await tx.role.upsert({
        where: { name: "customer" },
        create: { name: "customer" },
        update: {},
      });
      const u = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
          roles: { create: { roleId: role.id } },
          loyalty: { create: { points: 0 } },
        },
      });
      const token = newToken();
      await tx.authToken.create({
        data: {
          email: u.email,
          purpose: "verify",
          tokenHash: digest(token),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await emit(tx, "email.send", {
        to: u.email,
        subject: "Verify your FIELDWORK account",
        text: `Verify: ${process.env.APP_ORIGIN ?? "http://localhost:3000"}/account/verify?token=${token}`,
      });
      return u;
    });
    await this.session(user.id, req, res);
    await this.mergeCart(user.id, req);
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: "customer",
        permissions: [],
      },
    };
  }
  @Post("login") async login(
    @Body() raw: unknown,
    @Req() req: CommerceRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parse(credentials, raw);
    const user = await db.user.findUnique({
      where: { email: input.email },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    if (
      !user ||
      user.status !== "active" ||
      !(await argon2.verify(user.passwordHash, input.password))
    )
      throw new UnauthorizedException("Email or password is incorrect");
    await this.session(user.id, req, res);
    await this.mergeCart(user.id, req);
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.roles[0]?.role.name ?? "Customer",
        permissions: user.roles.flatMap((r) =>
          r.role.permissions.map((p) => p.permission.key),
        ),
      },
    };
  }
  private async mergeCart(userId: string, req: CommerceRequest) {
    const token = req.cookies?.cart;
    if (!token) return;
    await serial(async (tx) => {
      const guest = await tx.cart.findUnique({
        where: { token },
        include: { items: true },
      });
      if (!guest || (guest.userId && guest.userId !== userId)) return;
      const own = await tx.cart.findFirst({
        where: { userId, id: { not: guest.id } },
        include: { items: true },
      });
      if (own) {
        for (const item of own.items) {
          await tx.cartItem.upsert({
            where: {
              cartId_variantId: { cartId: guest.id, variantId: item.variantId },
            },
            create: {
              cartId: guest.id,
              variantId: item.variantId,
              quantity: item.quantity,
            },
            update: { quantity: { increment: item.quantity } },
          });
        }
        await tx.cart.delete({ where: { id: own.id } });
      }
      await tx.cart.update({ where: { id: guest.id }, data: { userId } });
    });
  }
  @Post("logout") async logout(
    @Req() req: CommerceRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (req.sessionId)
      await db.session.update({
        where: { id: req.sessionId },
        data: { revokedAt: new Date() },
      });
    res.clearCookie("session", cookieOptions);
    return { ok: true };
  }
  @Post("rotate") @Require() async rotate(
    @Req() req: CommerceRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await db.session.update({
      where: { id: req.sessionId! },
      data: { revokedAt: new Date() },
    });
    await this.session(req.actor!.id, req, res);
    return { ok: true };
  }
  @Post("logout-all") @Require() async logoutAll(
    @Req() req: CommerceRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await db.session.updateMany({
      where: { userId: req.actor!.id },
      data: { revokedAt: new Date() },
    });
    res.clearCookie("session", cookieOptions);
    return { ok: true };
  }
  @Get("sessions") @Require() async sessions(@Req() req: CommerceRequest) {
    return {
      items: await db.session.findMany({
        where: {
          userId: req.actor!.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true, createdAt: true, expiresAt: true, userAgent: true },
      }),
    };
  }
  @Delete("sessions/:id") @Require() async revoke(
    @Req() req: CommerceRequest,
    @Param("id") id: string,
  ) {
    await db.session.updateMany({
      where: { id, userId: req.actor!.id },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
  @Post("forgot-password") async forgot(@Body() raw: unknown) {
    const { email } = parse(
      z.object({ email: z.email().transform((v) => v.toLowerCase()) }).strict(),
      raw,
    );
    const user = await db.user.findUnique({ where: { email } });
    if (user) {
      const token = newToken();
      await serial(async (tx) => {
        await tx.authToken.create({
          data: {
            email,
            purpose: "reset",
            tokenHash: digest(token),
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
        await emit(tx, "email.send", {
          to: email,
          subject: "Reset your FIELDWORK password",
          text: `Reset: ${process.env.APP_ORIGIN ?? "http://localhost:3000"}/account/reset?token=${token}`,
        });
      });
    }
    return {
      ok: true,
      message: "If this email exists, a reset link has been sent.",
    };
  }
  @Post("reset-password") async reset(@Body() raw: unknown) {
    const input = parse(
      z
        .object({
          token: z.string().length(64),
          password: z.string().min(8).max(128),
        })
        .strict(),
      raw,
    );
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    await serial(async (tx) => {
      const token = await tx.authToken.findUnique({
        where: { tokenHash: digest(input.token) },
      });
      if (
        !token ||
        token.purpose !== "reset" ||
        token.usedAt ||
        token.expiresAt < new Date()
      )
        throw new BadRequestException("Reset link is invalid or expired");
      await tx.user.update({
        where: { email: token.email },
        data: { passwordHash },
      });
      await tx.authToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      });
      await tx.session.updateMany({
        where: { user: { email: token.email } },
        data: { revokedAt: new Date() },
      });
    });
    return { ok: true };
  }
  @Post("change-password") @Require() async password(
    @Req() r: CommerceRequest,
    @Body() raw: unknown,
  ) {
    const i = parse(
      z
        .object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(8).max(128),
        })
        .strict(),
      raw,
    );
    const user = await db.user.findUnique({ where: { id: r.actor!.id } });
    if (!user || !(await argon2.verify(user.passwordHash, i.currentPassword)))
      throw new UnauthorizedException("Current password is incorrect");
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await argon2.hash(i.newPassword, {
          type: argon2.argon2id,
        }),
      },
    });
    await db.session.updateMany({
      where: { userId: user.id, id: { not: r.sessionId } },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
  @Post("verify") async verify(@Body() raw: unknown) {
    const { token: value } = parse(
      z.object({ token: z.string().length(64) }).strict(),
      raw,
    );
    await serial(async (tx) => {
      const token = await tx.authToken.findUnique({
        where: { tokenHash: digest(value) },
      });
      if (
        !token ||
        token.purpose !== "verify" ||
        token.usedAt ||
        token.expiresAt < new Date()
      )
        throw new BadRequestException("Verification link invalid or expired");
      await tx.user.update({
        where: { email: token.email },
        data: { emailVerifiedAt: new Date() },
      });
      await tx.authToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      });
    });
    return { ok: true };
  }
}
