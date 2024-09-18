const authService = require('../services/auth');
const { validationResult } = require('express-validator');

const getLogin = (req, res) => {
  const message = req.flash('error');

  res.render('auth/login', {
    path: '/login',
    pageTitle: 'Log In',
    errorMessage: message[0],
    oldInput: {
      email: '',
      password: '',
    },
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
    validationErrors: [],
  });
};
const getSignup = (req, res) => {
  const message = req.flash('error');

  res.render('auth/signup', {
    path: '/signup',
    pageTitle: 'Sign Up',
    errorMessage: message[0],
    oldInput: {
      email: '',
      password: '',
      confirmPassword: '',
    },
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
    validationErrors: [],
  });
};
const postLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = validationResult(req);

  if (errors && !errors.isEmpty()) {
    return res.status(422).render('auth/login', {
      path: '/login',
      pageTitle: 'Log In',
      errorMessage: errors.array()[0].msg,
      oldInput: {
        email,
        password,
      },
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
      validationErrors: errors.array(),
    });
  }
  authService.validateLogin(email, password)
    .then(({ match, user }) => {
      if (match) {
        req.session.isLoggedIn = true;
        req.session.user = user;
        return req.session.save((err, r) => {
          if (err) {
            console.log(err);
          }
          res.redirect('/');
        });
      }
      return res.status(422).render('auth/login', {
        path: '/login',
        pageTitle: 'Log In',
        errorMessage: 'Invalid email or password.',
        oldInput: {
          email,
          password,
        },
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
        validationErrors: [],
      });
    })
    .catch((err) => {
      console.log(err);
      res.redirect('/login');
    });
};
const postSignup = (req, res, next) => {
  const { email, password, confirmPassword } = req.body;
  const errors = validationResult(req);

  if (errors && !errors.isEmpty()) {
    return res.status(422).render('auth/signup', {
      path: '/signup',
      pageTitle: 'Sign Up',
      errorMessage: errors.array()[0].msg,
      oldInput: { email, password, confirmPassword },
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
      validationErrors: errors.array(),
    });
  }

  authService.signup({ email, password })
    .then((status) => {
      if (status) {
        return res.redirect('/login');
      }
      throw new Error("Failed to signup");
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};
const postLogout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
    }
    res.redirect('/');
  });
};
const getResetPassword = (req, res) => {
  const message = req.flash('error');

  res.render('auth/reset-password', {
    path: '/reset-password',
    pageTitle: 'Reset Password',
    errorMessage: message[0],
  });
};
const postResetPassword = (req, res, next) => {
  authService.sendResetPasswordToken(req.body.email)
    .then(() => res.redirect('/'))
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};
const getNewPassword = (req, res, next) => {
  const token = req.params.token;

  authService.getUserBySearchParam({ resetToken: token })
    .then((user) => {
      if (!user) {
        req.flash(
          'error',
          'Invalid password reset link. To reset your password, submit a new request.'
        );
        return res.redirect('/login');
      }
      const message = req.flash('error');

      res.render('auth/new-password', {
        path: '/new-password',
        pageTitle: 'New Password',
        errorMessage: message[0],
        userId: user.id.toString(),
        passwordToken: token,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};
const postNewPassword = (req, res, next) => {
  const newPassword = req.body.password;
  const { userId, passwordToken } = req.body;

  authService.setNewPassword(userId, newPassword, passwordToken)
    .then(() => res.redirect('/login'))
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

module.exports = {
  getLogin,
  getSignup,
  postLogin,
  postSignup,
  postLogout,
  getResetPassword,
  postResetPassword,
  getNewPassword,
  postNewPassword
};
