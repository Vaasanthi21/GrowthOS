import express from 'express';
import renderControllerController from '../controllers/renderController.js';
import { protect } from '../middleware/auth.js';


const { generatePlatformRender,
  getRenderedBlog,
  getRenderByBlogAndPlatform,
  updateRenderedBlog,
  optimizeRenderedBlog,
 } = renderControllerController;

const router = express.Router();

// Secure all endpoints under auth shield
router.use(protect);

router.post('/:platform', generatePlatformRender);
router.get('/blog/:blogId/platform/:platformName', getRenderByBlogAndPlatform);
router.put('/:id', updateRenderedBlog);
router.post('/:id/optimize', optimizeRenderedBlog);
router.get('/:id', getRenderedBlog);

export default router;

