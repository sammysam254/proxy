// Supabase Edge Function: create-crypto-invoice
// Creates a NOWPayments crypto payment invoice

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const { orderId, amountUsd } = await req.json();
  const NOWPAYMENTS_API_KEY = Deno.env.get('NOWPAYMENTS_API_KEY')!;

  if (!NOWPAYMENTS_API_KEY) {
    return new Response(JSON.stringify({ error: 'Crypto payments not configured.' }), { status: 500 });
  }

  try {
    const res = await fetch('https://api.nowpayments.io/v1/invoice', {
      method:  'POST',
      headers: {
        'x-api-key':    NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount:    parseFloat(amountUsd),
        price_currency:  'usd',
        pay_currency:    'usdttrc20',    // USDT on Tron (low fees)
        order_id:        orderId,
        order_description: `ProxiCell Proxy Plan`,
        success_url:     `${Deno.env.get('SITE_URL')}/dashboard?payment=success`,
        cancel_url:      `${Deno.env.get('SITE_URL')}/?payment=cancelled`,
        ipn_callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/crypto-webhook`,
      }),
    });

    const invoice = await res.json();

    if (!invoice.invoice_url) {
      throw new Error(invoice.message || 'Failed to create invoice');
    }

    return new Response(JSON.stringify({
      payment_url: invoice.invoice_url,
      payment_id:  invoice.id,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
