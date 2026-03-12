<!-- /var/www/worker-backend/docs/worker/email-worker-delivery.rules.md -->
# Email Worker Delivery 说明

## 分层落位

- 发送逻辑位于 modules(service) 层的 EmailDeliveryService，供 Usecase 调用。
- Worker adapter 仅做 job 输入输出适配，不直接触达发送实现。
- 外部系统由 Postfix 负责，模块仅调用 sendmail 命令交给系统处理。

## Postfix 转发与 465 说明

- sendmail 调用只负责把邮件交给本机 Postfix 队列，后续由 Postfix 负责转发。
- 465 转发配置在 Postfix 内部生效，不会被 sendmail 调用方式影响。
- 发件人改写依赖 Postfix sender 规则。

## 配置约定

- EMAIL_SEND_AS_USER：可选，用于以指定系统用户执行 sendmail。
