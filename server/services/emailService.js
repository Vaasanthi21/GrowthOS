import nodemailer from 'nodemailer';
import axios from 'axios';

const getEmailFrom = () => process.env.EMAIL_FROM || process.env.SMTP_FROM || 'productmanager.uden@digverve.com';

const createTransporter = () => {
  if (process.env.SENDGRID_API_KEY) {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY,
      },
    });
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return null;
};

export const sendPasswordResetOtpEmail = async ({ to, otp, expiresInMinutes = 10 }) => {
  const from = getEmailFrom();
  const subject = 'Creative Studio OS password reset OTP';
  const text = `Your password reset OTP is ${otp}. It will expire in ${expiresInMinutes} minutes.`;

  // Try Resend API first if configured
  if (process.env.RESEND_API_KEY) {
    try {
      console.log(`[EMAIL] Sending OTP email to ${to} using Resend API...`);
      const response = await axios.post(
        'https://api.resend.com/emails',
        {
          from,
          to: [to],
          subject,
          text,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log(`[EMAIL] Resend API response:`, response.status, response.data);
      return;
    } catch (resendError) {
      console.error('[EMAIL] Resend API failed:', resendError.response?.data || resendError.message);
      // fallback to nodemailer if resend fails
    }
  }

  const transporter = createTransporter();

  if (!transporter) {
    console.warn('Email service is not configured. OTP email was not sent.');
    console.log(`Password Reset OTP for ${to}: ${otp}`);
    return;
  }

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
  });
};