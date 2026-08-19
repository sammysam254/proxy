// Supabase Edge Function: create-crypto-invoice
// Creates a NOWPayments crypto payment invoice

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  const { orderId, amountUsd } = await req.json();
  const NOWPAYMENTS_API_KEY = Deno.env.get('NOWPAYMENTS_API_KEY')!;

  if (!NOWPAYMENTS_API_KEY) {
    return new Response(JSON.stringify({ error: 'Crypto payments not configured.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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
        success_url:     `${Deno.env.get('SITE_URL') || 'https://proxyke.netlify.app'}/dashboard?payment=success`,
        cancel_url:      `${Deno.env.get('SITE_URL') || 'https://proxyke.netlify.app'}/?payment=cancelled`,
        ipn_callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/crypto-webhook`,
      }),
    });

    const invoice = await res.json();

    if (!invoice.invoice_url) {
      throw new Error(invoice.message || 'Failed to create invoice');
    }

    return new Response(JSON.stringify({ payment_url: invoice.invoice_url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
