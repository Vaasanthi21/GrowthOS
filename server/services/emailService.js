import nodemailer from 'nodemailer';

const getEmailFrom = () => process.env.EMAIL_FROM || process.env.SMTP_FROM || 'noreply@uden.ai';

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
  const transporter = createTransporter();

  if (!transporter) {
    console.warn('Email service is not configured. OTP email was not sent.');
    console.log(`Password Reset OTP for ${to}: ${otp}`);
    return;
  }

  await transporter.sendMail({
    from: getEmailFrom(),
    to,
    subject: 'Creative Studio OS password reset OTP',
    text: `Your password reset OTP is ${otp}. It will expire in ${expiresInMinutes} minutes.`,
  });
};