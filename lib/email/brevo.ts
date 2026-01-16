import {
  SendSmtpEmail,
  TransactionalEmailsApi,
  TransactionalEmailsApiApiKeys,
} from "@getbrevo/brevo";

import { ChatSDKError } from "@/lib/errors";

type VerificationEmailPayload = {
  toEmail: string;
  toName?: string | null;
  verificationUrl: string;
};

type PasswordResetEmailPayload = {
  toEmail: string;
  toName?: string | null;
  resetUrl: string;
};

let brevoEmailClient: TransactionalEmailsApi | null = null;

function getBrevoClient() {
  if (brevoEmailClient) {
    return brevoEmailClient;
  }

  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new ChatSDKError(
      "bad_request:api",
      "Brevo API key is not configured"
    );
  }

  const client = new TransactionalEmailsApi();
  client.setApiKey(TransactionalEmailsApiApiKeys.apiKey, apiKey);

  const partnerKey = process.env.BREVO_PARTNER_KEY;
  if (partnerKey) {
    client.setApiKey(TransactionalEmailsApiApiKeys.partnerKey, partnerKey);
  }

  brevoEmailClient = client;
  return client;
}

export async function sendVerificationEmail({
  toEmail,
  toName,
  verificationUrl,
}: VerificationEmailPayload) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME ?? "Support";

  if (!senderEmail) {
    throw new ChatSDKError(
      "bad_request:api",
      "Brevo sender email is not configured"
    );
  }

  const client = getBrevoClient();
  const email = new SendSmtpEmail();

  email.subject = "Please verify your email address";
  email.sender = { email: senderEmail, name: senderName };
  email.replyTo = { email: senderEmail, name: senderName };
  email.to = [{ email: toEmail, name: toName ?? undefined }];
  email.textContent =
    "Thanks for signing up for AI Chatbot!\n\n" +
    `Please confirm your address by opening the link below:\n${verificationUrl}\n\n` +
    "If you didn’t create an account, you can ignore this message.";
  email.htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif;">
        <p>Thanks for signing up for AI Chatbot!</p>
        <p>Click the button below to verify your email address and activate your account.</p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
          <tr>
            <td style="background-color:#1f2937;border-radius:6px;">
              <a href="${verificationUrl}" target="_blank" rel="noopener" style="display:block;padding:12px 24px;font-weight:600;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;border-radius:6px;cursor:pointer;">
                Verify Email
              </a>
            </td>
          </tr>
        </table>
        <p>Or copy and paste this link into your browser:<br />
          <a href="${verificationUrl}">${verificationUrl}</a>
        </p>
        <p>If you didn’t create an account, you can safely ignore this message.</p>
      </body>
    </html>
  `;

  try {
    await client.sendTransacEmail(email);
  } catch (error) {
    throw new ChatSDKError(
      "bad_request:api",
      error instanceof Error
        ? error.message
        : "Failed to send verification email"
    );
  }
}

export async function sendPasswordResetEmail({
  toEmail,
  toName,
  resetUrl,
}: PasswordResetEmailPayload) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME ?? "Support";

  if (!senderEmail) {
    throw new ChatSDKError(
      "bad_request:api",
      "Brevo sender email is not configured"
    );
  }

  const client = getBrevoClient();
  const email = new SendSmtpEmail();

  email.subject = "Reset your AI Chatbot password";
  email.sender = { email: senderEmail, name: senderName };
  email.replyTo = { email: senderEmail, name: senderName };
  email.to = [{ email: toEmail, name: toName ?? undefined }];
  email.textContent =
    "We received a request to reset your AI Chatbot password.\n\n" +
    `You can choose a new password using the link below:\n${resetUrl}\n\n` +
    `If you didn't make this request, you can safely ignore this email.`;
  email.htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif;">
        <p>We received a request to reset your AI Chatbot password.</p>
        <p>Click the button below to choose a new password.</p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
          <tr>
            <td style="background-color:#1f2937;border-radius:6px;">
              <a
                href="${resetUrl}"
                target="_blank"
                rel="noopener"
                style="display:block;padding:12px 24px;font-weight:600;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;border-radius:6px;cursor:pointer;"
              >
                Reset Password
              </a>
            </td>
          </tr>
        </table>
        <p>Or copy and paste this link into your browser:<br />
          <a href="${resetUrl}">${resetUrl}</a>
        </p>
        <p>If you didn’t make this request, you can safely ignore this email.</p>
      </body>
    </html>
  `;

  try {
    await client.sendTransacEmail(email);
  } catch (error) {
    throw new ChatSDKError(
      "bad_request:api",
      error instanceof Error
        ? error.message
        : "Failed to send password reset email"
    );
  }
}

type ContactMessagePayload = {
  senderName: string;
  senderEmail: string;
  subject: string;
  message: string;
};

export async function sendContactMessageEmail({
  senderName,
  senderEmail,
  subject,
  message,
}: ContactMessagePayload) {
  const supportEmail = process.env.BREVO_SENDER_EMAIL;
  const supportName = process.env.BREVO_SENDER_NAME ?? "Support";

  if (!supportEmail) {
    throw new ChatSDKError(
      "bad_request:api",
      "Brevo sender email is not configured"
    );
  }

  const client = getBrevoClient();
  const email = new SendSmtpEmail();

  email.subject = subject.trim().length > 0 ? subject : "New contact request";
  email.sender = { email: supportEmail, name: supportName };
  email.replyTo = { email: senderEmail, name: senderName };
  email.to = [{ email: supportEmail, name: supportName }];
  email.textContent =
    `You received a new contact request from ${senderName} (${senderEmail}).\n\n` +
    `${message}`;
  email.htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif;">
        <p><strong>New inquiry from:</strong> ${senderName} (${senderEmail})</p>
        <p><strong>Subject:</strong> ${email.subject}</p>
        <p style="white-space:pre-wrap;">${message}</p>
      </body>
    </html>
  `;

  try {
    await client.sendTransacEmail(email);
  } catch (error) {
    throw new ChatSDKError(
      "bad_request:api",
      error instanceof Error ? error.message : "Failed to send contact message"
    );
  }
}
