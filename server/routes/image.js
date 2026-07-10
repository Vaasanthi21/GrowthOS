const express = require('express');
const multer = require('multer');
const path = require('path');
const {
  generateImage,
  uploadImage,
  getImagesByBlog,
  suggestPrompt,
  downloadImage,
} = require('../controllers/imageController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Multer memory storage configuration
const storage = multer.memoryStorage();

// File upload filters & validations
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Max file size limit: 5MB for images
  fileFilter: (req, file, cb) => {
    const filetypes = /png|jpg|jpeg|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Supported image formats are: .png, .jpg, .jpeg, and .webp only.'));
    }
  },
});

// Public image viewer proxy (masks S3 URLs in downloaded files)
router.get('/view/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    // Validate filename to prevent path traversal
    if (!/^[a-zA-Z0-9_\-\.]+$/i.test(filename)) {
      return res.status(400).send('Invalid filename');
    }
    
    const s3Url = `https://creative-os-assets.s3.ap-south-1.amazonaws.com/images/${filename}`;
    const axios = require('axios');
    const response = await axios.get(s3Url, {
      responseType: 'stream',
      timeout: 10000
    });
    
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/png');
    response.data.pipe(res);
  } catch (error) {
    res.status(404).send('Image not found');
  }
});

// Secure all endpoints under auth shield
router.use(protect);

router.post('/generate', generateImage);
router.post('/suggest-prompt', suggestPrompt);
router.post('/upload', upload.single('image'), uploadImage);
router.get('/download', downloadImage);
router.get('/:blogId', getImagesByBlog);

module.exports = router;
