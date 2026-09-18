# 0.4.3 隐私边界与安全模型

这是实现说明，不是安全认证或“绝不会被截取”的保证。

## 数据边界

本地库使用现有 Web Crypto AES-256-GCM 与 PBKDF2-SHA-256（600000次迭代、独立随机salt和IV），保存认证密文。密钥不可导出且不写入 local/sync/session；后台进程被回收会失去解锁状态。JavaScript 运行时不能承诺可靠清零所有内存、系统交换文件或崩溃转储。

local 与 session 存储限制为 TRUSTED_CONTEXTS，并在操作前等待初始化。资料读写路由只接受扩展自身工作台、顶层且活动的发送文档；比较协议、主机、路径及扩展ID，而不是可能为null的origin。没有对外网页消息入口。字段文本以textContent渲染，不当HTML或脚本执行。

本地模式不调用MCP桥接或模型。只在一次明确授权后下发所选字段值；未选字段值不随“skipped”状态泄露到页面。资料revision、计划ID、来源、Chrome documentId和已授权标签页绑定；异步检查期间停止后不会继续启动写入。

临时MCP请求只包含本人选择的事实与允许的页面结构字段；已有值替换为未共享占位，去除anchors、control及未列入白名单的元数据。字段标签/下拉选项本身仍可能包含网站提供的个人信息，因此仍属用户授权的上下文，不宣称完全匿名。

桥接临时会话5分钟到期，重扫不延长；取消nonce拒绝重复授权与先撤销后到达的请求。临时模式不读取旧证据、不写旧profile/experience/audit。到期/撤销清理资料和计划值；执行中的收据ID与锁保留到执行器回报，避免重复写入。客户端在服务器批准期限到达时请求取消；挂起、进程被杀或消息丢失时不保证即时取消已在进行的输入。

## 不能混为一谈的保护

| 风险 | 实现防护 | 剩余限制 |
| --- | --- | --- |
| 普通网页索取完整简历 | 可信工作台消息边界、storage访问限制、最小字段下发 | 不抵御浏览器渲染进程/扩展本身被攻陷 |
| 错标签页/过期计划/重新排序 | Chrome文档身份、计划修订号、引擎现值和目标校验 | 不覆盖所有复杂组件或跨域框架 |
| 备份文件丢失 | 认证加密、独立长口令、错误口令拒绝覆盖 | 弱口令、已解锁设备和已导出的旧备份仍有风险 |
| 旧面板绕过本地选择 | 非MCP模式拒绝旧面板访问；取消自动连接 | 用户主动打开旧主档后，旧文件仍为明文 |
| 本机桥接冒用/网络窃听 | 固定127.0.0.1地址、Host/Origin校验、随机配对码、验证配对拒绝重定向 | loopback HTTP不是TLS；本机高权限进程可能观察内存/通信/配对文件 |
| 网站或模型保留数据 | 明确授权范围、有效期、撤销后拒绝新的读取 | 已进入网站或模型上下文的数据不能撤回 |

默认拒绝给外部明文HTTP网站填写；仅HTTPS与localhost演示允许。HTTPS只能保护到站传输，不能阻止招聘网站读取用户主动填写的值。本版本没有远端代理、遥测或新增第三方模型API。

原profile.json、evidence.json、以前日志与旧浏览器投递记录不会被自动加密/删除。迁移后自行妥善处置旧副本。公开源码、CI和截图只用虚构数据，模式检查仅发现已知隐私模式，不是完整DLP或独立渗透审计。

## 复现与审计入口

`tests/session.test.mjs`启动真实Node桥接验证临时授权、撤销、防重放、无磁盘落地及不回退；`tests/workspace.test.mjs`验证文档/模式边界、最小选择、取消竞态、范围限制和期限。浏览器DOM/UI与已安装MV3另分层运行。参见WORKSPACE-0.4.3.md。

机制参考：[Chrome messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)、[Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage)、[Playwright扩展测试](https://playwright.dev/python/docs/chrome-extensions)。官方机制说明不能替代本扩展自身安全评审。
