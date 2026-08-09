# Protected Clash subscription Worker

[简体中文](README.zh-CN.md)

This optional companion Worker generates password-protected Mihomo/Clash YAML
and share links for a separately deployed EdgeTunnel Worker. It does not use a
public subscription converter and contains no account-specific defaults.

## Before you begin

Deploy the main Worker first and record:

- Its public hostname, without `https://` or a path.
- Its `UUID` secret. The same value must be stored here as
  `CLOUDFLARE_UUID`.

Use a custom domain when you need Cloudflare gRPC. Enable gRPC in the zone's
**Network** settings before using the generated gRPC nodes.

## 1. Create a private Wrangler configuration

Copy the tracked template to the ignored local filename:

```bash
cp workers/clash-sub/wrangler.toml workers/clash-sub/wrangler.local.toml
# PowerShell: Copy-Item workers/clash-sub/wrangler.toml workers/clash-sub/wrangler.local.toml
```

Edit only `workers/clash-sub/wrangler.local.toml`:

```toml
name = "my-edgetunnel-clash-sub"

routes = [
    { pattern = "clash.example.com", custom_domain = true }
]

[vars]
CLOUDFLARE_HOST = "edgetunnel.example.com"
NODES_JSON = "[]"
```

Replace both example hostnames with domains in your own Cloudflare account.
`CLOUDFLARE_HOST` is required and has no personal or project-owner fallback.
If Wrangler cannot infer the desired account, add `account_id` only to this
ignored local file.

Keeping `NODES_JSON = "[]"` produces a subscription containing only this
project's Cloudflare nodes. Do not put credential-bearing custom nodes in a
tracked TOML file.

## 2. Deploy and configure secrets

Deploy the companion Worker:

```bash
npx wrangler deploy --config workers/clash-sub/wrangler.local.toml
```

Generate a random subscription token and page password locally if needed:

```bash
node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
```

Store all three values interactively as Cloudflare Secrets:

```bash
npx wrangler secret put SECRET_TOKEN --config workers/clash-sub/wrangler.local.toml
npx wrangler secret put PAGE_PASSWORD --config workers/clash-sub/wrangler.local.toml
npx wrangler secret put CLOUDFLARE_UUID --config workers/clash-sub/wrangler.local.toml
```

- `SECRET_TOKEN` protects the subscription URL.
- `PAGE_PASSWORD` protects the landing page.
- `CLOUDFLARE_UUID` must exactly match the main Worker's `UUID` and must be a
  canonical RFC 4122 version-4 UUID.

Never pass the secret values on the command line and never place them in Git.

## 3. Use the subscription

For a companion domain such as `clash.example.com`:

```text
Landing page: https://clash.example.com/
Clash YAML:   https://clash.example.com/sub/YOUR_SECRET_TOKEN/clash.yaml
Share links:  https://clash.example.com/sub/YOUR_SECRET_TOKEN/links.txt
```

The generated Clash YAML contains:

- VLESS over WebSocket, XHTTP `stream-one`, and gRPC.
- Trojan over WebSocket and gRPC.
- Shadowsocks `aes-128-gcm` over WebSocket.

Trojan XHTTP is included in `links.txt` but omitted from the Mihomo YAML because
that client transport combination is not emitted by this generator.

## Optional custom nodes

To include additional nodes that contain credentials, remove `NODES_JSON` from
the local TOML file and store the JSON array as a secret instead:

```bash
npx wrangler secret put NODES_JSON --config workers/clash-sub/wrangler.local.toml
```

Managed Cloudflare node names are replaced by freshly generated entries, and
duplicate names are rejected.

## Using a scanned Cloudflare edge IP

After importing the subscription, change only the local node's `server` field
to the selected Cloudflare IP. Keep these values unchanged:

- TLS `servername` or `sni`: your tunnel hostname.
- WebSocket `Host`: your tunnel hostname.
- XHTTP `host`: your tunnel hostname.
- Shadowsocks plugin `host`: your tunnel hostname.
- Path: `/tunnel`.
- gRPC service name: `tunnel`.
- Port: `443` and certificate verification enabled.

A later subscription refresh may overwrite local changes. Use the client's
override feature when the selected IP should persist.

## Publication safety

- Commit only the generic `wrangler.toml` template.
- Keep every `wrangler.local.toml` file untracked.
- Store UUIDs, passwords, subscription tokens, and credential-bearing node JSON
  as Cloudflare Secrets.
- Do not publish Cloudflare account IDs, KV namespace IDs, private domains, or
  generated subscription URLs in examples, issues, or logs.
