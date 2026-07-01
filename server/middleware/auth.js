import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const jwtSecret = process.env.JWT_SECRET || 'creative-studio-dev-secret';

export const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.sub);

    if (!user) {
      return res.status(401).json({ message: 'User profile not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid session' });
  }
};
