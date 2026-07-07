import Lead from "../../entities/Lead.js";
import { sendWhatsAppMessage, sendEmailMessage } from "./messaging.js";

// Enqueue sequence steps for a lead
export async function enqueueSequence(sequence, leadId) {
  const lead = await Lead.findById(leadId);

  if (!lead) {
    throw new Error("Lead not found");
  } // implement your lead fetch

  for (const step of sequence.steps) {
    const sendAt = new Date();
    sendAt.setDate(sendAt.getDate() + step.dayOffset);

    // Example: using setTimeout (replace with Bull/Agenda for production)
    setTimeout(async () => {
      if (step.channel === "whatsapp" || step.channel === "both") {
        await sendWhatsAppMessage(step.template, lead);
      }
      if (step.channel === "email" || step.channel === "both") {
        await sendEmailMessage(step.template, lead);
      }
    }, step.dayOffset * 24 * 60 * 60 * 1000);
  }
}
