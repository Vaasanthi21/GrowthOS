import Research from '../models/Research.js';
import Topic from '../models/Topic.js';
import researchEngine from '../services/research-engine/researchEngine.js';
import creditService from '../services/creditService.js';

const exports = {};

// @desc    Trigger AI research synthesis for a topic and store it
// @route   POST /api/research/generate
// @access  Private
exports.generateResearch = async (req, res, next) => {
  let chargeResult = null;
  let researchCost = 1;
  try {
    const { topicId } = req.body;
    if (!topicId) {
      return res.status(400).json({ success: false, error: 'Topic ID is required' });
    }

    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    // 1. Verify topic exists and belongs to user's company
    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({ success: false, error: 'Topic not found' });
    }

    if (topic.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to research this topic' });
    }

    // Fetch credit settings and charge
    const creditSettings = await creditService.getCreditSettings();
    researchCost = creditSettings.researchAnalysisCost || 1;

    try {
      chargeResult = await creditService.chargeCreditsForGeneration({
        companyId: req.user.companyId,
        userId: req.user._id,
        amount: researchCost,
        type: 'research_analysis',
        note: `Topic research synthesis charge (${researchCost} credits)`,
      });
    } catch (creditErr) {
      return res.status(402).json({
        success: false,
        error: `Insufficient credits to run topic research. Cost: ${researchCost} credits.`,
      });
    }

    // 2. Synthesize using ResearchEngine service
    const synthesizedData = await researchEngine.synthesizeResearch(req.user.companyId, topicId);

    // 3. Save to database - Overwrite existing research if it already exists for this topic, or create a new one!
    // Since unique is topicId, let's do an upsert to keep the DB clean and avoid duplicate key errors.
    const research = await Research.findOneAndUpdate(
      { topicId },
      {
        companyId: req.user.companyId,
        topicId,
        news: synthesizedData.news,
        keywords: synthesizedData.keywords,
        competitorAnalysis: synthesizedData.competitorAnalysis,
        suggestedAngles: synthesizedData.suggestedAngles,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    res.status(201).json({
      success: true,
      data: research,
    });
  } catch (error) {
    if (chargeResult) {
      await creditService.refundGenerationCredits({
        companyId: req.user.companyId,
        userId: req.user._id,
        amount: researchCost,
        type: 'research_analysis',
        note: `Refund for failed topic research: ${error.message || 'unknown error'}`,
      });
    }
    next(error);
  }
};

// @desc    Get research report for a specific topic
// @route   GET /api/research/:topicId
// @access  Private
exports.getResearchByCampaign = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    // Verify topic belongs to company
    const topic = await Topic.findById(req.params.topicId);
    if (!topic) {
      return res.status(404).json({ success: false, error: 'Topic not found' });
    }

    if (topic.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to access research for this topic' });
    }

    const researchRecord = await Research.findOne({
      companyId: req.user.companyId,
      topicId: req.params.topicId,
    }).populate('topicId');

    if (!researchRecord) {
      return res.status(404).json({
        success: false,
        error: 'No research report found for this topic context. Synthesize one first.',
      });
    }

    res.status(200).json({
      success: true,
      data: researchRecord,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all research reports for the company context (Optional utility)
// @route   GET /api/research
// @access  Private
exports.getResearches = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const researchRecords = await Research.find({ companyId: req.user.companyId }).populate('topicId');
    res.status(200).json({
      success: true,
      count: researchRecords.length,
      data: researchRecords,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a research report (Optional utility)
// @route   DELETE /api/research/delete/:id
// @access  Private
exports.deleteResearch = async (req, res, next) => {
  try {
    const research = await Research.findById(req.params.id);

    if (!research) {
      return res.status(404).json({ success: false, error: 'Research report not found' });
    }

    if (research.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this research report' });
    }

    await Research.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      data: {},
      message: 'Research report removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

export default exports;