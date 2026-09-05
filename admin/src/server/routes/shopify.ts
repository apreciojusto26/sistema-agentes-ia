// HTTP surface over the Admin's read-only view of the shop.
//
// Transport and validation only — every decision about what Shopify can do
// lives in ../shopify/storefront.ts, and nothing here writes to a shop.
import type { FastifyInstance } from 'fastify';
import { connection, searchProducts } from '../shopify/storefront';

export function registerShopifyRoutes(app: FastifyInstance): void {
  /**
   * Which shop, and what can be done with it.
   *
   * The response carries a domain and two booleans. It carries NO token, and
   * it makes no network call: presence is the honest claim, and a live probe on
   * every page load would make a status pill a source of latency.
   */
  app.get('/api/shopify/status', async () => connection());

  /**
   * Products to choose from. `?q=` is optional — an empty query lists the most
   * recent, which is what a picker needs the moment it opens.
   *
   * 200 WITH `ok: false` ON A SHOP-SIDE FAILURE, deliberately. An unreachable
   * store is not a bad request from the browser, and a 5xx here would be the
   * Admin claiming a fault that belongs to a third party. The client renders
   * the message.
   */
  app.get('/api/shopify/products', async (request) => {
    const q = (request.query as { q?: string } | undefined)?.q ?? '';
    if (typeof q !== 'string') return { ok: false, message: 'q must be a string' };
    return searchProducts(q);
  });
}
