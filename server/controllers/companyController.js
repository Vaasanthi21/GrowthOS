import Company from '../models/Company.js';
import User from '../models/User.js';
import storageService from '../services/storageService.js';
import aiService from '../services/aiService.js';

const exports = {};

// @desc    Get active company details
// @route   GET /api/company
// @access  Private
exports.getCompany = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(404).json({ success: false, error: 'No company associated with this user' });
    }

    const company = await Company.findById(req.user.companyId);
    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    res.status(200).json({
      success: true,
      data: company,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create company details
// @route   POST /api/company
// @access  Private
exports.createCompany = async (req, res, next) => {
  try {
    // If user already has a company, block creation
    if (req.user.companyId) {
      return res.status(400).json({ success: false, error: 'User already has an associated company' });
    }

    const { companyName, website, industry, productDescription, targetAudience, brandVoice, competitors } = req.body;

    const company = await Company.create({
      companyName,
      website,
      industry,
      productDescription,
      targetAudience,
      brandVoice,
      competitors,
      createdBy: req.user.id,
    });

    // Update user's company ID
    await User.findByIdAndUpdate(req.user.id, { companyId: company._id });
    req.user.companyId = company._id;

    res.status(201).json({
      success: true,
      data: company,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update company details
// @route   PUT /api/company/:id
// @access  Private
exports.updateCompany = async (req, res, next) => {
  try {
    let company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Make sure user belongs to this company or is creator
    if (req.user.companyId.toString() !== company._id.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to modify this company' });
    }

    if (req.body.logo === '') {
      req.body.brandColors = [];
      req.body.brandColorsDescription = '';
    }

    company = await Company.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: company,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload company logo, optimize file size, analyze brand colors via Vision AI
// @route   POST /api/company/upload-logo
// @access  Private
// @headers Content-Type: multipart/form-data
exports.uploadLogo = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(404).json({ success: false, error: 'No company profile associated with this user context' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No logo image file provided' });
    }

    // 1. Upload file buffer to Cloudinary with max 400x400 limit, auto quality, and webp/optimal format
    const uploadOptions = {
      transformation: [
        { width: 400, height: 400, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' }
      ]
    };

    const storageResult = await storageService.uploadBuffer(req.file.buffer, req.file.originalname, uploadOptions);
    let logoUrl = storageResult.url;
    if (logoUrl && logoUrl.includes('res.cloudinary.com') && logoUrl.toLowerCase().endsWith('.ico')) {
      logoUrl = logoUrl.replace(/\.ico$/i, '.png');
    }

    // 2. Invoke Vision AI to analyze logo colors
    let brandColors = [];
    let brandColorsDescription = '';

    try {
      // If we uploaded to Cloudinary, we can pass the remote logoUrl.
      // Otherwise (local fallback), we pass the base64 data URL constructed from the uploaded file buffer.
      let imageToAnalyze = logoUrl;
      if (!logoUrl.startsWith('http') && req.file && req.file.buffer) {
        const base64Data = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype || 'image/png';
        imageToAnalyze = `data:${mimeType};base64,${base64Data}`;
      }

      const analysis = await aiService.analyzeLogoColors(imageToAnalyze, req.user.companyId);
      if (analysis) {
        brandColors = analysis.colors || [];
        brandColorsDescription = analysis.description || '';
      }
    } catch (visionErr) {
      console.warn('[COMPANY CONTROLLER WARNING] Vision logo color analysis failed:', visionErr.message);
      brandColorsDescription = 'Logo uploaded successfully. Ready for asset generation.';
    }

    // 3. Update Company schema record
    const updatedCompany = await Company.findByIdAndUpdate(
      req.user.companyId,
      {
        logo: logoUrl,
        brandColors,
        brandColorsDescription,
      },
      { new: true }
    );

    if (!updatedCompany) {
      return res.status(404).json({ success: false, error: 'Associated company profile record not found' });
    }

    res.status(200).json({
      success: true,
      data: updatedCompany,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete company logo and clear brand colors
// @route   DELETE /api/company/delete-logo
// @access  Private
exports.deleteLogo = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(404).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const company = await Company.findById(req.user.companyId);
    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Clean up old logo asset file from Cloudinary or local uploads
    if (company.logo) {
      try {
        if (company.logo.includes('res.cloudinary.com')) {
          const parts = company.logo.split('/upload/');
          if (parts.length > 1) {
            const pathParts = parts[1].split('/');
            const publicIdWithExt = pathParts.slice(1).join('/');
            const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.'));
            await storageService.deleteAsset(publicId);
          }
        } else if (company.logo.startsWith('/uploads/')) {
          const filename = company.logo.replace('/uploads/', '');
          await storageService.deleteAsset(filename);
        }
      } catch (cleanupErr) {
        console.warn('[COMPANY CONTROLLER WARNING] Logo file cleanup failed:', cleanupErr.message);
      }
    }

    // Update database record to clear logo fields
    const updatedCompany = await Company.findByIdAndUpdate(
      req.user.companyId,
      {
        logo: '',
        brandColors: [],
        brandColorsDescription: '',
      },
      { new: true }
    );

    if (!updatedCompany) {
      return res.status(404).json({ success: false, error: 'Associated company profile record not found' });
    }

    res.status(200).json({
      success: true,
      data: updatedCompany,
    });
  } catch (error) {
    next(error);
  }
};




export default exports;