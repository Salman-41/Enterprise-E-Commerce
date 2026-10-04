import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import nodemailer from "nodemailer";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};
export class SmtpEmailProvider {
  private transporter;
  constructor(
    private readonly from: string,
    url: string,
  ) {
    this.transporter = nodemailer.createTransport(url);
  }
  async send(message: EmailMessage, deliveryId: string) {
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to) ||
      /[\r\n]/.test(message.subject)
    )
      throw new Error("Invalid email envelope");
    // Stable message ID assists downstream deduplication, but SMTP is not exactly once.
    return this.transporter.sendMail({
      ...message,
      from: this.from,
      messageId: `<${deliveryId}@commerce.local>`,
    });
  }
}

export interface SearchProduct {
  id: string;
  title: string;
  slug: string;
  description: string;
  brand: string;
  category: string;
  priceCents: number;
  rating: number;
  available: boolean;
  tags: string[];
  sku: string[];
  options: string[];
}
export class ProductSearch {
  private configured = false;
  constructor(
    private readonly url: string,
    private readonly key: string,
  ) {}
  private async request(path: string, method = "GET", body?: unknown) {
    const result = await fetch(`${this.url.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!result.ok) throw new Error(`Search service HTTP ${result.status}`);
    return result.json() as Promise<{
      taskUid?: number;
      status?: string;
      error?: { message: string };
      [key: string]: unknown;
    }>;
  }
  async wait(taskUid?: number) {
    if (taskUid === undefined) return;
    for (let attempt = 0; attempt < 100; attempt++) {
      const task = await this.request(`/tasks/${taskUid}`);
      if (task.status === "succeeded") return;
      if (task.status === "failed" || task.status === "canceled")
        throw new Error(task.error?.message ?? "Search indexing failed");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("Search indexing timeout");
  }
  async configure() {
    try {
      await this.request("/indexes/products");
    } catch {
      await this.wait(
        (
          await this.request("/indexes", "POST", {
            uid: "products",
            primaryKey: "id",
          })
        ).taskUid,
      );
    }
    await this.wait(
      (
        await this.request("/indexes/products/settings", "PATCH", {
          searchableAttributes: [
            "title",
            "brand",
            "category",
            "tags",
            "sku",
            "options",
            "description",
          ],
          filterableAttributes: [
            "brand",
            "category",
            "priceCents",
            "rating",
            "available",
            "tags",
            "options",
          ],
          sortableAttributes: ["priceCents", "rating", "title"],
        })
      ).taskUid,
    );
    this.configured = true;
  }
  async clear() {
    if (!this.configured) await this.configure();
    await this.wait(
      (await this.request("/indexes/products/documents", "DELETE")).taskUid,
    );
  }
  async upsert(products: SearchProduct[]) {
    if (!this.configured) await this.configure();
    await this.wait(
      (await this.request("/indexes/products/documents", "POST", products))
        .taskUid,
    );
  }
  async remove(id: string) {
    if (!this.configured) await this.configure();
    await this.wait(
      (
        await this.request(
          `/indexes/products/documents/${encodeURIComponent(id)}`,
          "DELETE",
        )
      ).taskUid,
    );
  }
  async query(
    q: string,
    options: {
      offset?: number;
      limit?: number;
      filter?: string[];
      sort?: string[];
    } = {},
  ) {
    return this.request("/indexes/products/search", "POST", {
      q: q.slice(0, 200),
      ...options,
      limit: Math.min(options.limit ?? 24, 100),
    });
  }
}

const uploadTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;
export function uploadKey(mime: string, size: number, ownerId: string) {
  if (!(mime in uploadTypes)) throw new Error("Unsupported upload type");
  if (!Number.isSafeInteger(size) || size < 1 || size > 10 * 1024 * 1024)
    throw new Error("Upload must be between 1 byte and 10 MiB");
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(ownerId)) throw new Error("Invalid owner");
  return `uploads/${ownerId}/${randomUUID()}.${uploadTypes[mime as keyof typeof uploadTypes]}`;
}
export function validFileSignature(bytes: Uint8Array, mime: string) {
  const b = Buffer.from(bytes);
  if (mime === "image/png")
    return b
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/jpeg")
    return b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (mime === "image/webp")
    return (
      b.subarray(0, 4).toString() === "RIFF" &&
      b.subarray(8, 12).toString() === "WEBP"
    );
  if (mime === "application/pdf")
    return b.subarray(0, 5).toString() === "%PDF-";
  return false;
}
export class ObjectStorage {
  private readonly client: S3Client;
  constructor(
    private readonly bucket: string,
    options: {
      endpoint: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
    },
  ) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }
  async signedUpload(mime: string, size: number, ownerId: string) {
    const key = uploadKey(mime, size, ownerId);
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mime,
        ContentLength: size,
      }),
      { expiresIn: 300 },
    );
    return { key, url, expiresIn: 300 };
  }
  async verify(key: string, ownerId: string, mime: string, size: number) {
    if (
      !/^[a-zA-Z0-9_-]{1,80}$/.test(ownerId) ||
      !new RegExp(
        `^uploads/${ownerId}/[a-f0-9-]{36}\\.(jpg|png|webp|pdf)$`,
      ).test(key)
    )
      throw new Error("Invalid object ownership");
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (
      head.ContentType !== mime ||
      head.ContentLength !== size ||
      size > 10 * 1024 * 1024
    ) {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      throw new Error("Uploaded object does not match declared file");
    }
    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: "bytes=0-11",
      }),
    );
    const bytes = await object.Body?.transformToByteArray();
    if (!bytes || !validFileSignature(bytes, mime)) {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      throw new Error("File signature does not match declared type");
    }
    return key;
  }
  async signedDownload(key: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: 300 },
    );
  }
  async put(key: string, body: Buffer, mime: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mime,
      }),
    );
  }
}

export function verifyStripeSignature(
  raw: Buffer,
  signature: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!secret.startsWith("whsec_"))
    throw new Error("Webhook secret is not configured");
  const entries = signature.split(",").map((part) => part.split("="));
  const timestamp = Number(entries.find(([key]) => key === "t")?.[1]);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > 300
  )
    throw new Error("Expired webhook signature");
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(raw)
    .digest();
  const valid = entries
    .filter(([key]) => key === "v1")
    .some(([, value]) => {
      if (!value || !/^[a-f0-9]{64}$/i.test(value)) return false;
      return timingSafeEqual(expected, Buffer.from(value, "hex"));
    });
  if (!valid) throw new Error("Invalid webhook signature");
  return JSON.parse(raw.toString("utf8")) as {
    id: string;
    type: string;
    data: unknown;
  };
}
export class StripeTestProvider {
  constructor(private readonly secret: string) {
    if (!secret.startsWith("sk_test_"))
      throw new Error("Only Stripe test mode is supported");
  }
  async createIntent(amount: number, currency: string, idempotencyKey: string) {
    if (!Number.isSafeInteger(amount) || amount < 1)
      throw new Error("Invalid payment amount");
    const response = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secret}`,
        "Idempotency-Key": idempotencyKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        amount: String(amount),
        currency,
        "automatic_payment_methods[enabled]": "true",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(`Stripe test provider HTTP ${response.status}`);
    return response.json() as Promise<{
      id: string;
      client_secret: string;
      status: string;
    }>;
  }
}
