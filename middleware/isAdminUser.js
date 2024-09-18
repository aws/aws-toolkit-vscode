module.exports = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  next(new Error('Not authorized'));
};
