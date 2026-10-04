import { PrismaClient, Prisma } from "@prisma/client";
import argon2 from "argon2";
const db = new PrismaClient();
const base = new Date("2026-09-30T12:00:00.000Z");
const day = 86400000;
const categories = [
  "Outerwear",
  "Knitwear",
  "Shirts",
  "Trousers",
  "Dresses",
  "Footwear",
  "Bags",
  "Accessories",
  "Home",
  "Lighting",
  "Audio",
  "Wellness",
];
const brands = [
  "Form & Field",
  "Studio North",
  "Common Ground",
  "Atelier Nine",
  "Everform",
  "Mono Works",
  "Archive Supply",
  "Sunday Objects",
  "Aural",
  "Kin",
];
const collections = [
  "The Autumn Edit",
  "Everyday Essentials",
  "Objects of Home",
  "Quiet Technology",
  "Weekend Away",
  "New Perspectives",
];
const titles: Record<string, string[]> = {
  Outerwear: [
    "Wool Overcoat",
    "Utility Jacket",
    "Quilted Vest",
    "Rain Shell",
    "Field Coat",
    "Linen Blazer",
    "Canvas Parka",
    "Cropped Jacket",
    "Suede Overshirt",
    "Down Gilet",
  ],
  Knitwear: [
    "Merino Crew",
    "Ribbed Cardigan",
    "Cashmere Knit",
    "Cable Sweater",
    "Cotton Pullover",
    "Mock Neck",
    "Relaxed Vest",
    "Waffle Knit",
    "Fine Knit Polo",
    "Alpaca Cardigan",
  ],
  Shirts: [
    "Oxford Shirt",
    "Linen Shirt",
    "Poplin Shirt",
    "Camp Collar",
    "Cotton Tee",
    "Rugby Shirt",
    "Flannel Shirt",
    "Chambray Shirt",
    "Boxy Tee",
    "Henley",
  ],
  Trousers: [
    "Pleated Trouser",
    "Straight Jean",
    "Wide Pant",
    "Utility Pant",
    "Linen Trouser",
    "Chino",
    "Corduroy Pant",
    "Relaxed Jean",
    "Wool Trouser",
    "Travel Pant",
  ],
  Dresses: [
    "Linen Dress",
    "Knit Dress",
    "Midi Dress",
    "Poplin Dress",
    "Wrap Dress",
    "Slip Dress",
    "Shirt Dress",
    "Column Dress",
    "Cotton Dress",
    "Tiered Dress",
  ],
  Footwear: [
    "Leather Sneaker",
    "Suede Loafer",
    "Chelsea Boot",
    "Canvas Trainer",
    "Trail Shoe",
    "Leather Sandal",
    "Running Shoe",
    "Ankle Boot",
    "Derby Shoe",
    "House Slipper",
  ],
  Bags: [
    "Canvas Tote",
    "Leather Crossbody",
    "Travel Duffel",
    "Daypack",
    "Mini Shoulder Bag",
    "Market Tote",
    "Laptop Sleeve",
    "Weekend Bag",
    "Leather Satchel",
    "Belt Bag",
  ],
  Accessories: [
    "Wool Scarf",
    "Leather Belt",
    "Silk Bandana",
    "Cotton Cap",
    "Ribbed Beanie",
    "Minimal Watch",
    "Steel Bracelet",
    "Card Holder",
    "Leather Wallet",
    "Sunglasses",
  ],
  Home: [
    "Ceramic Vase",
    "Linen Throw",
    "Oak Tray",
    "Stoneware Bowl",
    "Cotton Cushion",
    "Glass Carafe",
    "Wool Blanket",
    "Ceramic Mug",
    "Serving Board",
    "Scented Candle",
  ],
  Lighting: [
    "Table Lamp",
    "Pendant Light",
    "Desk Lamp",
    "Wall Sconce",
    "Floor Lamp",
    "Portable Lantern",
    "Reading Light",
    "Glass Pendant",
    "Accent Lamp",
    "Bedside Lamp",
  ],
  Audio: [
    "Wireless Headphones",
    "Bluetooth Speaker",
    "Studio Earbuds",
    "Desktop Speaker",
    "Travel Headphones",
    "Portable Radio",
    "Turntable",
    "Sound Bar",
    "Noise Canceling Buds",
    "Compact Speaker",
  ],
  Wellness: [
    "Yoga Mat",
    "Steel Water Bottle",
    "Foam Roller",
    "Exercise Band",
    "Meditation Cushion",
    "Gym Towel",
    "Massage Ball",
    "Pilates Ring",
    "Balance Board",
    "Stretch Strap",
  ],
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo seed is disabled in production");
  // Seed refuses a populated database rather than destructively deleting real records.
  if (await db.product.count())
    throw new Error(
      "Database contains products; use a fresh demo database to seed",
    );
  const passwords = [
    "DemoAdmin!2026",
    "DemoOps!2026",
    "DemoViewer!2026",
    "DemoCustomer!2026",
  ];
  const hashes = await Promise.all(
    passwords.map((password) =>
      argon2.hash(password, {
        type: argon2.argon2id,
      }),
    ),
  );
  const accountEmails = [
    "admin@example.com",
    "ops@example.com",
    "viewer@example.com",
    "customer@example.com",
  ];
  const permissions = [
    "catalog.read",
    "catalog.write",
    "inventory.manage",
    "reviews.manage",
    "orders.read",
    "orders.manage",
    "refunds.issue",
    "customers.read",
    "promotions.manage",
    "content.manage",
    "analytics.read",
    "system.admin",
  ];
  await db.permission.createMany({
    data: permissions.map((key) => ({
      id: `permission-${key}`,
      key,
    })),
  });
  const roles: Record<string, string[]> = {
    admin: permissions,
    operations: [
      "catalog.read",
      "inventory.manage",
      "orders.read",
      "orders.manage",
      "refunds.issue",
      "customers.read",
    ],
    catalog: [
      "catalog.read",
      "catalog.write",
      "inventory.manage",
      "reviews.manage",
      "content.manage",
    ],
    analyst: ["catalog.read", "orders.read", "analytics.read"],
    customer: [],
  };
  for (const [name, keys] of Object.entries(roles))
    await db.role.create({
      data: {
        id: `role-${name}`,
        name,
        permissions: {
          create: keys.map((key) => ({
            permissionId: `permission-${key}`,
          })),
        },
      },
    });
  for (let i = 0; i < 104; i++) {
    const account =
      i < 4
        ? ["admin", "operations", "analyst", "customer"][i]
        : `customer${String(i - 3).padStart(3, "0")}`;
    const role = i < 4 ? account : "customer";
    await db.user.create({
      data: {
        id: `user-${i}`,
        email: i < 4 ? accountEmails[i] : `${account}@demo.local`,
        name:
          i < 4
            ? `${account[0].toUpperCase() + account.slice(1)} Demo`
            : `Customer ${i - 3}`,
        passwordHash: hashes[i < 4 ? i : 3],
        emailVerifiedAt: base,
        createdAt: new Date(+base - (150 - i) * day),
        roles: {
          create: {
            roleId: `role-${role}`,
          },
        },
        profile: {
          create: {
            preferences: {
              newsletter: i % 3 === 0,
            },
            tags: i % 5 === 0 ? ["returning"] : [],
          },
        },
        addresses: {
          create: {
            id: `address-${i}`,
            name: `Demo Customer ${i}`,
            line1: `${100 + i} Market Street`,
            city: ["Portland", "Austin", "Chicago", "Seattle"][i % 4],
            region: ["OR", "TX", "IL", "WA"][i % 4],
            postalCode: ["97201", "78701", "60601", "98101"][i % 4],
            country: "US",
            isDefault: true,
          },
        },
        loyalty: {
          create: {
            id: `loyalty-${i}`,
            points: (i % 8) * 100,
          },
        },
        wishlists: {
          create: {
            id: `wishlist-${i}`,
            name: "Favorites",
          },
        },
      },
    });
  }
  await db.brand.createMany({
    data: brands.map((name, i) => ({
      id: `brand-${i}`,
      name,
      slug: slug(name),
      description: `Considered design from ${name}.`,
    })),
  });
  await db.category.createMany({
    data: categories.map((name, i) => ({
      id: `category-${i}`,
      name,
      slug: slug(name),
      description: `Thoughtfully selected ${name.toLowerCase()} for everyday living.`,
    })),
  });
  await db.collection.createMany({
    data: collections.map((name, i) => ({
      id: `collection-${i}`,
      name,
      slug: slug(name),
      description: "A considered selection of useful, beautiful essentials.",
      imageUrl: `/images/products/${slug(categories[i * 2])}.svg`,
    })),
  });
  await db.warehouse.createMany({
    data: [
      {
        id: "warehouse-east",
        code: "EAST",
        name: "East Coast Distribution",
        address: "Demo logistics center, New Jersey",
      },
      {
        id: "warehouse-west",
        code: "WEST",
        name: "West Coast Distribution",
        address: "Demo logistics center, Oregon",
      },
    ],
  });
  for (let i = 0; i < 120; i++) {
    const category = categories[Math.floor(i / 10)];
    const name = titles[category][i % 10];
    const price =
      category === "Audio"
        ? 8900 + (i % 10) * 2100
        : category === "Lighting"
          ? 6900 + (i % 10) * 1500
          : 2800 + (i % 10) * 900 + Math.floor(i / 10) * 350;
    const sale = i % 4 === 0;
    const optionName = Math.floor(i / 10) < 6 ? "Size" : "Finish";
    const values =
      optionName === "Size" ? ["S", "M", "L"] : ["Natural", "Black", "Stone"];
    await db.product.create({
      data: {
        id: `product-${i}`,
        name,
        slug: slug(name),
        description: `The ${name.toLowerCase()} balances enduring design with everyday practicality. Thoughtfully made with carefully chosen materials, clean details and a comfortable, versatile feel.`,
        brandId: `brand-${i % 10}`,
        priceCents: price,
        compareAtPriceCents: sale ? Math.round(price * 1.25) : null,
        imageUrl: `/images/products/${slug(category)}.svg`,
        featured: i % 5 === 0,
        tags: ["considered-design", i % 3 === 0 ? "new" : "essential"],
        specifications: {
          care: "Follow care label",
          origin: "Demo supplier",
          material:
            Math.floor(i / 10) < 5
              ? "Premium natural blend"
              : "Durable considered materials",
        },
        categories: {
          create: {
            categoryId: `category-${Math.floor(i / 10)}`,
          },
        },
        collections: {
          create: {
            collectionId: `collection-${i % 6}`,
          },
        },
        media: {
          create: [
            {
              url: `/images/products/${slug(category)}.svg`,
              alt: name,
              position: 0,
            },
          ],
        },
        options: {
          create: {
            id: `option-${i}`,
            name: optionName,
            values: {
              create: values.map((value, j) => ({
                id: `option-value-${i}-${j}`,
                value,
              })),
            },
          },
        },
        variants: {
          create: values.map((value, j) => ({
            id: `variant-${i}-${j}`,
            sku: `FF-${String(i + 1).padStart(3, "0")}-${j + 1}`,
            name: `${name} / ${value}`,
            priceCents: price + j * 200,
            compareAtPriceCents: sale
              ? Math.round((price + j * 200) * 1.25)
              : null,
            options: {
              [optionName.toLowerCase()]: value,
              color: ["Stone", "Black", "Sand"][j],
            },
            weightGrams: 400 + i * 10,
            backorder: i % 17 === 0,
            optionValues: {
              create: {
                optionValueId: `option-value-${i}-${j}`,
              },
            },
            inventory: {
              create: ["east", "west"].map((side, k) => ({
                id: `inventory-${i}-${j}-${side}`,
                warehouseId: `warehouse-${side}`,
                onHand:
                  i % 19 === 0 ? 0 : i % 13 === 0 ? 2 : 15 + ((i * j + k) % 45),
                reserved: 0,
                lowStockThreshold: 5,
              })),
            },
          })),
        },
        createdAt: new Date(+base - (120 - i) * day),
      },
    });
  }
  for (let i = 0; i < 300; i++) {
    const p = i % 120;
    const variant = p % 3;
    const user = 4 + (i % 100);
    const quantity = 1 + (i % 3);
    const product = await db.productVariant.findUniqueOrThrow({
      where: {
        id: `variant-${p}-${variant}`,
      },
      include: {
        product: true,
      },
    });
    const subtotal = product.priceCents * quantity;
    const discount = i % 7 === 0 ? Math.floor(subtotal / 10) : 0;
    const shipping = subtotal >= 15000 ? 0 : 800;
    const tax = Math.round((subtotal - discount) * 0.08);
    const total = subtotal - discount + shipping + tax;
    const status = [
      "completed",
      "fulfilled",
      "processing",
      "paid",
      "pending_payment",
      "payment_failed",
      "cancelled",
      "refunded",
      "partially_refunded",
      "returned",
    ][i % 10];
    const successful = ![
      "pending_payment",
      "payment_failed",
      "cancelled",
    ].includes(status);
    const paymentStatus =
      status === "refunded" || status === "returned"
        ? "refunded"
        : status === "partially_refunded"
          ? "partially_refunded"
          : successful
            ? "succeeded"
            : status === "payment_failed"
              ? "failed"
              : "created";
    const date = new Date(+base - ((300 - i) * day) / 3);
    await db.order.create({
      data: {
        id: `order-${i}`,
        number: `FF-${String(10000 + i)}`,
        userId: `user-${user}`,
        email: `customer${String(user - 3).padStart(3, "0")}@demo.local`,
        status,
        paymentStatus,
        subtotalCents: subtotal,
        discountCents: discount,
        shippingCents: shipping,
        taxCents: tax,
        totalCents: total,
        trackingToken: `demo-tracking-${i}`,
        couponCode: i % 7 === 0 ? "WELCOME10" : null,
        createdAt: date,
        items: {
          create: {
            id: `order-item-${i}`,
            productId: `product-${p}`,
            variantId: product.id,
            name: product.product.name,
            sku: product.sku,
            quantity,
            unitPriceCents: product.priceCents,
            totalCents: subtotal,
            imageUrl: product.product.imageUrl,
            options: product.options as Prisma.InputJsonValue,
          },
        },
        addresses: {
          create: {
            kind: "shipping",
            name: `Demo Customer ${user}`,
            line1: `${100 + user} Market Street`,
            city: "Portland",
            region: "OR",
            postalCode: "97201",
            country: "US",
          },
        },
        history: {
          create: [
            {
              status: "pending_payment",
              createdAt: date,
            },
            {
              status,
              note: "Historical demo order",
              createdAt: new Date(+date + 3600000),
            },
          ],
        },
        payments: {
          create: {
            id: `payment-${i}`,
            status: paymentStatus,
            amountCents: total,
            refundedCents:
              paymentStatus === "refunded"
                ? total
                : paymentStatus === "partially_refunded"
                  ? Math.floor(total / 4)
                  : 0,
            providerReference: `mock-seed-${i}`,
            attempts: {
              create: {
                status: paymentStatus,
                providerReference: `mock-seed-${i}`,
              },
            },
            refunds: paymentStatus.includes("refunded")
              ? {
                  create: {
                    amountCents:
                      paymentStatus === "refunded"
                        ? total
                        : Math.floor(total / 4),
                    cashAmountCents:
                      paymentStatus === "refunded"
                        ? total
                        : Math.floor(total / 4),
                    reason: "Seeded demonstration refund",
                    idempotencyKey: `seed-refund-${i}`,
                  },
                }
              : undefined,
          },
        },
      },
    });
    if (["fulfilled", "completed"].includes(status))
      await db.fulfillment.create({
        data: {
          id: `fulfillment-${i}`,
          orderId: `order-${i}`,
          warehouseId: "warehouse-east",
          status: status === "completed" ? "delivered" : "shipped",
          items: {
            create: {
              orderItemId: `order-item-${i}`,
              quantity,
            },
          },
          shipments: {
            create: {
              carrier: "Demo Logistics",
              trackingNumber: `DEMO${i}`,
              status: status === "completed" ? "delivered" : "shipped",
              events: {
                create: {
                  status: status === "completed" ? "delivered" : "shipped",
                  message: "Seeded shipment event",
                },
              },
            },
          },
        },
      });
    if (status === "returned")
      await db.returnRequest.create({
        data: {
          orderId: `order-${i}`,
          status: "refunded",
          reason: "Demo size mismatch",
          items: {
            create: {
              orderItemId: `order-item-${i}`,
              quantity,
              restock: true,
            },
          },
          events: {
            create: {
              status: "refunded",
              note: "Seeded return completed",
            },
          },
        },
      });
  }
  for (let i = 0; i < 250; i++) {
    const p = i % 120;
    const user = 4 + (i % 100);
    await db.review.create({
      data: {
        id: `review-${i}`,
        productId: `product-${p}`,
        userId: `user-${user}`,
        rating: 3 + (i % 3),
        title: [
          "Excellent everyday piece",
          "Thoughtful design",
          "Very good quality",
          "A new favorite",
        ][i % 4],
        body: "Comfortable, well made and exactly as described. The finishing and packaging were carefully considered.",
        verifiedPurchase: ![4, 5, 6].includes(i % 10),
        status: i % 17 === 0 ? "pending" : "approved",
      },
    });
  }
  await db.inventoryItem.update({
    where: {
      id: "inventory-1-0-east",
    },
    data: {
      reserved: 2,
    },
  });
  await db.inventoryReservation.create({
    data: {
      inventoryItemId: "inventory-1-0-east",
      quantity: 2,
      status: "active",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
      checkoutId: "seed-checkout",
    },
  });
  await db.inventoryMovement.create({
    data: {
      inventoryItemId: "inventory-1-0-east",
      quantity: 15,
      kind: "receipt",
      reason: "Seed warehouse opening stock",
      reference: "seed-stock",
    },
  });
  await db.wishlistItem.createMany({
    data: [
      {
        wishlistId: "wishlist-3",
        productId: "product-1",
      },
      {
        wishlistId: "wishlist-3",
        productId: "product-8",
      },
    ],
  });
  await db.productQuestion.create({
    data: {
      productId: "product-1",
      userId: "user-3",
      question: "How should I care for this item?",
      answers: {
        create: {
          userId: "user-0",
          body: "Follow the care label; spot clean gently and air dry.",
        },
      },
    },
  });
  const start = new Date("2026-01-01T00:00:00Z");
  for (const [i, kind, value, code] of [
    [0, "percentage", 10, "WELCOME10"],
    [1, "fixed", 1500, "TAKE15"],
    [2, "free_shipping", 0, "SHIPFREE"],
    [3, "bogo", 100, "BUY2GET1"],
  ] as const)
    await db.promotion.create({
      data: {
        id: `promotion-${i}`,
        name: code,
        kind,
        value,
        minimumSpendCents: i === 1 ? 10000 : 0,
        startsAt: start,
        perCustomerLimit: 3,
        usageLimit: 1000,
        coupons: {
          create: {
            code,
          },
        },
      },
    });
  await db.promotion.create({
    data: {
      name: "Autumn category savings",
      kind: "percentage",
      value: 5,
      minimumSpendCents: 15000,
      startsAt: start,
      automatic: true,
      rules: {
        create: {
          kind: "category",
          operator: "in",
          value: "category-0",
        },
      },
    },
  });
  await db.promotion.create({
    data: {
      name: "Expired summer offer",
      kind: "percentage",
      value: 15,
      startsAt: new Date("2026-06-01"),
      endsAt: new Date("2026-07-01"),
      coupons: {
        create: {
          code: "SUMMER15",
        },
      },
    },
  });
  await db.promotion.create({
    data: {
      name: "Scheduled holiday offer",
      kind: "fixed",
      value: 2000,
      minimumSpendCents: 20000,
      startsAt: new Date("2026-12-01"),
      endsAt: new Date("2026-12-31"),
      coupons: {
        create: {
          code: "HOLIDAY20",
        },
      },
    },
  });
  await db.giftCard.create({
    data: {
      code: "DEMO-GIFT-50",
      initialCents: 5000,
      balanceCents: 5000,
      ledger: {
        create: {
          amountCents: 5000,
          reason: "Demo issuance",
          reference: "seed-gift-50",
        },
      },
    },
  });
  await db.shippingZone.create({
    data: {
      name: "United States",
      countries: ["US"],
      rates: {
        create: [
          {
            name: "standard",
            priceCents: 800,
            freeAboveCents: 15000,
          },
          {
            name: "express",
            priceCents: 1800,
            maxWeightGrams: 20000,
          },
        ],
      },
    },
  });
  for (const [slug, title, body] of [
    [
      "about",
      "About Form & Field",
      "Form & Field is a demonstration retailer for considered everyday goods.",
    ],
    [
      "shipping",
      "Shipping & delivery",
      "Standard delivery costs $8 and is free for orders over $150. Express delivery is $18. Demo shipments are simulated.",
    ],
    [
      "returns",
      "Returns & exchanges",
      "Request a return within 30 days of delivery. Products must be unused. This is a seeded demo store.",
    ],
    [
      "privacy",
      "Privacy policy",
      "This local demo stores account and order details for its functional journeys. No real card information is collected.",
    ],
    [
      "terms",
      "Terms of service",
      "This portfolio demonstration uses simulated payments. No goods are shipped.",
    ],
    [
      "faq",
      "Frequently asked questions",
      "Payments and deliveries are simulated. Use the demo accounts to explore the store.",
    ],
  ])
    await db.cmsPage.create({
      data: {
        slug,
        title,
        body,
      },
    });
  await db.navigationMenu.create({
    data: {
      key: "footer",
      name: "Footer",
      items: {
        create: ["about", "shipping", "returns", "privacy", "terms", "faq"].map(
          (url, position) => ({
            label: url[0].toUpperCase() + url.slice(1),
            url: `/${url}`,
            position,
          }),
        ),
      },
    },
  });
  await db.banner.create({
    data: {
      title: "Made for the everyday.",
      subtitle: "Considered essentials. Lasting design.",
      imageUrl: "/images/products/outerwear.svg",
      linkUrl: "/shop",
      position: "hero",
    },
  });
  await db.featureFlag.createMany({
    data: [
      {
        key: "mock-payments",
        enabled: true,
        description: "Local simulated payment provider",
      },
      {
        key: "product-recommendations",
        enabled: true,
        description: "Category-based recommendations",
      },
    ],
  });
  for (let i = 0; i < 1000; i++)
    await db.analyticsEvent.create({
      data: {
        type: [
          "product_view",
          "add_to_cart",
          "checkout_started",
          "order_placed",
        ][i % 4],
        sessionId: `seed-session-${i % 180}`,
        productId: `product-${i % 120}`,
        orderId: i % 4 === 3 ? `order-${i % 300}` : null,
        createdAt: new Date(+base - (i % 90) * day),
      },
    });
  await db.auditLog.create({
    data: {
      actorId: "user-0",
      action: "demo.seed",
      entity: "database",
      entityId: "demo",
      after: {
        products: 120,
        variants: 360,
        customers: 104,
        orders: 300,
        reviews: 250,
      },
    },
  });
  console.log(
    "Seed complete: 120 products, 360 variants, 104 users, 300 orders, 250 reviews, 720 inventory rows.",
  );
  console.log(
    "Demo accounts: admin@example.com / DemoAdmin!2026; ops@example.com / DemoOps!2026; viewer@example.com / DemoViewer!2026; customer@example.com / DemoCustomer!2026",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
