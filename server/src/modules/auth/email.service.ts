import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env';

export interface VerificationEmailInput {
  to: string;
  name: string;
  code: string;
  link: string;
  expiresInMinutes: number;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE, // true for 465, false for 587 (STARTTLS)
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function renderVerificationEmail(input: VerificationEmailInput) {
  const name = escapeHtml(input.name.split(' ')[0] || 'there');
  const spacedCode = `${input.code.slice(0, 3)} ${input.code.slice(3)}`;

  const subject = `${input.code} is your NestWell.BT verification code`;

  const text = [
    `Hi ${input.name.split(' ')[0] || 'there'},`,
    '',
    'Confirm this email address to activate your NestWell.BT account.',
    '',
    `Verification code: ${spacedCode}`,
    `Or open this link: ${input.link}`,
    '',
    `The code and link expire in ${input.expiresInMinutes} minutes and work once.`,
    "If you didn't create a NestWell.BT account, you can ignore this email.",
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;background:#F5F7FB;font-family:Figtree,Segoe UI,Helvetica,Arial,sans-serif;color:#121B33;">
  <div style="display:none;max-height:0;overflow:hidden;">Your code is ${spacedCode}. It expires in ${input.expiresInMinutes} minutes.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border:1px solid #D9E0EE;border-radius:20px;">
        <tr><td style="padding:32px 32px 8px;">
          <div style="font-size:20px;font-weight:700;letter-spacing:-0.01em;color:#3647D1;">NestWell.BT</div>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;">Confirm your email address, ${name}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#55607C;">Enter this code on the verification page to activate your account.</p>
          <div style="margin:0 0 24px;padding:18px 0;text-align:center;background:#E4E8FB;border-radius:14px;font-size:34px;font-weight:700;letter-spacing:0.28em;color:#121B33;">${spacedCode}</div>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#55607C;">Or confirm with one click:</p>
          <a href="${escapeHtml(input.link)}" style="display:inline-block;padding:13px 22px;background:#3647D1;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;border-radius:10px;">Verify email address</a>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#55607C;">The code and link expire in ${input.expiresInMinutes} minutes and work once. If the button doesn't open, paste this address into your browser:<br><span style="word-break:break-all;color:#3647D1;">${escapeHtml(input.link)}</span></p>
        </td></tr>
        <tr><td style="padding:24px 32px 32px;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#55607C;border-top:1px solid #D9E0EE;padding-top:16px;">You received this because this address was used to sign up for NestWell.BT. If that wasn't you, ignore this email and no account will be activated.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}

export async function sendVerificationEmail(input: VerificationEmailInput): Promise<void> {
  const { subject, text, html } = renderVerificationEmail(input);

  if (env.EMAIL_PROVIDER === 'console') {
    // Development only: no SMTP needed. Production refuses to start in this mode (see env.ts).
    console.log(
      `\n[email:console] To: ${input.to}\n  Subject: ${subject}\n  Code: ${input.code}\n  Link: ${input.link}\n`
    );
    return;
  }

  await getTransporter().sendMail({ from: env.MAIL_FROM, to: input.to, subject, text, html });
}
