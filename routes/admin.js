const express = require('express');
const { body } = require('express-validator');
const adminController = require('../controllers/admin');
const fileContent = require('../middleware/fileContent');
const isAdminUser = require('../middleware/isAdminUser');
const isAuthenticated = require('../middleware/isAuthenticated');

const adminRouter = express.Router();

const productValidator = [
  body('title')
    .trim()
    .isString()
    .isLength({ min: 1, max: 250 })
    .withMessage('Title must be 1 to 250 characters in length.'),
  body('price').isFloat(),
  body('description')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Description must be 1 to 500 characters in length.'),
];

adminRouter.use(isAuthenticated);
adminRouter.use(isAdminUser);
adminRouter.get('/add-product', adminController.getAddProduct);
adminRouter.get('/products', adminController.getProducts);
adminRouter.post('/add-product',
  fileContent.single('image'),
  productValidator,
  adminController.postAddProduct
);
adminRouter.get('/edit-product/:productId', adminController.getEditProduct);
adminRouter.post('/edit-product',
  fileContent.single('image'),
  productValidator,
  adminController.postEditProduct
);
adminRouter.delete('/product/:productId', adminController.deleteProduct);
adminRouter.post('/upload-image', fileContent.single('upload'), adminController.uploadImage);

module.exports = adminRouter;
