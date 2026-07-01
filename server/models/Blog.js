import mongoose from 'mongoose';



const BlogSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: false,
      unique: true,
      sparse: true,
    },
    title: {
      type: String,
      required: [true, 'Blog Title is required'],
      trim: true,
    },
    metaDescription: {
      type: String,
      trim: true,
      default: '',
    },
    outline: [
      {
        sectionTitle: { type: String, required: true },
        talkingPoints: { type: [String], default: [] },
      }
    ],
    content: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Draft', 'Scheduled', 'Published', 'Archived', 'draft', 'approved', 'scheduled', 'published', 'archived'],
      default: 'Draft',
    },
    keyword: {
      type: String,
      trim: true,
      default: '',
    },
    publishDate: {
      type: Date,
      default: null,
    },
    author: {
      type: String,
      trim: true,
      default: '',
    },
    keywordCategory: {
      type: String,
      trim: true,
      default: '',
    },
    targetAudience: {
      type: String,
      trim: true,
      default: '',
    },
    tone: {
      type: String,
      trim: true,
      default: '',
    },
    slug: {
      type: String,
      trim: true,
      default: '',
    },
    seoScore: {
      type: Number,
      default: 0,
    },
    wordCount: {
      type: Number,
      default: 0,
    },
    seoAnalysis: {
      score: { type: Number, default: 0 },
      seoScore: { type: Number, default: 0 },
      readabilityScore: { type: Number, default: 0 },
      keywordDensity: { type: Number, default: 0 },
      titleScore: { type: Number, default: 0 },
      metaScore: { type: Number, default: 0 },
      headingScore: { type: Number, default: 0 },
      checks: {
        keywordInTitle: { type: Boolean, default: false },
        keywordInMetaDescription: { type: Boolean, default: false },
        keywordInFirstParagraph: { type: Boolean, default: false },
        keywordInH1: { type: Boolean, default: false },
        keywordInSlug: { type: Boolean, default: false },
        wordCount: { type: Number, default: 0 },
        h2Count: { type: Number, default: 0 },
        h3Count: { type: Number, default: 0 },
        faqPresence: { type: Boolean, default: false },
        conclusionPresence: { type: Boolean, default: false },
        internalLinks: { type: Number, default: 0 },
        externalLinks: { type: Number, default: 0 },
        imageAltText: { type: Boolean, default: false }
      },
      recommendations: { type: [String], default: [] },
    },
    optimizationHistory: [
      {
        attempt: { type: Number, required: true },
        oldScore: { type: Number, required: true },
        newScore: { type: Number, required: true },
        improvements: { type: [String], default: [] },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    versions: [
      {
        version: { type: Number, required: true },
        title: { type: String, required: true },
        metaDescription: { type: String, default: '' },
        content: { type: String, required: true },
        seoScore: { type: Number, default: 0 },
        createdAt: { type: Date, default: Date.now },
      }
    ],
    seoBrief: {
      primaryKeyword: { type: String, default: '' },
      secondaryKeywords: { type: [String], default: [] },
      searchIntent: { type: String, default: '' },
      h1Suggestion: { type: String, default: '' },
      h2Suggestions: { type: [String], default: [] },
      semanticKeywords: { type: [String], default: [] },
      recommendedWordCount: { type: Number, default: 1000 },
    },
    publishInfo: {
      platform: {
        type: String,
        enum: ['wordpress', 'html', 'markdown'],
      },
      publishedAt: {
        type: Date,
      },
      externalId: {
        type: String,
      },
      url: {
        type: String,
      },
      exportData: {
        type: String,
      },
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Blog', BlogSchema);
