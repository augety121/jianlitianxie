# 0.7.1 本地候选交付与验证

日期：2026-09-27。本报告描述会话实际工作目录及其打包，不是GitHub已发布新运行代码的声明。

## 版本与远端范围

核对GitHub main为a2a7df83c4bbda1c575d8bfdf9086145c9a3a4c8，运行代码0.6.0。上一轮0.7.0只交付本地候选，本轮在其上新增日志与版本检查成为0.7.1。新诊断源码首次远端写入被安全检查拦截，没有通过其他工具重传。

GitHub PR #6（https://github.com/augety121/jianlitianxie/pull/6），提交ff5049b7ed2c4d7efceff8c3aff3c27a41b9457a，仅含README、诊断候选说明、竞品核对记录、Issue模板共4个文件。未合并main。其任何CI只能验证旧0.6.0，不用于证明本候选。

本地候选文件均按0.7.1发布；源代码不是GitHub Actions产物，不包含真实用户信息或私有目录。原DOCX/方案/复制代码保持本地候选边界，没有因为日志任务绕过之前上传拦截。

## 新增日志与质量改动

核心位于extension/core/diagnostics.mjs、diagnostic-hooks.mjs。实际接线在background.js与旧独立panel.js，早期固定类别异常采集在diagnostic-client.js。诊断页面为diagnostics.html/css/js，并在工作台/旧面板提供入口。不是只测试未调用的日志类。

默认关闭；30分钟录制；按操作、异常筛选；时间线与固定原因码；字段编号与工作台当前扫描对应；预览导出/按次导出；清空及迟到写入保护。存储和导出均白名单重建，日志不含个人内容/URL/标签/原始报错。活动元数据不额外加密，仍需本人预览。

后台日志写入不阻塞业务调用；待写批次有界32个，超过预算可能丢失，停止后不补录。每批最多400字段详情、整体600事件，省略显式标记。源代码及导出版本可核对；发布检查拒绝README/工作台/package/manifest产品版本不一致。旧MCP面板诊断IPC有250毫秒等待上限。

## 本机实际执行的分层测试

环境：Node22.16.0，Chromium144.0.7559.96；虚构资料，不登录真实招聘平台，不提交申请。

| 测试 | 实际结果 | 范围 |
| --- | --- | --- |
| npm test | 146/146通过 | 含原120项、新日志与生产接线、额外旧面板超时/类别隐私测试 |
| test:dom | 25/25通过 | 真DOM/事件与引擎，非已安装扩展 |
| test:guards | 16/16通过 | 真DOM目标守卫 |
| entity-binding-browser.py | 4/4通过 | 真DOM经历绑定/重排/替换 |
| test:compatibility | 15/15通过 | 真DOM控件，不是15个官网 |
| test:ui | 10/10通过 | 旧面板界面，Chrome/桥接执行接口模拟 |
| test:workspace | 14/14通过 | 实际UI及Node资料库，Chrome/目标页面接口模拟 |
| test:imports | 9/9通过 | 实际本地DOCX/XML提取及UI，Chrome/剪贴板接口模拟 |
| test:diagnostics | 6/6通过 | 实际UI及Node日志模块，Chrome消息模拟 |
| test:mv3本机尝试 | 未完成，不计通过 | 等待service worker15秒超时，0个场景通过 |

新日志测试验证默认不开启、双重过滤、未知字段丢弃、24小时读取淘汰、容量优先保留异常、并发写入、清空不复活旧事件、重建后台、可信页面身份、生产消息链路、存储失败不影响调用、不因日志挂起延迟停止、旧面板可选IPC超时及异常内容不外传。

## 保留的失败与修复记录

诊断UI初次5/6：测试把隐藏在折叠details中的导出JSON用inner_text读取，错误认为缺失；改为text_content读取预览实际DOM文本，保留过滤隐私断言，复测6/6。初次JSON保留在验证包development目录。

本机安装MV3无service worker，保留超时日志与unavailable报告；没有通过放宽CSP/系统策略消除失败，也未拿模拟UI当已安装测试。没有新版本远端验证。

## 交付范围

源码ZIP只包含维护源码、图标、文档、测试和工作流，不包含legacy、Git历史、node_modules、test-results、真实资料或浏览器用户目录。扩展ZIP为extension文件夹。独立验证ZIP收录本机输出、虚构截图、分层JSON、最终源码文件哈希及归档复核；不含测试密文备份或配对文件。

最终源码包将另行解压执行146项测试和发布检查，结果存于验证包packaged目录；包内说明不用于替代该实际输出。逐字节比对和包哈希由验证manifest给出。

## 竞品与局限

官方Tata Chrome商店条目ldohbgcnonoffldimgdngkojkejibina抓取时显示0.8.2、2026-09-03更新和应用内购；没有会员登录/支付测试或准确实时价格。见COMPETITOR-CHECK-2026-09-27.md。没有复制付费代码或宣布超过竞品。

没有新底层控件覆盖率、实站全兼容或提速百分比。复杂iframe/级联/虚拟控件仍须逐类验收；日志只能留下受限线索，不能单独证明每个根因、网站已保存或提交成功。loopback HTTP不是TLS，库加密不能防止已受控系统或浏览器读取解锁/已填写内容。
