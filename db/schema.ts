// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const products = sqliteTable("products", {
 id: text("id").primaryKey(), name: text("name").notNull(), category: text("category").notNull(),
 description: text("description").notNull(), image: text("image").notNull(), price: integer("price").notNull(),
 oldPrice: integer("old_price").notNull().default(0), active: integer("active").notNull().default(1),
 automatic: integer("automatic").notNull().default(1), deleted: integer("deleted").notNull().default(0)
});
export const orders = sqliteTable("orders", {
 id: text("id").primaryKey(), userId: text("user_id").notNull(), email: text("email").notNull(),
 items: text("items").notNull(), total: integer("total").notNull(), status: text("status").notNull().default("creating"),
 paymentId: text("payment_id").unique(), requestKey: text("request_key").notNull().unique(),
 qr: text("qr"), qrImage: text("qr_image"), createdAt: integer("created_at").notNull(), paidAt: integer("paid_at"), deliveredAt: integer("delivered_at"),
 paymentProvider:text("payment_provider").notNull().default("legacy"),appmaxCustomerId:text("appmax_customer_id"),
 paymentState:text("payment_state").notNull().default("idle"),pixExpiresAt:integer("pix_expires_at")
});
export const keys = sqliteTable("keys", {
 id: text("id").primaryKey(), productId: text("product_id").notNull().references(()=>products.id),
 code: text("code").notNull().unique(), orderId: text("order_id").references(()=>orders.id)
});
export const settings = sqliteTable("settings", { id: text("id").primaryKey(), value: text("value").notNull() });
export const webhookJobs = sqliteTable("appmax_webhook_jobs", {orderId:text("order_id").primaryKey().references(()=>orders.id),receivedAt:integer("received_at").notNull()});
