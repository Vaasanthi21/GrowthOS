import mongoose from 'mongoose';



const CompanySchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    industry: {
      type: String,
      trim: true,
    },
    productDescription: {
      type: String,
      trim: true,
    },
    targetAudience: {
      type: String,
      trim: true,
    },
    brandVoice: {
      type: String,
      trim: true,
    },
    competitors: {
      type: [String],
      default: [],
    },
    logo: {
      type: String,
      default: '',
    },
    brandColors: {
      type: [String],
      default: [],
    },
    brandColorsDescription: {
      type: String,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    creditsBalance: {
      type: Number,
      default: 25,
    },
    creditsTotalAllocated: {
      type: Number,
      default: 25,
    },
    creditsTotalPurchased: {
      type: Number,
      default: 0,
    },
    creditsTotalUsed: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Company', CompanySchema);
