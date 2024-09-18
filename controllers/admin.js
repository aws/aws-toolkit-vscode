const adminService = require('../services/admin');
const { validationResult } = require('express-validator');

const getAddProduct = (req, res, next) => {
  res.render('admin/add-edit-form', {
    pageTitle: 'Add Product',
    path: '/admin/add-product',
    editing: false,
    hasError: false,
    errorMessage: null,
    validationErrors: [],
  });
};
const postAddProduct = (req, res, next) => {
  const { title, price, description, details } = req.body;
  const image = req.file;

  if (!image) {
    return res.status(422).render('admin/add-edit-form', {
      pageTitle: 'Add Product',
      path: '/admin/add-product',
      editing: false,
      hasError: true,
      product: {
        title,
        price,
        description,
        details,
      },
      errorMessage: 'File type not supported. Please upload a JPEG, JPG, or PNG image file.',
      validationErrors: [],
    });
  }
  const errors = validationResult(req);

  if (errors && !errors.isEmpty()) {
    return res.status(422).render('admin/add-edit-form', {
      pageTitle: 'Add Product',
      path: '/admin/add-product',
      editing: false,
      hasError: true,
      product: {
        title,
        price,
        description,
        details,
      },
      errorMessage: errors.array()[0].msg,
      validationErrors: errors.array(),
    });
  }
  const newProduct = { title, price, description, details, image, userId: req.user.id };
  adminService.addProduct(newProduct)
    .then(() => {
      res.redirect('/admin/products');
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};
const getEditProduct = (req, res, next) => {
  const editMode = req.query.edit;

  if (!editMode) {
    return res.redirect('/');
  }
  adminService.getProduct(req.params.productId)
    .then((product) => {
      if (!product) {
        return res.redirect('/');
      }
      res.render('admin/add-edit-form', {
        pageTitle: 'Edit Product',
        path: '/admin/edit-product',
        editing: editMode,
        product,
        hasError: false,
        errorMessage: null,
        validationErrors: [],
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};
const postEditProduct = (req, res, next) => {
  const { productId, title, price, description, details } = req.body;
  const image = req.file;
  const errors = validationResult(req);

  if (errors && !errors.isEmpty()) {
    return res.status(422).render('admin/add-edit-form', {
      pageTitle: 'Edit Product',
      path: '/admin/edit-product',
      editing: true,
      hasError: true,
      product: {
        title,
        price,
        description,
        details,
        id: productId,
      },
      errorMessage: errors.array()[0].msg,
      validationErrors: errors.array(),
    });
  }
  const product = { productId, title, price, description, details, image, userId: req.user.id };

  adminService.updateProduct(product)
    .then((status) => {
      res.redirect(status ? '/admin/products' : '/')
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};
const getProducts = (req, res, next) => {
  const limit = 8;
  const page = +req.query.page || 1;
  const userId = req.user.id;

  adminService.getProducts(page, limit, userId)
    .then(({ count, products }) => {
      res.render('admin/products', {
        prods: products,
        pageTitle: 'Admin Products',
        path: '/admin/products',
        currentPage: page,
        hasNextPage: limit * page < count,
        hasPreviousPage: page > 1,
        nextPage: page + 1,
        previousPage: page - 1,
        lastPage: Math.ceil(count / limit),
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};
const deleteProduct = (req, res, next) => {
  adminService.deleteProduct(req.params.productId)
    .then(() => {
      res.status(200).json({ message: 'Success!' });
    })
    .catch((err) => {
      res.status(500).json({ message: 'Deleting product failed.' });
    });
};
const uploadImage = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      uploaded: false,
      error: {
        message: 'File content not found'
      }
    });
  }
  return adminService.uploadFile(req.file)
    .then((data) => {
      return res.status(200).json(data);
    });
};

module.exports = {
  getAddProduct,
  postAddProduct,
  getEditProduct,
  postEditProduct,
  getProducts,
  deleteProduct,
  uploadImage
};
