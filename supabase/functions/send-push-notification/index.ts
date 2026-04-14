const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---- Web Push implementation using Web Crypto API ----

function base64UrlDecode(str: string): Uint8Array {
  const padding = '='.repeat((4 - str.length % 4) % 4);
  const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concatBuffers(...buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((s, b) => s + b.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) { result.set(b, offset); offset += b.length; }
  return result;
}

async function createVapidJwt(audience: string, subject: string, publicKey: string, privateKeyBytes: Uint8Array): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };

  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key as ECDSA P-256
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(base64UrlDecode(publicKey).slice(1, 33)),
    y: base64UrlEncode(base64UrlDecode(publicKey).slice(33, 65)),
    d: base64UrlEncode(privateKeyBytes),
  };

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsignedToken));

  return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

async function encryptPayload(
  payload: Uint8Array,
  subscriptionPubKey: Uint8Array,
  authSecret: Uint8Array
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; localPublicKey: Uint8Array }> {
  // Generate local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKeyPair.publicKey));

  // Import subscription public key
  const subPubKey = await crypto.subtle.importKey('raw', subscriptionPubKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);

  // ECDH shared secret
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: subPubKey }, localKeyPair.privateKey, 256));

  const enc = new TextEncoder();

  // HKDF for auth info
  const authInfo = concatBuffers(enc.encode('WebPush: info\0'), subscriptionPubKey, localPublicKeyRaw);
  const prkKey = await crypto.subtle.importKey('raw', authSecret, { name: 'HKDF' }, false, ['deriveBits']);
  // IKM = HKDF(auth_secret, shared_secret, auth_info, 32)
  // Actually: PRK = HMAC-SHA256(auth, ecdh_secret), then derive IKM
  const prkMaterial = await crypto.subtle.importKey('raw', sharedSecret, { name: 'HKDF' }, false, ['deriveBits']);
  
  // Step 1: ikm = HKDF-Extract(auth_secret, ecdh_secret)  
  // Step 2: prk = HKDF(ikm, salt=auth, info=authInfo, 32)
  const ikmKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveBits']);
  const ikm = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: authInfo },
    ikmKey, 256
  ));

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive content encryption key and nonce
  const prkKeyFinal = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const cekBytes = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: aes128gcm\0') },
    prkKeyFinal, 128
  ));
  const nonceBytes = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: nonce\0') },
    prkKeyFinal, 96
  ));

  // Encrypt with AES-128-GCM
  const cek = await crypto.subtle.importKey('raw', cekBytes, 'AES-GCM', false, ['encrypt']);
  
  // Add padding delimiter
  const paddedPayload = concatBuffers(payload, new Uint8Array([2])); // delimiter byte

  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonceBytes },
    cek,
    paddedPayload
  ));

  // Build aes128gcm body: salt(16) + rs(4) + idlen(1) + keyid(65) + encrypted
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const idlen = new Uint8Array([65]);
  
  const ciphertext = concatBuffers(salt, rs, idlen, localPublicKeyRaw, encrypted);

  return { ciphertext, salt, localPublicKey: localPublicKeyRaw };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { subscription, title, body, data } = await req.json();

    if (!subscription || !title) {
      return new Response(
        JSON.stringify({ error: "subscription and title are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@fitagenda.app";

    const endpoint: string = subscription.endpoint;
    const audience = new URL(endpoint).origin;

    // Create VAPID JWT
    const jwt = await createVapidJwt(audience, vapidSubject, vapidPublicKey, base64UrlDecode(vapidPrivateKey));
    
    // Encrypt payload
    const payload = JSON.stringify({ title, body, data });
    const p256dh = base64UrlDecode(subscription.keys.p256dh);
    const auth = base64UrlDecode(subscription.keys.auth);
    
    const { ciphertext } = await encryptPayload(new TextEncoder().encode(payload), p256dh, auth);

    // Send to push service
    const pushResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `vapid t=${jwt}, k=${vapidPublicKey}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "TTL": "3600",
      },
      body: ciphertext,
    });

    if (!pushResponse.ok) {
      const errText = await pushResponse.text();
      console.error("Push service error:", pushResponse.status, errText);
      return new Response(
        JSON.stringify({ error: "Push service error", status: pushResponse.status, details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await pushResponse.text();

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-push-notification error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
