import mongoose from 'mongoose';



const PersonaSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    personaName: {
      type: String,
      required: [true, 'Persona Name is required'],
      trim: true,
    },
    tone: {
      type: String,
      required: [true, 'Tone is required'],
      trim: true,
    },
    writingStyle: {
      type: String,
      trim: true,
      default: '',
    },
    audienceType: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Persona', PersonaSchema);
