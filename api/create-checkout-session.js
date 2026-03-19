const Stripe = require('stripe');

const ALLOWED_ORIGINS = [
  'https://startus-management-system-iota.vercel.app',
  'https://startus-shop-six.vercel.app',
  'https://member-manager-nu.vercel.app',
];
const DEFAULT_ORIGIN = 'https://startus-management-system-iota.vercel.app';

function getAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  return DEFAULT_ORIGIN;
}

module.exports = async (req, res) => {
  // CORS - restrict to allowed origins
  const allowedOrigin = getAllowedOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe is not configured' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { orderId, orderNumber, items, totalAmount, buyerEmail } = req.body;

  if (!orderId || !items || !items.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'jpy',
        product_data: {
          name: `${item.productName} (${item.variantSize}${item.variantColor ? '/' + item.variantColor : ''})`,
        },
        unit_amount: item.unitPrice,
      },
      quantity: item.quantity,
    }));

    // Use validated origin to prevent open redirect
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      customer_email: buyerEmail || undefined,
      metadata: { orderId, orderNumber },
      success_url: `${allowedOrigin}/shop/#/confirmation/${orderNumber}?payment=success`,
      cancel_url: `${allowedOrigin}/shop/#/confirmation/${orderNumber}?payment=cancelled`,
    });

    res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe session error:', error);
    res.status(500).json({ error: 'Payment session creation failed' });
  }
};
