---
title: "Verifying signatures"
description: "Prove that a webhook came from Pletopay and hasn't been changed or replayed."
---

Anyone can send a request to your webhook URL. Before you trust one, check its `X-PletoPay-Signature` header using your endpoint's signing secret (`whsec_…`).

## How the signature works

```text title=X-PletoPay-Signature
t=1727200000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

- `t` is when Pletopay signed the delivery, in Unix seconds.
- `v1` is the hex-encoded **HMAC-SHA256** of the string `<t>.<raw request body>`, keyed with your endpoint secret.

To verify:

1. Split the header on `,` and take `t` and `v1`.
2. Reject the request if `t` is more than **5 minutes** from your current time. This blocks replays of old deliveries.
3. Compute HMAC-SHA256 of `t + "." + rawBody` with your secret.
4. Compare it with `v1` in **constant time**.

> [!WARNING]
> Sign-check the **raw body exactly as received**, before any JSON parsing. Re-serialising parsed JSON changes whitespace and key order, and the signature won't match.

## Code

```javascript tab=Node.js
import crypto from 'node:crypto';

export function verifyPletopaySignature(secret, header, rawBody, toleranceSeconds = 300) {
  // t=<unix seconds>,v1=<hex>[,v1=<hex>]  (two v1 values while a secret is being rotated)
  let t;
  const given = [];
  for (const part of String(header).split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') t = /^\d{1,16}$/.test(value) ? Number(value) : NaN;
    else if (key === 'v1' && /^[0-9a-fA-F]{64}$/.test(value)) given.push(Buffer.from(value, 'hex'));
  }
  if (!Number.isFinite(t) || given.length === 0) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  return given.some((g) => crypto.timingSafeEqual(g, expected));
}
```

```python tab=Python
import hashlib
import hmac
import time


def verify_pletopay_signature(secret: str, header: str, raw_body: bytes, tolerance: int = 300) -> bool:
    # t=<unix seconds>,v1=<hex>[,v1=<hex>]  (two v1 values while a secret is being rotated)
    t = None
    given = []
    for part in header.split(","):
        key, sep, value = part.partition("=")
        if not sep:
            continue
        key, value = key.strip(), value.strip()
        if key == "t":
            t = int(value) if value.isdigit() else None
        elif key == "v1" and len(value) == 64 and all(c in "0123456789abcdefABCDEF" for c in value):
            given.append(value.lower())
    if t is None or not given or abs(int(time.time()) - t) > tolerance:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, g) for g in given)
```

```php tab=PHP
<?php
function pletopay_verify_signature(string $secret, string $header, string $rawBody, int $tolerance = 300): bool
{
    parse_str(str_replace(',', '&', $header), $parts);
    $t = (int) ($parts['t'] ?? 0);
    if (!$t || empty($parts['v1']) || abs(time() - $t) > $tolerance) {
        return false;
    }
    $expected = hash_hmac('sha256', $t . '.' . $rawBody, $secret);
    return hash_equals($expected, $parts['v1']);
}

// $rawBody = file_get_contents('php://input');
// $header  = $_SERVER['HTTP_X_PLETOPAY_SIGNATURE'] ?? '';
```

```go tab=Go
package webhooks

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"math"
	"strconv"
	"strings"
	"time"
)

func VerifyPletopaySignature(secret, header string, rawBody []byte, tolerance time.Duration) bool {
	var t int64
	var v1 string
	for _, kv := range strings.Split(header, ",") {
		k, v, _ := strings.Cut(kv, "=")
		switch k {
		case "t":
			t, _ = strconv.ParseInt(v, 10, 64)
		case "v1":
			v1 = v
		}
	}
	if t == 0 || v1 == "" || math.Abs(float64(time.Now().Unix()-t)) > tolerance.Seconds() {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strconv.FormatInt(t, 10) + "."))
	mac.Write(rawBody)
	given, err := hex.DecodeString(v1)
	return err == nil && hmac.Equal(given, mac.Sum(nil))
}
```

## Testing your verification with cURL

Sign a payload yourself with `openssl` and send it to your local endpoint. If your handler accepts this and rejects the same request with one character of the body changed, verification works:

```bash title=Terminal
SECRET="whsec_your_endpoint_secret"
BODY='{"id":"evt_test","object":"event","type":"webhook.test","data":{"object":{}}}'
T=$(date +%s)
SIG=$(printf '%s.%s' "$T" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')

curl -X POST http://localhost:3000/webhooks/pletopay \
  -H "Content-Type: application/json" \
  -H "X-PletoPay-Signature: t=$T,v1=$SIG" \
  -d "$BODY"
```

Then [send a real test event](/reference/test-webhook-endpoint) from Pletopay to your deployed endpoint.

## Rotating the secret

[Rotating](/reference/rotate-webhook-secret) replaces the secret immediately: deliveries are signed with the new one from then on. Update your server's secret as part of the same change.
