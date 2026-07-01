import express from 'express';
import blogControllerController from '../controllers/blogController.js';
import { protect } from '../middleware/auth.js';


const { generateBlog,
  getBlogs,
  getBlogById,
  updateBlog,
  getBlogByTopic,
  optimizeBlog,
  getBlogVersions,
  restoreBlogVersion,
  approveBlog,
  publishBlog,
 } = blogControllerController;

const router = express.Router();

// Secure all endpoints under auth shield
router.use(protect);

router.post('/generate', generateBlog);
router.get('/topic/:topicId', getBlogByTopic);
router.post('/:id/optimize', optimizeBlog);
router.get('/:id/versions', getBlogVersions);
router.post('/:id/restore/:version', restoreBlogVersion);
router.post('/:id/approve', approveBlog);
router.post('/:id/publish', publishBlog);

router.route('/')
  .get(getBlogs);

router.route('/:id')
  .get(getBlogById)
  .put(updateBlog);

export default router;
