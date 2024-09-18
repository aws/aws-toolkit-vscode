const fs = require('fs');
const path = require('path');

const UploadsPath = path.join(__dirname, '../w3s-dynamic-storage/uploads');

if (!fs.existsSync(UploadsPath)) {
  fs.mkdirSync(UploadsPath);
}

const uploadFile = async (key, file) => {
  fs.writeFileSync(path.join(UploadsPath, key), file.buffer);
  return key;
}
const deleteFile = async (key) => {
  try {
    fs.unlinkSync(path.join(UploadsPath, key));
  } catch (err) {
    console.error(err)
  }

  return true;
};

module.exports = {
  uploadFile,
  deleteFile,
};
