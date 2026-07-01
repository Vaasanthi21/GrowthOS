import Topic from '../models/Topic.js';
import aiService from '../services/aiService.js';
import Company from '../models/Company.js';

const exports = {};

// @desc    Get all company topics
// @route   GET /api/topics
// @access  Private
exports.getTopics = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const topics = await Topic.find({ companyId: req.user.companyId }).populate('personaId');
    res.status(200).json({
      success: true,
      count: topics.length,
      data: topics,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single topic details
// @route   GET /api/topics/:id
// @access  Private
exports.getTopicById = async (req, res, next) => {
  try {
    const topic = await Topic.findById(req.params.id).populate('personaId');

    if (!topic) {
      return res.status(404).json({ success: false, error: 'Topic not found' });
    }

    // Verify company ownership context
    if (topic.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to access this topic' });
    }

    res.status(200).json({
      success: true,
      data: topic,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new topic
// @route   POST /api/topics
// @access  Private
exports.createTopic = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const { personaId, topicName, topic, keywords, platforms, goal, status } = req.body;

    const newTopic = await Topic.create({
      companyId: req.user.companyId,
      personaId,
      topicName,
      topic,
      keywords,
      platforms,
      goal,
      status,
    });

    res.status(201).json({
      success: true,
      data: newTopic,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a topic
// @route   PUT /api/topics/:id
// @access  Private
exports.updateTopic = async (req, res, next) => {
  try {
    let topic = await Topic.findById(req.params.id);

    if (!topic) {
      return res.status(404).json({ success: false, error: 'Topic not found' });
    }

    // Verify company ownership context
    if (topic.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to modify this topic' });
    }

    topic = await Topic.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('personaId');

    res.status(200).json({
      success: true,
      data: topic,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a topic
// @route   DELETE /api/topics/:id
// @access  Private
exports.deleteTopic = async (req, res, next) => {
  try {
    const topic = await Topic.findById(req.params.id);

    if (!topic) {
      return res.status(404).json({ success: false, error: 'Topic not found' });
    }

    // Verify company ownership context
    if (topic.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this topic' });
    }

    await Topic.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      data: {},
      message: 'Topic removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Suggest SEO keywords based on topic details and company info
// @route   POST /api/topics/suggest-keywords
// @access  Private
exports.suggestKeywords = async (req, res, next) => {
  try {
    const { topicName, topic } = req.body;
    if (!topicName || !topic) {
      return res.status(400).json({ success: false, error: 'Topic name and details are required' });
    }

    // Fetch company info
    const company = await Company.findById(req.user.companyId) || {
      companyName: 'UDEN Tech',
      industry: 'EdTech',
      brandVoice: 'Professional',
      productDescription: 'AI career placement'
    };

    const suggested = await aiService.suggestSEOKeywords(topicName, topic, company);
    res.status(200).json({
      success: true,
      data: suggested
    });
  } catch (error) {
    next(error);
  }
};

export default exports;