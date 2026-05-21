import { Resend } from "resend";

export interface OwnerOtpEmail {
  to: string;
  code: string;
  studioName?: string;
}

export interface GuestOtpEmail {
  to: string;
  code: string;
  studioName: string;
}

export interface OwnerBookingRequestEmail {
  to: string;
  studioName: string;
  guestName: string;
  guestEmail: string;
  date: string;
  startTime: string;
  roomName: string;
  totalPrice: string;
  message: string;
  approveUrl: string;
}

export interface GuestBookingApprovedEmail {
  to: string;
  studioName: string;
  date: string;
  startTime: string;
  roomName: string;
  totalPrice: string;
  bookingUrl: string;
}

export interface EmailService {
  sendOwnerOtp(input: OwnerOtpEmail): Promise<{ id: string }>;
  sendGuestBookingOtp?(input: GuestOtpEmail): Promise<{ id: string }>;
  sendOwnerBookingRequest?(input: OwnerBookingRequestEmail): Promise<{ id: string }>;
  sendGuestBookingApproved?(input: GuestBookingApprovedEmail): Promise<{ id: string }>;
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
    },
    async sendGuestBookingOtp(input) {
      return sender.send({
        to: input.to,
        subject: `${input.code} confirms your booking request email`,
        html: [
          `<p>Your booking request code for <strong>${input.studioName}</strong> is <strong>${input.code}</strong>.</p>`,
          "<p>Use it within 10 minutes. No password is needed.</p>"
        ].join("")
      });
    },
    async sendOwnerBookingRequest(input) {
      return sender.send({
        to: input.to,
        subject: `New booking request for ${input.studioName}`,
        html: [
          `<p><strong>${input.guestName}</strong> requested ${input.roomName} at ${input.studioName}.</p>`,
          `<p>${input.date} at ${input.startTime}. Total: ${input.totalPrice}.</p>`,
          `<p>Guest email: ${input.guestEmail}</p>`,
          input.message ? `<p>Notes: ${input.message}</p>` : "",
          `<p><a href="${input.approveUrl}" style="display:inline-block;padding:12px 16px;background:#1f6b38;color:#fff;text-decoration:none;border-radius:6px;">Confirm booking</a></p>`,
          `<p>Or open this link: ${input.approveUrl}</p>`
        ].join("")
      });
    },
    async sendGuestBookingApproved(input) {
      return sender.send({
        to: input.to,
        subject: `${input.studioName} approved your booking request`,
        html: [
          `<p>Your booking request for <strong>${input.studioName}</strong> was approved.</p>`,
          `<p>${input.roomName}, ${input.date} at ${input.startTime}. Total: ${input.totalPrice}.</p>`,
          "<p>No online payment is needed right now. Pay the studio directly on site.</p>",
          `<p><a href="${input.bookingUrl}">View booking</a></p>`
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
