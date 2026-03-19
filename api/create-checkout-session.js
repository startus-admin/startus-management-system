const Stripe = require('stripe');

const ALLOWED_ORIGINS = [
  'https://startus-management-system-iota.vercel.app',
  'https://startus-shop-six.vercel.app',
  'https://attendance-app-alpha-kohl.vercel.app',
];

module.exports = async (req, res) => {
  // CORS — whitelist only known origins
  const reqOrigin = req.headers.origin;
  const allowedOrigin = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    const rawOrigin = req.headers.origin || req.headers.referer?.replace(/\/+$/, '');
    const origin = ALLOWED_ORIGINS.includes(rawOrigin) ? rawOrigin : ALLOWED_ORIGINS[0];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      customer_email: buyerEmail || undefined,
      metadata: { orderId, orderNumber },
      success_url: `${origin}/shop/#/confirmation/${orderNumber}?payment=success`,
      cancel_url: `${origin}/shop/#/confirmation/${orderNumber}?payment=cancelled`,
    });

    res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
};
