import mongoose from 'mongoose';



const CreditTransactionSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['signup_bonus', 'generation_text', 'generation_image', 'crawling_analysis', 'research_analysis', 'manual_adjustment'],
    },
    note: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: String,
      required: true,
      default: 'system',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('CreditTransaction', CreditTransactionSchema);
