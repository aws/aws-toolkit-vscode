const uuidV4 = require('uuidv4');
const path = require('path');
const dbAdapter = require('../database');
const fileUtils = require('../util/file');

const addProduct = (product) => {
  const fileExtension = path.extname(product.image.originalname);
  const key = `${uuidV4.uuid()}${fileExtension}`;
  
  return fileUtils.uploadFile(key, product.image)
    .then(() => {
      product.imageUrl = `/${key}`;
      product.imageKey = key;
      delete product.image;
      return dbAdapter.addProduct(product);
    })
};
const getProduct = (productId) => dbAdapter.getProductById(productId);
const updateProduct = async (product) => {
  if (product.image) {
    const fileExtension = path.extname(product.image.originalname);
    const key = `${uuidV4.uuid()}${fileExtension}`;
    await fileUtils.uploadFile(key, product.image)

    product.imageUrl = `/${key}`;
    product.imageKey = key;
    delete product.image;
  }

  return await dbAdapter.updateProduct(product);
};
const getProducts = (page, limit, userId) => dbAdapter.getProducts(page, limit, userId);
const deleteProduct = (productId) => {
  let product;
  return dbAdapter.getProductById(productId)
    .then((p) => {
      product = p;
      if (product) {
        return dbAdapter.removeProductFromCart(productId)
      }
      throw new Error('product not found');
    })
    .then(() => fileUtils.deleteFile(product.imageKey))
    .then(() => dbAdapter.deleteProduct(productId))
    .catch(() => false);
};
const uploadFile = (file) => {
  const fileExtension = path.extname(file.originalname);
  const key = `${uuidV4.uuid()}${fileExtension}`;
  
  return fileUtils.uploadFile(key, file)
    .then(() => ({
      uploaded: true,
      url: `/${key}`,
      key,
    }));
};

module.exports = {
  addProduct,
  getProduct,
  updateProduct,
  getProducts,
  deleteProduct,
  uploadFile,
};
