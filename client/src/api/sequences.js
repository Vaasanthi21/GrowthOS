import express from "express";
import Sequence from "../../entities/Sequence.js";
import { enqueueSequence } from "../services/scheduler.js";

const router = express.Router();

// Create a new sequence
router.post("/create", async (req, res) => {
  const sequence = new Sequence(req.body);
  await sequence.save();
  res.json(sequence);
});

// Get all sequences
router.get("/", async (req, res) => {
  const sequences = await Sequence.find();
  res.json(sequences);
});

// Start a sequence for a lead
router.post("/start/:leadId", async (req, res) => {
  const { leadId } = req.params;
  const { sequenceId } = req.body;
  const sequence = await Sequence.findById(sequenceId);
  if (!sequence) return res.status(404).json({ error: "Sequence not found" });

  await enqueueSequence(sequence, leadId);
  res.json({ message: "Sequence started" });
});

export default router;
