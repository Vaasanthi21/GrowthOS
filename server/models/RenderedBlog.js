import mongoose from 'mongoose';



const RenderedBlogSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    blogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Blog',
      required: true,
    },
    platformName: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      default: '',
    },
    copy: {
      type: String,
      default: '',
    },
    hashtags: {
      type: [String],
      default: [],
    },
    metaDescription: {
      type: String,
      default: '',
    },
    seoScore: {
      type: Number,
      default: 0,
    },
    seoAnalysis: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('RenderedBlog', RenderedBlogSchema);
