import express from 'express';
import seoControllerController from '../controllers/seoController.js';
import { protect } from '../middleware/auth.js';


const { generateBriefController  } = seoControllerController;

const router = express.Router();

// Secure all endpoints under auth shield
router.use(protect);

router.post('/brief', generateBriefController);

export default router;
