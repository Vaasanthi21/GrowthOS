import mongoose from 'mongoose';



const CreditSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      default: 'credits',
      unique: true,
    },
    defaultSignupCredits: {
      type: Number,
      default: 25,
    },
    textGenerationCost: {
      type: Number,
      default: 5,
    },
    imageGenerationCost: {
      type: Number,
      default: 3,
    },
    websiteAnalysisCost: {
      type: Number,
      default: 10,
    },
    researchAnalysisCost: {
      type: Number,
      default: 5,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('CreditSettings', CreditSettingsSchema);
