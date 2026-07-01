import Persona from '../models/Persona.js';

const exports = {};

// @desc    Get all company personas
// @route   GET /api/personas
// @access  Private
exports.getPersonas = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const personas = await Persona.find({ companyId: req.user.companyId });
    res.status(200).json({
      success: true,
      count: personas.length,
      data: personas,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new persona
// @route   POST /api/personas
// @access  Private
exports.createPersona = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const { personaName, tone, writingStyle, audienceType, description } = req.body;

    const persona = await Persona.create({
      companyId: req.user.companyId,
      personaName,
      tone,
      writingStyle,
      audienceType,
      description,
    });

    res.status(201).json({
      success: true,
      data: persona,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a persona
// @route   PUT /api/personas/:id
// @access  Private
exports.updatePersona = async (req, res, next) => {
  try {
    let persona = await Persona.findById(req.params.id);

    if (!persona) {
      return res.status(404).json({ success: false, error: 'Persona not found' });
    }

    // Verify company ownership context
    if (persona.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to modify this persona profile' });
    }

    persona = await Persona.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: persona,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a persona
// @route   DELETE /api/personas/:id
// @access  Private
exports.deletePersona = async (req, res, next) => {
  try {
    const persona = await Persona.findById(req.params.id);

    if (!persona) {
      return res.status(404).json({ success: false, error: 'Persona not found' });
    }

    // Verify company ownership context
    if (persona.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to modify this persona profile' });
    }

    await Persona.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      data: {},
      message: 'Persona removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

export default exports;