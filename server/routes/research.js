import express from 'express';
import researchControllerController from '../controllers/researchController.js';
import { protect } from '../middleware/auth.js';


const { generateResearch,
  getResearchByCampaign,
  getResearches,
  deleteResearch,
 } = researchControllerController;

const router = express.Router();

// Secure all endpoints under auth shield
router.use(protect);

router.post('/generate', generateResearch);
router.get('/:topicId', getResearchByCampaign);

// Optional helper list and delete routes
router.get('/', getResearches);
router.delete('/:id', deleteResearch);

export default router;
