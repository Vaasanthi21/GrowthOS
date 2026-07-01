import express from 'express';
import personaControllerController from '../controllers/personaController.js';
import { protect } from '../middleware/auth.js';


const { getPersonas,
  createPersona,
  updatePersona,
  deletePersona,
 } = personaControllerController;

const router = express.Router();

// Secure all endpoints under auth shield
router.use(protect);

router.route('/')
  .get(getPersonas)
  .post(createPersona);

router.route('/:id')
  .put(updatePersona)
  .delete(deletePersona);

export default router;
