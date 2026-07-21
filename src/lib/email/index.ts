import { getFromAddress, getResendClient } from "./client";

export * from "./client";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export type SendEmailResult =
  | { delivered: true; id: string }
  | { delivered: false; reason: "not-configured" };

/**
 * Sends one transactional email.
 *
 * Call this from a worker processor, not from a request handler — delivery is
 * queued work (`email` queue, `send` job) so a slow Resend call never blocks a
 * response. Throws on a Resend API error so BullMQ retries with backoff.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const resend = getResendClient();
  if (!resend) {
    return { delivered: false, reason: "not-configured" };
  }

  const { data, error } = await resend.emails.send({
    from: getFromAddress(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    ...(input.text ? { text: input.text } : {}),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  });

  if (error) {
    throw new Error(`Resend rejected the message: ${error.name}: ${error.message}`);
  }
  if (!data) {
    throw new Error("Resend returned neither data nor an error.");
  }

  return { delivered: true, id: data.id };
}
