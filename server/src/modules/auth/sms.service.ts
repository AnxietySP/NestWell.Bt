import { AppError } from '../../middlewares/error.middleware';

export function normalizeBhutanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('975') && digits.length === 11) return `+${digits}`;
  if (digits.length === 8) return `+975${digits}`;
  return raw.trim();
}

/** SMS is only used for the existing phone-OTP password reset. Email verification never uses it. */
export async function sendRealSms(toPhone: string, message: string): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, SMS_GATEWAY_URL, SMS_API_KEY, SMS_SENDER_ID } =
    process.env;

  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER) {
    const basic = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: toPhone, From: TWILIO_FROM_NUMBER, Body: message }),
    });
    if (!response.ok) throw new AppError(`SMS gateway delivery failed: ${await response.text()}`, 502);
    return;
  }

  if (SMS_GATEWAY_URL && SMS_API_KEY) {
    const response = await fetch(SMS_GATEWAY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SMS_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: toPhone, senderId: SMS_SENDER_ID || 'NestWellBT', message }),
    });
    if (!response.ok) throw new AppError(`SMS gateway delivery failed: ${await response.text()}`, 502);
    return;
  }

  throw new AppError(
    'SMS gateway is not configured on the server. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER to server/.env.',
    500
  );
}
