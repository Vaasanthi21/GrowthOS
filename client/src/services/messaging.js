import axios from "axios";
import nodemailer from "nodemailer";
import { substituteVariables } from "../utils/substitute.js";

// WhatsApp via WATI API
export async function sendWhatsAppMessage(template, lead) {
  const message = substituteVariables(template, lead);
  await axios.post("https://api.wati.io/v1/sendMessage", {
    phone: lead.phone,
    message,
  }, {
    headers: { Authorization: `Bearer ${process.env.WATI_API_KEY}` }
  });
}

// Email via SendGrid SMTP
export async function sendEmailMessage(template, lead) {
  const message = substituteVariables(template, lead);

  const transporter = nodemailer.createTransport({
    host: "smtp.sendgrid.net",
    port: 587,
    auth: {
      user: "apikey",
      pass: process.env.SENDGRID_API_KEY,
    },
  });

  await transporter.sendMail({
    from: "noreply@yourdomain.com",
    to: lead.email,
    subject: "Follow-up",
    text: message,
  });
}
