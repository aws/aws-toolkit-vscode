const nodemailer = require('nodemailer');
const { EMAIL_HOST, EMAIL_PORT, EMAIL_AUTH_USER, EMAIL_AUTH_PASS, EMAIL_FROM } = process.env;

const from = EMAIL_FROM
const transporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: parseInt(EMAIL_PORT),
  auth: {
    user: EMAIL_AUTH_USER,
    pass: EMAIL_AUTH_PASS
  }
});

const sendEmail = (options) => {
  const { to, subject, html } = options;

  return transporter.sendMail({ from, to, subject, html });
}

module.exports = {
  sendEmail,
};
