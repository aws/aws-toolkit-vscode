const dbAdapter = require('../database');
const { processCheckout } = require('../util/payment');

const getProducts = (page, limit) => dbAdapter.getProducts(page, limit);
const getProduct = (productId) => dbAdapter.getProductById(productId);
const getCart = (user) => dbAdapter.getCart(user);
const addToCart = (productId, user) => {
  return dbAdapter.getProductById(productId)
    .then((product) => dbAdapter.addToCart(user, product));
};
const removeFromCart = (productId, user) => dbAdapter.removeFromCart(user, productId);
const checkout = (user, req) => {
  let products = [];
  let totalCost = 0;

  return dbAdapter.getCart(user)
    .then((cartItems) => {
      products = cartItems;
      totalCost = products.reduce((cost, p) => {
        cost += p.quantity * p.productId.price;
        return cost;
      }, 0).toFixed(2);

      return processCheckout(products, req);
    })
    .then((session) => ({ session, totalCost, products }));
};
const processOrder = (user) => {
  return dbAdapter.getCart(user)
    .then((products) => {
      const mProducts = products.map((i) => {
        return { quantity: i.quantity, product: { ...i.productId } };
      });
      return dbAdapter.createOrder(user, mProducts);
    })
    .then(() => dbAdapter.clearCart(user));
};
const getOrders = (userId) => dbAdapter.getOrders(userId);
const getAddressByUserId = (userId) => dbAdapter.getAddressByUserId(userId);
const addOrUpdateAddress = (shipmentAddress) => dbAdapter.addOrUpdateAddress(shipmentAddress);

module.exports = {
  getProducts,
  getProduct,
  getCart,
  addToCart,
  removeFromCart,
  checkout,
  processOrder,
  getOrders,
  getAddressByUserId,
  addOrUpdateAddress,
}