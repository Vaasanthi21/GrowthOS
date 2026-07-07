import mongoose from "mongoose";

const stepSchema = new mongoose.Schema({
  dayOffset: Number, // e.g. 0, 2, 5, 10
  channel: { type: String, enum: ["whatsapp", "email", "both"] },
  template: String,
});

const sequenceSchema = new mongoose.Schema({
  name: String,
  trigger: { type: String, enum: ["new_lead", "demo_no_show", "proposal_sent"] },
  steps: [stepSchema],
  active: { type: Boolean, default: true },
});

export default mongoose.model("Sequence", sequenceSchema);
