/**
 * Best-effort ops notification for the "paid but no order" failure path
 * (design: Failure runbook). Generic POST body shape works as-is for a
 * Discord webhook (`content`); Slack/Telegram integrations can adapt the
 * body downstream — the channel choice is an ops decision, not a code one.
 */
import { getSecret } from 'astro:env/server';

export interface OpsAlertPayload {
  ref: string;
  error: string;
  amountCents?: number;
  cartId?: string;
  attempt?: number;
}

/** Never throws — a failed alert must not mask the original settleCheckout error. */
export async function alertOps(payload: OpsAlertPayload): Promise<void> {
  const url = getSecret('ALERT_WEBHOOK_URL');
  if (!url) return; // not configured — silently no-op rather than block settlement

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `Pago confirmado sin pedido — ref ${payload.ref}: ${payload.error}`,
        ...payload,
      }),
    });
  } catch {
    // Swallow — alerting failures must not surface as the caller's error.
  }
}
