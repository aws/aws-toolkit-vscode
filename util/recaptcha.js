const fetch = require('node-fetch');

const isValidToken = async (token) => {
  const data = {
    valid: false,
    message: '',
  };

  if (!token) {
    data.message = 'Recaptcha token not found';
    return data;
  }
  const recaptchaResponse = await fetch(
    `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`,
    { method: 'POST' }
  );
  const recaptchaData = await recaptchaResponse.json();

  data.valid = (recaptchaData && recaptchaData.success) || false;
  if (!data.valid) {
    data.message = 'Invalid recaptcha token found';
  }

  return data;
}

module.exports = {
  isValidToken,
};
