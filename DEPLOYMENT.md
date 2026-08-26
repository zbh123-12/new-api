# new-api 部署文档（MiniMax-only 精简版）

## 现状

- **应用**: [new-api](https://github.com/QuantumNous/new-api) v1.0.0-rc.25
- **部署方式**: Docker Compose（3 容器）
- **访问地址**: http://localhost:3000
- **管理员账号**: root / 12345678（**首次部署默认值，强烈建议改**）
- **上游渠道**: MiniMax（id=2, name=`minimax-main`），模型: `MiniMax-M2.7`, `MiniMax-M2.5-highspeed`, `MiniMax-M2.5`, `MiniMax-M2`, `MiniMax-M2.1`

## 容器栈

| 服务 | 镜像 | 端口 | 数据卷 |
|---|---|---|---|
| new-api | `calciumion/new-api:latest` | 3000:3000 | `./data`、`./logs` |
| postgres | `postgres:15` | 5432（内部） | `pg_data` |
| redis | `redis:latest` | 6379（内部） | 无（无持久化） |

**所有密码已替换为强随机串**（不在 git 里），存于 `docker-compose.yml`。

## 日常操作

```powershell
cd C:\Users\93630\Documents\ChatGPT\new-api
$env:DOCKER_HOST = 'tcp://localhost:2375'   # Codex 沙箱可用；你自己 PowerShell 可省

docker compose ps           # 看容器状态
docker compose logs -f new-api   # 看日志（Ctrl+C 退出）
docker compose restart new-api  # 重启 new-api（密码等环境变量不变）
docker compose up -d --force-recreate  # 改完 docker-compose.yml 后重建
docker compose pull && docker compose up -d --force-recreate  # 升级镜像
docker compose down         # 停止（数据保留）
docker compose down -v       # 停止 + 删数据卷（**危险**，丢所有数据）
```

## 安全建议（强烈推荐）

1. **改 root 管理员密码**: 登录后右上角 → 修改密码
2. **revoke 当前的 MiniMax API key**: 这把 key 在对话历史里已经暴露，去 MiniMax 控制台换新，然后用 `PUT /api/channel/2` 更新 key
3. **限制 Docker TCP 暴露**: `Settings → General` 关掉 "Expose daemon on tcp://localhost:2375 without TLS"（日常用不到）；或保持开启但确保 Windows 防火墙不开放 2375 给外部网络
4. **关闭 register_enabled**: 管理后台 → 系统设置 → `register_enabled: false`（默认 true，能被外部注册）
5. **备份数据**:
   ```powershell
   # 定期手动备份
   $date = Get-Date -Format 'yyyyMMdd-HHmmss'
   Compress-Archive -Path .\data -DestinationPath ".\backup-data-$date.zip"
   ```

## 故障排查

- **容器起不来**: `docker compose logs postgres` 看是不是磁盘满、密码错
- **新渠道不通**: `GET /api/channel/test/<id>` 看是不是 `401`(key 错)、`404`(模型名错)、`429`(限流)
- **忘记 admin 密码**: 直接进 PG 改哈希（hex 编码的 bcrypt）
- **WSL2 出问题**: `wsl --shutdown` + 重启 Docker Desktop

## Codex 沙箱访问 Docker 说明

此项目工作区配置了 Docker Desktop TCP 暴露（`tcp://localhost:2375`），Codex 沙箱账号通过 `DOCKER_HOST` 环境变量访问，绕过命名管道 ACL 限制。日常手动操作可省略该环境变量。

## 升级路径

```powershell
cd C:\Users\93630\Documents\ChatGPT\new-api
git pull                  # 拉取最新源码
docker compose pull       # 拉取最新镜像
docker compose up -d --force-recreate   # 重建并启动
docker compose logs -f new-api | Select-String 'ready|Error' --SimpleMatch
```

## 不在文档中的常用操作

- 加渠道: `POST /api/channel/`  body 格式见 `controller/channel.go:AddChannelRequest`
- 改渠道: `PUT /api/channel/`
- 删渠道: `DELETE /api/channel/{id}`
- 测所有渠道: `GET /api/channel/test`
- 拉模型列表: `GET /api/channel/models` / `GET /api/channel/fetch_models/{id}`
