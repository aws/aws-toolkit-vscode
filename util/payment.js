const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const processCheckout = (products, req) => {
  return stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: products.map((p) => {
      return {
        price_data: {
          unit_amount: Math.round(p.productId.price * 100),
          currency: 'usd',
          product_data: {
            name: p.productId.title,
            description: p.productId.description,
          },
        },
        quantity: p.quantity,
      };
    }),
    success_url: `${process.env.DOMAIN}/checkout/success`,
    cancel_url: `${process.env.DOMAIN}/checkout/cancel`,
  });
};

module.exports = {
  processCheckout,
};
