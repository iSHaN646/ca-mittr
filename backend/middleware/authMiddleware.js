import User from '../models/User.js';

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // Find user by token
      const user = await User.findOne({ token });

      if (!user) {
        return res.status(401).json({ success: false, error: 'Not authorized. Invalid session token.' });
      }

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ success: false, error: 'Not authorized. Authentication failed.' });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorized. No session token provided.' });
  }
};
