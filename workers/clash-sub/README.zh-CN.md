# 受保护的 Clash 订阅 Worker

[English](README.md)

这是一个可选的配套 Worker，用来为已经单独部署好的 EdgeTunnel 直接生成带密码
保护的 Mihomo/Clash YAML 和分享链接。它不依赖公共订阅转换站，也不包含项目维护者
或任何特定 Cloudflare 账户的默认配置。

## 准备信息

请先部署主 Worker，并准备：

- 主 Worker 的公开域名，不包含 `https://` 和路径。
- 主 Worker 使用的 `UUID` Secret。配套 Worker 中的 `CLOUDFLARE_UUID`
  必须与它完全相同。

需要使用 gRPC 节点时，建议给主 Worker 配置自定义域名，并在该 Zone 的
**Network** 设置中打开 gRPC。

## 第 1 步：创建不会进入 Git 的本地配置

复制仓库中的通用模板：

```bash
cp workers/clash-sub/wrangler.toml workers/clash-sub/wrangler.local.toml
# PowerShell：Copy-Item workers/clash-sub/wrangler.toml workers/clash-sub/wrangler.local.toml
```

只修改 `workers/clash-sub/wrangler.local.toml`：

```toml
name = "my-edgetunnel-clash-sub"

routes = [
    { pattern = "clash.example.com", custom_domain = true }
]

[vars]
CLOUDFLARE_HOST = "edgetunnel.example.com"
NODES_JSON = "[]"
```

把两个示例域名替换成你自己 Cloudflare 账户中的域名。`CLOUDFLARE_HOST`
是必填项，程序不会回退到项目维护者的域名。如果 Wrangler 无法自动选择正确账户，
也只能把 `account_id` 添加到这个已被 Git 忽略的本地文件中。

保持 `NODES_JSON = "[]"` 时，订阅里只包含本项目生成的 Cloudflare 节点。
不要把带账号密码的其他节点写进仓库中的 TOML 文件。

## 第 2 步：部署并设置 Secrets

首次部署配套 Worker：

```bash
npx wrangler deploy --config workers/clash-sub/wrangler.local.toml
```

如果需要，可在本机生成订阅 Token 和页面密码：

```bash
node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
```

通过交互方式保存三个 Cloudflare Secrets：

```bash
npx wrangler secret put SECRET_TOKEN --config workers/clash-sub/wrangler.local.toml
npx wrangler secret put PAGE_PASSWORD --config workers/clash-sub/wrangler.local.toml
npx wrangler secret put CLOUDFLARE_UUID --config workers/clash-sub/wrangler.local.toml
```

- `SECRET_TOKEN`：保护订阅 URL。
- `PAGE_PASSWORD`：保护订阅首页。
- `CLOUDFLARE_UUID`：必须与主 Worker 的 `UUID` 完全一致，并且必须是规范的
  RFC 4122 v4 UUID。

不要把 Secret 值直接写进命令行、配置文件、README 或 Git。

## 第 3 步：使用订阅

假设配套域名为 `clash.example.com`：

```text
订阅首页：https://clash.example.com/
Clash YAML：https://clash.example.com/sub/你的SECRET_TOKEN/clash.yaml
分享链接：https://clash.example.com/sub/你的SECRET_TOKEN/links.txt
```

生成的 Clash YAML 包含：

- VLESS：WebSocket、XHTTP `stream-one`、gRPC。
- Trojan：WebSocket、gRPC。
- Shadowsocks：`aes-128-gcm` + WebSocket。

`links.txt` 还会提供 Trojan XHTTP 分享链接；当前生成器不会把该组合写入
Mihomo YAML。

## 可选：加入其他节点

如果其他节点 JSON 中含有凭据，请从本地 TOML 删除 `NODES_JSON`，再将整个
JSON 数组保存为 Secret：

```bash
npx wrangler secret put NODES_JSON --config workers/clash-sub/wrangler.local.toml
```

程序会替换同名的 Cloudflare 托管节点，并拒绝重复名称。

## 使用扫描得到的 Cloudflare 优选 IP

导入订阅后，只修改本地节点的 `server` 字段。下面这些必须保持为主 Worker
域名或固定值：

- TLS `servername` 或 `sni`：主 Worker 域名。
- WebSocket `Host`：主 Worker 域名。
- XHTTP `host`：主 Worker 域名。
- Shadowsocks 插件 `host`：主 Worker 域名。
- 路径：`/tunnel`。
- gRPC service name：`tunnel`。
- 端口：`443`，并保持证书验证开启。

客户端刷新订阅后可能覆盖手动修改。需要长期固定优选 IP 时，请使用客户端的
本地覆写功能。

## 开源发布前检查

- 仓库中只提交通用的 `wrangler.toml` 模板。
- 所有 `wrangler.local.toml` 都必须保持未跟踪状态。
- UUID、密码、订阅 Token 和带凭据的节点 JSON 只能使用 Cloudflare Secrets。
- 示例、Issue 和日志中不要公开 Cloudflare Account ID、KV ID、私人域名或真实订阅 URL。
