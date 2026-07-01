import briefGenerator from '../services/seo-engine/briefGenerator.js';

const exports = {};

// @desc    Generate a structured SEO Brief from a keyword
// @route   POST /api/seo/brief
// @access  Private
exports.generateBriefController = async (req, res, next) => {
  try {
    const { keyword } = req.body;
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ success: false, error: 'Keyword is required to generate a brief' });
    }

    const brief = await briefGenerator.generateBrief(keyword);

    res.status(200).json({
      success: true,
      data: brief
    });
  } catch (error) {
    next(error);
  }
};

export default exports;