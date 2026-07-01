import mongoose from 'mongoose';



const KnowledgeBaseSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    fileName: {
      type: String,
      required: [true, 'File Name is required'],
      trim: true,
    },
    fileType: {
      type: String,
      required: true,
      trim: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: true,
    },
    extractedText: {
      type: String,
      default: '',
    },
    summaryText: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('KnowledgeBase', KnowledgeBaseSchema);
