const uuidV4 = require('uuidv4');
const dbAdapter = require('../database');
const emailUtil = require('../util/email');

const validateLogin = (email, password) => dbAdapter.validateLogin(email, password);
const signup = (user) => {
  return dbAdapter.signup(user)
    .then((status) => {
      if (status) {
        emailUtil.sendEmail({
          to: user.email,
          subject: 'Welcome to Web shop',
          html: '<h3>You have successfully signed up.</h3>',
        });
      }
      return status;
    });
};
const sendResetPasswordToken = (email) => {
  const token = uuidV4.uuid();

  return dbAdapter.attachResetPasswordToken(email, token)
    .then(() => {
      emailUtil.sendEmail({
        to: email,
        subject: 'Password reset',
        html: `
        <p>We received your Web shop account password reset request.</p>
        <p>To set a new password, use this <a href="${process.env.DOMAIN}/reset-password/${token}">link</a>.</p>
        <p>If you did not submit a request to change your password, please disregard this message.</p>
      `,
      });
    })
};
const getUserBySearchParam = (param) => dbAdapter.getUserBySearchParam(param);
const setNewPassword = (userId, newPassword, passwordToken) => {
  return dbAdapter.resetPassword(userId, newPassword, passwordToken)
    .then(() => {
      emailUtil.sendEmail({
        to: resetUser.email,
        subject: 'Password reset successful',
        html: `<p>Your Web shop password has been changed.</p>`,
      });
    })
};

module.exports = {
  validateLogin,
  signup,
  sendResetPasswordToken,
  getUserBySearchParam,
  setNewPassword,
};
