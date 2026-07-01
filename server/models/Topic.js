import mongoose from 'mongoose';



const TopicSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    personaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Persona',
      required: [true, 'Persona selection is required'],
    },
    topicName: {
      type: String,
      required: [true, 'Topic Name is required'],
      trim: true,
    },
    topic: {
      type: String,
      required: [true, 'Topic Detail is required'],
      trim: true,
    },
    keywords: {
      type: [String],
      default: [],
    },
    platforms: {
      type: [String],
      default: [],
    },
    goal: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'completed'],
      default: 'draft',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Topic', TopicSchema);
