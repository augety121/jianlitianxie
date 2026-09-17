# 参考与取舍

2026-09-17 检查了用户上传的 autumn-job-assistant-tracker-main.zip。原版提供侧栏、资料编辑、投递看板和离线 OCR，但自动填表能力不完整、带默认示例资料、申请广泛站点权限。原包保留在本机 legacy/（Git 忽略），发布包不复制其代码、OCR模型或图标。新扩展自主实现扫描、映射、审批、填写与记录。旧版 OCR 暂未迁移。

- 塔塔网申 https://www.tatawangshen.com/ ：参考多份简历、信息复用与投递流程，不调用它的服务，不复制代码、不沿用速度宣传。
- https://github.com/LKRCharon/local-resume-autofill ：参考本地优先、声明式映射、资料与 MCP 分离。
- https://github.com/KyleMoore1/grepjob-bot ：参考扩展和本地 MCP 桥接的职责拆分。
- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab ：用户手势授权当前标签页。
- https://developers.openai.com/codex/mcp ：Codex stdio MCP 配置。

没有引入上述项目的源代码或依赖。MIT 许可仅覆盖本仓库作者拥有的代码。

2026-09-17只读检查了用户指定的Edge塔塔0.8.2安装目录，查看manifest与content.js中控件处理结构。观察到全站content script、选择器/日期面板/事件派发/上传处理等不同路径，以及远端resume接口。新实现参考分类型适配思路，未复制其实现、图标、密钥、压缩包或商业资源到仓库。
