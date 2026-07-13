import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Resend with your API key
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Sends a system notification email from the no-reply address.
 * @param {string} toEmail - The recipient's email address.
 * @param {string} subject - The subject line of the email.
 * @param {string} htmlContent - The HTML body content of the email.
 */
export const sendNoReplyEmail = async (toEmail, subject, htmlContent) => {
  try {
    if (!resend) {
      console.warn('[EMAIL] Resend API key is not configured.');
      return { success: false, error: 'Resend API key is not configured' };
    }

    const { data, error } = await resend.emails.send({
      from: 'CreativeOS <no-reply@udenai.com>',
      to: [toEmail],
      subject: subject,
      html: htmlContent,
    });

    if (error) {
      console.error('Failed to send email:', error);
      return { success: false, error };
    }

    console.log('Email sent successfully:', data.id);
    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error sending email:', err);
    return { success: false, error: err.message };
  }
};

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
  const subject = 'Creative Studio OS password reset OTP';
  const htmlContent = `
    <div style="font-family: sans-serif; padding: 20px; line-height: 1.6; color: #333;">
      <h2>Password Reset OTP</h2>
      <p>You requested a password reset for your Creative Studio OS account.</p>
      <p>Use the following 6-digit One-Time Password (OTP) to reset your password:</p>
      <div style="font-size: 24px; font-weight: bold; background: #f0f0f0; padding: 15px; border-radius: 5px; display: inline-block; letter-spacing: 2px; margin: 10px 0;">
        ${otp}
      </div>
      <p>This code will expire in <strong>${expiresInMinutes} minutes</strong>.</p>
      <p>If you did not request a password reset, please ignore this email.</p>
    </div>
  `;

  // Try the new Resend SDK helper first
  if (process.env.RESEND_API_KEY) {
    console.log(`[EMAIL] Sending OTP email to ${to} using Resend SDK...`);
    const result = await sendNoReplyEmail(to, subject, htmlContent);
    if (result.success) {
      return;
    }
    console.warn('[EMAIL] Resend SDK failed, trying fallback transporter...');
  }

  // Fallback to custom SMTP / SendGrid / local logging
  const transporter = createTransporter();
  const from = getEmailFrom();
  const text = `Your password reset OTP is ${otp}. It will expire in ${expiresInMinutes} minutes.`;

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
    html: htmlContent
  });
};

export const sendSignupOtpEmail = async ({ to, otp, expiresInMinutes = 10 }) => {
  const subject = 'Creative Studio OS Sign Up Verification OTP';
  const htmlContent = `
    <div style="font-family: sans-serif; padding: 20px; line-height: 1.6; color: #333;">
      <h2>Verify your account</h2>
      <p>Thank you for signing up for Creative Studio OS.</p>
      <p>Use the following 6-digit One-Time Password (OTP) to verify and activate your account:</p>
      <div style="font-size: 24px; font-weight: bold; background: #f0f0f0; padding: 15px; border-radius: 5px; display: inline-block; letter-spacing: 2px; margin: 10px 0;">
        ${otp}
      </div>
      <p>This code will expire in <strong>${expiresInMinutes} minutes</strong>.</p>
      <p>If you did not request this, please ignore this email.</p>
    </div>
  `;

  if (process.env.RESEND_API_KEY) {
    console.log(`[EMAIL] Sending signup verification email to ${to} using Resend SDK...`);
    const result = await sendNoReplyEmail(to, subject, htmlContent);
    if (result.success) {
      return;
    }
    console.warn('[EMAIL] Resend SDK failed, trying fallback transporter...');
  }

  const transporter = createTransporter();
  const from = getEmailFrom();
  const text = `Your Creative Studio OS verification OTP is ${otp}. It will expire in ${expiresInMinutes} minutes.`;

  if (!transporter) {
    console.warn('Email service is not configured. OTP email was not sent.');
    console.log(`Sign Up OTP for ${to}: ${otp}`);
    return;
  }

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html: htmlContent
  });
};