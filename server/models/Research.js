import mongoose from 'mongoose';



const ResearchSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
      unique: true, // One research report per topic
    },
    news: {
      type: String,
      default: '',
    },
    keywords: [
      {
        keyword: { type: String, required: true },
        volume: { type: String, default: 'Moderate' },
        difficulty: { type: String, default: 'Medium' },
        intent: { type: String, default: 'Informational' },
      },
    ],
    competitorAnalysis: {
      type: String,
      default: '',
    },
    suggestedAngles: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Research', ResearchSchema);
