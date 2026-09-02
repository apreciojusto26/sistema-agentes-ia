/**
 * GraphQL documents for the Admin API. Same "plain strings, no codegen"
 * convention as src/lib/shopify/queries.ts. Field names verified against
 * shopify.dev's live Admin GraphQL reference (2026-07) — see admin.ts header.
 */

export const ORDER_CREATE = /* GraphQL */ `
  mutation OrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order {
        id
        name
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/** Dedupe check before every orderCreate — see settleCheckout step 3 (design). */
export const ORDERS_BY_TAG = /* GraphQL */ `
  query OrdersByTag($query: String!) {
    orders(first: 1, query: $query) {
      nodes {
        id
        name
      }
    }
  }
`;
