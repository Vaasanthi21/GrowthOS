import express from 'express';
import multer from 'multer';
import path from 'path';
import imageControllerController from '../controllers/imageController.js';
import { protect } from '../middleware/auth.js';


const { generateImage,
  uploadImage,
  getImagesByBlog,
  suggestPrompt,
  downloadImage,
 } = imageControllerController;

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

// Secure all endpoints under auth shield
router.use(protect);

router.post('/generate', generateImage);
router.post('/suggest-prompt', suggestPrompt);
router.post('/upload', upload.single('image'), uploadImage);
router.get('/download', downloadImage);
router.get('/:blogId', getImagesByBlog);

export default router;
