require('dotenv').config({ path: './w3s-dynamic-storage/.env' });
const path = require('path');
const express = require('express');
const flash = require('connect-flash');
const helmet = require('helmet');
const compression = require('compression');
const favicon = require('serve-favicon');
const morgan = require('morgan')
const errorController = require('./controllers/error');
const adminRoutes = require('./routes/admin');
const shopRoutes = require('./routes/shop');
const authRoutes = require('./routes/auth');
const attachUserInfo = require('./middleware/attachUserInfo');
const sessionProvider = require('./middleware/sessionHandler');
const dbAdapter = require('./database');

const port = 3000;
const app = express();
const uploadsPath = path.join(__dirname, 'w3s-dynamic-storage/uploads');

app.set('view engine', 'ejs');
app.set('views', 'views');

app.use(morgan('tiny'));
app.use(helmet.hidePoweredBy({ setTo: 'X-Frame-Options' }));
app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(uploadsPath));
app.use(sessionProvider);
app.use(flash());
app.use(favicon(path.join(__dirname, 'public', 'images', 'favicon.ico')));
app.use(attachUserInfo);

// App routes
app.use('/admin', adminRoutes);
app.use(shopRoutes);
app.use(authRoutes);

// Error handler
app.get('/500', errorController.get500);
app.use(errorController.get404);
app.use(errorController.get500);

dbAdapter.initialize()
  .then(() => {
    app.listen(port);
    console.log(`server listening at ${port}`)
  })
  .catch((err) => {
    console.log(err);
  });
