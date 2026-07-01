import express from 'express';
import topicControllerController from '../controllers/topicController.js';
import { protect } from '../middleware/auth.js';


const { getTopics,
  getTopicById,
  createTopic,
  updateTopic,
  deleteTopic,
  suggestKeywords,
 } = topicControllerController;

const router = express.Router();

// Secure all endpoints under auth shield
router.use(protect);

router.post('/suggest-keywords', suggestKeywords);

router.route('/')
  .get(getTopics)
  .post(createTopic);

router.route('/:id')
  .get(getTopicById)
  .put(updateTopic)
  .delete(deleteTopic);

export default router;
