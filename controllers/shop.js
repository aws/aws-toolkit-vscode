const shopService = require('../services/shop');

const getProducts = (req, res, next) => {
  const page = +req.query.page || 1;
  const limit = 8;

  shopService.getProducts(page, limit)
    .then(({ count, products }) => {
      res.render('shop/product-list', {
        prods: products,
        pageTitle: 'Products',
        path: '/products',
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
const getProduct = (req, res, next) => {
  shopService.getProduct(req.params.productId)
    .then((product) => {
      res.render('shop/product-detail', {
        product,
        pageTitle: product.title,
        path: '/products',
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};
const getHomepage = (req, res, next) => {
  const page = +req.query.page || 1;
  const limit = 8;

  shopService.getProducts(page, limit)
    .then(({ count, products }) => {
      res.render('shop/index', {
        pageTitle: 'Home',
        path: '/',
        prods: products,
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
const getCart = (req, res, next) => {
  shopService.getCart(req.user)
    .then((products) => {
      res.render('shop/cart', {
        path: '/cart',
        pageTitle: 'Your Cart',
        products,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};
const postCart = (req, res, next) => {
  shopService.addToCart(req.body.productId, req.user)
    .then(() => {
      res.redirect('/cart');
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};
const postCartDeleteProduct = (req, res, next) => {
  shopService.removeFromCart(req.body.productId, req.user)
    .then((result) => {
      res.redirect('/cart');
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};
const getCheckout = (req, res, next) => {
  shopService.checkout(req.user, req)
    .then(({ session, totalCost, products }) => {
      res.render('shop/checkout', {
        path: '/checkout',
        pageTitle: 'Checkout',
        products,
        totalSum: totalCost,
        sessionId: session.id,
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};
const getCheckoutSuccess = (req, res, next) => {
  shopService.processOrder(req.user)
    .then(() => {
      res.redirect('/orders');
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};
const getOrders = (req, res, next) => {
  shopService.getOrders(req.user.id)
    .then((orders) => {
      res.render('shop/orders', {
        path: '/orders',
        pageTitle: 'Your Orders',
        orders,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};
const getAbout = (req, res, next) => {
  res.render('shop/about', {
    pageTitle: 'About',
    path: '/about',
  });
};
const getContact = (req, res, next) => {
  res.render('shop/contact', {
    pageTitle: 'About',
    path: '/about',
  });
};
const getMyPage = (req, res, next) => {
  Promise.all([
    shopService.getOrders(req.user.id),
    shopService.getAddressByUserId(req.user.id),
  ])
    .then(([orders, shipmentAddress]) => {
      res.render('shop/mypage', {
        pageTitle: 'My Page',
        path: '/mypage',
        shipmentAddress,
        account: { email: req.user.email },
        orders,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};
const getShipment = (req, res, next) => {
  shopService.getAddressByUserId(req.user.id)
    .then((shipmentAddress) => {
      res.render('shop/shipment', {
        pageTitle: 'Shipment',
        path: '/shipment',
        shipmentAddress,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};
const postShipment = (req, res, next) => {
  const { firstname, lastname, phone, address, postalcode, city, state, country } = req.body;
  const shipmentAddress = {
    userId: req.user.id,
    firstname, lastname, phone, address, postalcode, city, state, country
  };

  shopService.addOrUpdateAddress(shipmentAddress)
    .then(() => getMyPage(req, res, next))
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

module.exports = {
  getProducts,
  getProduct,
  getHomepage,
  getCart,
  postCart,
  postCartDeleteProduct,
  getCheckout,
  getCheckoutSuccess,
  getOrders,
  getAbout,
  getContact,
  getMyPage,
  getShipment,
  postShipment
};
