import { Resend } from "resend";

export interface OwnerOtpEmail {
  to: string;
  code: string;
  studioName?: string;
}

export interface EmailService {
  sendOwnerOtp(input: OwnerOtpEmail): Promise<{ id: string }>;
}

export interface EmailSenderMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailSender {
  send(message: EmailSenderMessage): Promise<{ id: string }>;
}

export function createEmailService(sender: EmailSender): EmailService {
  return {
    async sendOwnerOtp(input) {
      const studioLine = input.studioName ? ` for ${input.studioName}` : "";
      return sender.send({
        to: input.to,
        subject: `${input.code} is your Photo Studios access code`,
        html: [
          `<p>Your backup access code${studioLine} is <strong>${input.code}</strong>.</p>`,
          "<p>Use it within 10 minutes so you do not lose access to your studio draft.</p>",
          "<p>No password is needed.</p>"
        ].join("")
      });
    }
  };
}

export function createResendEmailService(config: { apiKey: string; from: string }): EmailService {
  const resend = new Resend(config.apiKey);
  return createEmailService({
    async send(message) {
      const result = await resend.emails.send({
        from: config.from,
        to: message.to,
        subject: message.subject,
        html: message.html
      });
      if (result.error) throw new Error(result.error.message);
      return { id: result.data?.id ?? "resend_email" };
    }
  });
}
