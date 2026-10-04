import "reflect-metadata";
import { Module, Get, Controller } from "@nestjs/common";
import { NestFactory, APP_GUARD } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { prisma as db } from "@commerce/database";
import { AuthGuard, ErrorFilter, safety } from "./security";
import { AdminMetadataController } from "./admin-metadata.controller";
import { PaymentsController } from "./payments.controller";
import { AuthController } from "./auth.controller";
import { CatalogController } from "./catalog.controller";
import { CartService } from "./cart.service";
import { CartController } from "./cart.controller";
import { CheckoutService } from "./checkout.service";
import { CheckoutController } from "./checkout.controller";
import { AccountController, TrackingController } from "./account.controller";
import { AdminCatalogController } from "./admin-catalog.controller";
import { AdminOrdersController } from "./admin-orders.controller";
import { AdminSystemController } from "./admin-system.controller";
@Controller()
class HealthController {
  @Get("health") health() {
    return {
      status: "ok",
      service: "fieldwork-api",
      time: new Date().toISOString(),
    };
  }
  @Get("ready") async ready() {
    await db.$queryRaw`SELECT 1`;
    return { status: "ok", database: "connected" };
  }
}
@Module({
  controllers: [
    HealthController,
    AdminMetadataController,
    PaymentsController,
    AuthController,
    CatalogController,
    CartController,
    CheckoutController,
    AccountController,
    TrackingController,
    AdminCatalogController,
    AdminOrdersController,
    AdminSystemController,
  ],
  providers: [
    CartService,
    CheckoutService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
export async function createApp() {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn"],
    rawBody: true,
  });
  app.use(helmet());
  app.use(cookieParser());
  app.use(safety);
  app.enableCors({
    origin: (process.env.APP_ORIGIN ?? "http://localhost:3000").split(","),
    credentials: true,
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ErrorFilter());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("FIELDWORK Commerce API")
      .setDescription(
        "Transactional commerce. Amounts are integer USD cents. Cookie session authentication; sensitive writes use Idempotency-Key.",
      )
      .setVersion("1.0")
      .addCookieAuth("session")
      .build(),
  );
  SwaggerModule.setup("docs", app, document);
  return app;
}
if (require.main === module)
  createApp().then((app) =>
    app.listen(Number(process.env.PORT ?? 4000), "0.0.0.0"),
  );
