require('dotenv').config({ path: './w3s-dynamic-storage/.env' });
const bcrypt = require('bcryptjs');
const uuidV4 = require('uuidv4');
const moment = require('moment');
const sqlite = require('better-sqlite3');
const path = require('path');

// Initialize the database
const db = new sqlite(path.resolve(process.env.SQLITE_DB), { fileMustExist: false });

const initialize = () => {
  const createTableQueries = [
    'CREATE TABLE IF NOT EXISTS Users (id TEXT PRIMARY KEY, email TEXT, password TEXT, role TEXT, resetToken TEXT, cart TEXT)',
    'CREATE TABLE IF NOT EXISTS ShipmentAddresses (id TEXT PRIMARY KEY, userId TEXT, address TEXT)',
    'CREATE TABLE IF NOT EXISTS Products (id TEXT PRIMARY KEY, title TEXT, price REAL, description TEXT, imageUrl TEXT, imageKey TEXT, details LONGTEXT)',
    'CREATE TABLE IF NOT EXISTS Orders (id TEXT PRIMARY KEY, userId TEXT, email TEXT, date TEXT, products TEXT)',
  ];

  createTableQueries.forEach((query) => {
    db.prepare(query).run();
  })
  return Promise.resolve(db);
};
const addProduct = (product) => {
  return new Promise((resolve, reject) => {
    try {
      const productId = uuidV4.uuid();
      const { title, price, description, details, imageUrl, imageKey } = product;
      const stmt = db.prepare('INSERT INTO Products (id, title, price, description, details, imageUrl, imageKey) VALUES (?, ?, ?, ?, ?, ?, ?)');
      stmt.run(productId, title, price, description, details, imageUrl, imageKey);
      resolve(true);
    } catch (err) {
      console.log('Failed to add new product', err);
      reject(err)
    }
  });
};
const getProductById = (productId) => {
  return new Promise((resolve, reject) => {
    try {
      const stmt = db.prepare(`SELECT * from Products WHERE id = ?`);
      const product = stmt.get(productId);

      resolve(product);
    } catch (err) {
      console.log('Failed to add new product', err);
      reject(err)
    }
  });
};
const updateProduct = (product) => {
  return getProductById(product.productId)
    .then((eProduct) => {
      if (!eProduct) {
        throw new Error('Product not found');
      }
      const { title, price, description, details, imageUrl, imageKey } = product;
      const stmt = db.prepare('UPDATE Products SET title = ?, price = ?, description = ?, details = ?, imageUrl = ?, imageKey = ? WHERE id = ?');
      stmt.run(title, price, description, details, imageUrl || eProduct.imageUrl, imageKey || eProduct.imageKey, product.productId);
      return true;
    })
    .catch((err) => {
      console.log('Failed to update product', err);
      throw err;
    });
};
const getProducts = (page, limit) => {
  return new Promise((resolve, reject) => {
    try {
      const count = db.prepare(`SELECT COUNT(*) as count from Products`).get().count || 0;
      const products = db.prepare(`SELECT * FROM Products LIMIT ? OFFSET ?`).all(limit, (page - 1) * limit) || [];

      resolve({ count, products });
    } catch (err) {
      console.log('Failed to get products', err);
      reject(err);
    }
  });
};
const deleteProduct = (productId) => {
  return new Promise((resolve, reject) => {
    try {
      const stmt = db.prepare(`DELETE FROM Products WHERE id = ?`);
      stmt.run(productId);
      resolve(true);
    } catch (err) {
      console.log('Failed to add new product', err);
      reject(err)
    }
  });
};
const removeProductFromCart = (productId) => {
  // Removed from while fetching the cart items.
};
const getUserBySearchParam = (param) => {
  return new Promise((resolve, reject) => {
    try {
      const condition = Object.keys(param).map((key) => `${key} = '${param[key]}'`).join(' AND ');
      const stmt = db.prepare(`SELECT * from Users WHERE ${condition}`);
      const user = stmt.get();

      resolve(user);
    } catch (dbError) {
      console.error(dbError);
      reject(dbError);
    }
  });
}
const validateLogin = (email, password) => {
  let user;
  return getUserBySearchParam({ email })
    .then((userInfo) => {
      user = userInfo;
      return user ? bcrypt.compare(password, user.password) : false;
    })
    .then((match) => ({ match, user }))
    .catch((err) => {
      console.log('Failed to validate login', err);
      throw err;
    });
};
const signup = (user) => {
  return bcrypt.hash(user.password, 12)
    .then((hashedPassword) => {
      const stmt = db.prepare('INSERT INTO Users (id, email, password) VALUES (?, ?, ?)');
      stmt.run(uuidV4.uuid(), user.email, hashedPassword);
      return true;
    })
    .catch((err) => {
      console.log('Failed to signup', err);
      throw err;
    });
};
const addAdminUser = (user) => {
  return bcrypt.hash(user.password, 12)
    .then((hashedPassword) => {
      const stmt = db.prepare('INSERT INTO Users (id, email, password, role) VALUES (?, ?, ?, ?)');
      stmt.run(uuidV4.uuid(), user.email, hashedPassword, user.role || '');
      return true;
    })
    .catch((err) => {
      console.log('Failed to add admin user', err);
      throw err;
    });
};
const attachResetPasswordToken = (email, token) => {
  return getUserBySearchParam({ email })
    .then((user) => {
      if (!user) {
        throw new Error('No account with the provided email address exists.');
      }
      const stmt = db.prepare('UPDATE Users SET resetToken = ? WHERE email = ?');
      stmt.run(token, email);
      return true;
    })
    .catch((err) => {
      console.log('Failed to attach reset password token', err);
      throw err;
    });
};
const resetPassword = (userId, password, resetToken) => {
  return getUserBySearchParam({ id: userId, resetToken })
    .then((user) => {
      resetUser = user;
      return bcrypt.hash(password, 12);
    })
    .then((hashedPassword) => {
      const stmt = db.prepare('UPDATE Users SET password = ?, resetToken = ? WHERE id = ?');
      stmt.run(hashedPassword, '', userId);
      return true;
    })
    .catch((err) => {
      console.log('Failed to reset password', err);
      throw err;
    });
};
const deleteAdminUser = (userEmail) => {
  return new Promise((resolve, reject) => {
    try {
      const stmt = db.prepare('DELETE FROM Users WHERE email = ? AND role = ?');
      stmt.run(userEmail, 'admin');
      resolve(true);
    } catch (err) {
      console.log('Failed to delete admin user', err);
      reject(err)
    }
  });
}
const createOrder = (user, products) => {
  return new Promise((resolve, reject) => {
    try {
      const orderId = uuidV4.uuid();
      const date = moment().format('YYYY-MM-DD');
      const stmt = db.prepare('INSERT INTO Orders (id, userId, email, date, products) VALUES (?, ?, ?, ?, ?)');
      stmt.run(orderId, user.id, user.email, date, JSON.stringify(products));
      resolve(true);
    } catch (err) {
      console.log('Failed to create order', err);
      reject(err)
    }
  });
};
const getOrders = (userId) => {
  return new Promise((resolve, reject) => {
    try {
      const orders = db.prepare(`SELECT * from Orders WHERE userId = ?`).all(userId);
      orders.forEach((o) => {
        o.user = {
          email: o.email,
          userId: o.userId
        };
        o.products = JSON.parse(o.products);
      });
      resolve(orders);
    } catch (dbError) {
      console.error(dbError);
      reject(dbError);
    }
  });
};
const addToCart = (user, product) => {
  return getUserBySearchParam({ email: user.email })
    .then((userInfo) => {
      const cart = JSON.parse(userInfo.cart || '{"items":[]}');
      const cartProductIndex = cart.items.findIndex((cp) => cp.productId.toString() === product.id.toString());
      const updatedCartItems = [...cart.items];
      let newQuantity = 1;

      if (cartProductIndex >= 0) {
        newQuantity = cart.items[cartProductIndex].quantity + 1;
        updatedCartItems[cartProductIndex].quantity = newQuantity;
      } else {
        updatedCartItems.push({
          productId: product.id,
          quantity: newQuantity,
        });
      }
      const updatedCart = {
        items: updatedCartItems,
      };
      const stmt = db.prepare('UPDATE Users SET cart = ? WHERE email = ?');

      stmt.run(JSON.stringify(updatedCart), user.email);
      return true;
    });
};
const getCart = (user) => {
  let cartProducts;
  return getUserBySearchParam({ email: user.email })
    .then((userInfo) => {
      const cart = JSON.parse(userInfo.cart || '{"items":[]}');
      cartProducts = cart.items;
      return Promise.all(cart.items.map((item) => getProductById(item.productId)));
    })
    .then((products) => {
      return cartProducts.reduce((acc, p, index) => {
        if (products[index]) {
          acc.push({ ...p, productId: products[index] })
        }
        return acc;
      }, []);
    });
}
const removeFromCart = (user, productId) => {
  return getUserBySearchParam({ email: user.email })
    .then((userInfo) => {
      const cart = JSON.parse(userInfo.cart || '{"items":[]}');
      const updatedCartItems = cart.items.filter((i) => i.productId.toString() !== productId.toString());
      cart.items = updatedCartItems;
      const stmt = db.prepare('UPDATE Users SET cart = ? WHERE email = ?');

      stmt.run(JSON.stringify(cart), user.email);
      return true;
    });
};
const clearCart = (user) => {
  return new Promise((resolve, reject) => {
    try {
      const stmt = db.prepare('UPDATE Users SET cart = ? WHERE email = ?');
      stmt.run(JSON.stringify({ "items": [] }), user.email);
      resolve(true);
    } catch (dbError) {
      console.error(dbError);
      reject(dbError);
    }
  });
};
const createAddress = (shipmentAddress) => {
  return new Promise((resolve, reject) => {
    try {
      const userId = shipmentAddress.userId;
      delete shipmentAddress.userId;
      const stmt = db.prepare('INSERT INTO ShipmentAddresses (id, userId, address) VALUES (?, ?, ?)');
      stmt.run(uuidV4.uuid(), userId, JSON.stringify(shipmentAddress));
      resolve(true);
    } catch (err) {
      console.log('Failed to create shipment address', err);
      reject(err)
    }
  });
};
const updateAddress = (shipmentAddress) => {
  return new Promise((resolve, reject) => {
    try {
      const userId = shipmentAddress.userId;
      delete shipmentAddress.userId;
      delete shipmentAddress.id;
      const stmt = db.prepare('UPDATE ShipmentAddresses SET address = ? WHERE userId = ?');
      stmt.run(JSON.stringify(shipmentAddress), userId);
      resolve(true);
    } catch (err) {
      console.log('Failed to update shipment address', err);
      reject(err)
    }
  });
};
const getAddressByUserId = (userId) => {
  return new Promise((resolve, reject) => {
    try {
      const stmt = db.prepare(`SELECT * from ShipmentAddresses WHERE userId = ?`);
      const value = stmt.get(userId);
      let shipmentAddress = { ...(value || {}) };
      
      if (shipmentAddress.id) {
        shipmentAddress = Object.assign({}, shipmentAddress, JSON.parse(shipmentAddress.address))
      }
      resolve(shipmentAddress);
    } catch (err) {
      console.log('Failed to get shipment address', err);
      reject(err)
    }
  });
};
const addOrUpdateAddress = (shipmentAddress) => {
  return getAddressByUserId(shipmentAddress.userId)
  .then((savedAddress) => {
    return savedAddress.id ? updateAddress(shipmentAddress) : createAddress(shipmentAddress);
  });
}

module.exports = {
  initialize,
  addProduct,
  getProductById,
  updateProduct,
  getProducts,
  deleteProduct,
  getUserBySearchParam,
  removeProductFromCart,
  validateLogin,
  signup,
  addAdminUser,
  attachResetPasswordToken,
  resetPassword,
  deleteAdminUser,
  createOrder,
  getOrders,
  addToCart,
  getCart,
  removeFromCart,
  clearCart,
  getAddressByUserId,
  addOrUpdateAddress,
};
