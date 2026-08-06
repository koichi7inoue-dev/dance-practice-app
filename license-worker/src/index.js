const STRIPE_API = 'https://api.stripe.com/v1';

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(env, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

async function stripeGet(env, path) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

async function handleVerify(env, url) {
  const sessionId = url.searchParams.get('session_id');
  if (!sessionId) return json(env, 400, { ok: false, error: 'session_id is required' });

  const { ok, data } = await stripeGet(env, `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (!ok) return json(env, 400, { ok: false, error: 'session not found' });

  const isPaid = data.payment_status === 'paid';
  const isProLink = data.payment_link === env.PRO_PAYMENT_LINK_ID;
  if (!isPaid || !isProLink) return json(env, 200, { ok: false, error: 'payment not verified' });

  return json(env, 200, { ok: true, email: data.customer_details?.email || null });
}

async function handleRestore(env, url) {
  const email = url.searchParams.get('email');
  if (!email) return json(env, 400, { ok: false, error: 'email is required' });

  const { ok, data } = await stripeGet(
    env,
    `/checkout/sessions?payment_link=${encodeURIComponent(env.PRO_PAYMENT_LINK_ID)}&limit=100`
  );
  if (!ok) return json(env, 400, { ok: false, error: 'lookup failed' });

  const match = (data.data || []).find(
    (session) =>
      session.payment_status === 'paid' &&
      session.customer_details?.email?.toLowerCase() === email.toLowerCase()
  );
  if (!match) return json(env, 200, { ok: false, error: 'no matching purchase found' });

  return json(env, 200, { ok: true, email: match.customer_details.email });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }
    if (request.method !== 'GET') {
      return json(env, 405, { ok: false, error: 'method not allowed' });
    }

    if (url.pathname === '/verify') return handleVerify(env, url);
    if (url.pathname === '/restore') return handleRestore(env, url);

    return json(env, 404, { ok: false, error: 'not found' });
  },
};
