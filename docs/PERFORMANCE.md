# 引擎 0.4.1：安全加速与可复现测量（MCP 分支）

## 参考及迁移范围

参考用户指定的 [Jev Ultrafast performance.md](https://github.com/browser-use/jev-ultrafast/blob/452c1ad2dd628008f1d5608f28158d76e49e6cc0/docs/performance.md)，文档 blob `43f31cc5832054d59b0573e79b1be5a3023fdc31`。借鉴批量 DOM 观察、目标范围守卫、事件等待、独立结果核对、固定源代码和保留全部尝试的方法；未复制其代码，未接入 Jev、TypeSafe、Mercury 或额外云端 API。它的 Google Flights 成绩不是本插件成绩。

| 方法 | 本插件实现 | 保留的保护 |
| --- | --- | --- |
| 减少重复读取 | 同步扫描阶段 WeakMap 缓存标签／分区／经历锚点；radio 按 root 批量读取 | 首次 await 前清空缓存；写前重新读取 |
| 减少匹配遍历 | 每个计划建立语义标签／ID 索引；来源域、确认、冲突和分区过滤 | 不跨资料 revision 缓存，不改变歧义和日期规则 |
| 事件等待 | MutationObserver 只关注目标／菜单变化；40ms 候选稳定窗口、50ms 属性回退、有界超时和取消清理 | 仍需唯一关联选项，不等待全页静止，不自动重试不确定写入 |
| 目标上下文检查 | 节点、标签、分区、现有经历锚点、表单 action/method/target、控件类型和选项、当前 hit-test | 覆盖、移动、重命名、遮挡和导航会跳过；无关动画允许继续 |
| 调度 | 原生批量输入每 8 项或 8ms 让出事件循环；复杂控件仍逐步执行 | 保留 500ms 最终延迟回读，未用删减验证换速度 |
| 可观察性 | 固定白名单数值：扫描、匹配、填写／回读、等待、查询及计数 | 不记录 URL、字段标签、值、口令或 token；无遥测上传 |

## 固定基线与独立验收

基线为上次完整 0.4.0 交付，不是功能更少的远程 0.3.1。原始引擎与计划器按字节冻结在 `tests/baseline/0.4.0/`，基线 ZIP 与源文件哈希均可追踪。候选是本次独立引擎 build 0.4.1。扩展与旧桥接协议版本保持 0.3.1，完整工作台没有进入本分支。测试驱动及两臂运行时 SHA-256 存在每份 JSON。

同一 Python 3.13.5、Playwright 1.57.0、Chromium 144.0.7559.96、1120×780 视区。每种夹具 6 对交替 A/B、B/A，分别启动进程运行三组，合计 36 次。两臂使用相同虚构表单、同一 DOM 调用计数包装和独立检查器；没有模型调用、真实求职资料或外网请求。

计时是单次页面 evaluate 中的“扫描 + 匹配 + 执行”，包括控件加载、调度和最后 500ms 回读；浏览器／页面创建、夹具初始化在计时外。返回后另等 100ms，再直接读取真实 DOM 值，检查全部预期值、密码和同意控件未改、没有提交；独立核对在计时外，不使用引擎自报成功作为唯一依据。

这不是安装后 MV3、网络延迟、模型任务、招聘官网或服务器保存 benchmark。每类只有 6 对，本地机器与夹具设计影响结果；p95 仅为这小样本的描述量，不作广泛统计推断。

## 最终配对结果

| 虚构表单 | 基线中位 | 候选中位 | 中位减少 | 两臂独立通过 |
| --- | ---: | ---: | ---: | --- |
| 160 个原生文字字段 | 1618.60 ms | 699.85 ms | 56.8% | 6/6 + 6/6 |
| 8 个异步下拉，含无关时钟更新 | 1947.30 ms | 1572.20 ms | 19.3% | 6/6 + 6/6 |
| 48 个 Shadow DOM 经历字段 | 707.40 ms | 540.75 ms | 23.6% | 6/6 + 6/6 |

原始记录：[原生](benchmarks/final-native.csv)、[异步下拉](benchmarks/final-combobox.csv)、[Shadow DOM](benchmarks/final-shadow.csv)。CSV 按嵌套字段无损展开每次尝试，单元格为 JSON 标量（空单元格表示原字段不存在）。[metadata.json](benchmarks/metadata.json) 保留环境、原始 JSON 哈希、源文件哈希、统计和中断状态；`python scripts/read-benchmark-records.py final-native` 可重建原报告对象。已逐份做结构相等检查，74 次开发／中断／最终尝试没有过滤、取整或丢字段。完整原始 JSON 亦保留在本轮交付验证包，CI 另上传它自身运行的原始 JSON。

原生表单的 scan 中位 381.75 → 15.30ms，match 18.25 → 3.80ms，apply 1218.10 → 680.95ms；querySelectorAll 中位调用 82572 → 3850。新增 hit-test 带来更多 layoutReads，是为了加强目标保护，不应只报告降低的指标。8 下拉的 matcher 中位 1.30 → 1.40ms，并非每个阶段都变快。吞吐不能通过错误填写、省略回读或漏掉不支持字段换取。

## 回归与失败尝试

本轮实际同步分支 Node 34 项、原 DOM 25 项、新 DOM 守卫 16 项分开验证。Node 的 Chrome API 有模拟；DOM 测试使用真实 Chromium 与真实 engine。安装后的权限、服务工作进程实际生命周期和真实招聘站点仍需额外验收。

新增用例覆盖遮挡、改表单用途、原经历值被改、选项同值改名、单选成员变化、无关动画、延迟菜单、仅 CSSOM 改动、控件替换、取消／超时观察器清理、重复候选、首次动态关联菜单、不确定写入停止。匹配索引与旧过滤函数做 120 轮 × 30 字段等价检查。

保留 [18 次开发诊断](benchmarks/matched-development.csv)，不混入最终比较。随后一次整批 6 对测试被执行器中止，已写出的 20 次尝试全部验证通过，但批次没有完成；[中断记录](benchmarks/development-interrupted.csv) 明确标注 incomplete，不算作最终 36 次，也没有隐藏为失败率零的完整批次。最终改为按夹具分开运行，运行时代码未因中断改变。

完整工作台的本地开发中，UI 首轮 8/10，补齐测试 harness 的模块打包后复测 10/10；但该工作台所需加密资料修改的同步被拦截，所以这些 UI 用例不作为本分支已交付能力。旧安装后环境受管理策略限制，本轮未绕过策略或把模拟接口当成权限实测。

## 复现

```bash
npm test
npm run check
python -m pip install -r requirements-test.txt
python -m playwright install chromium
npm run test:dom
npm run test:guards
npm run bench -- --pairs 6 --fixture large-native-160 --output test-results/native.json
npm run bench -- --pairs 6 --fixture async-combobox-8 --output test-results/combobox.json
npm run bench -- --pairs 6 --fixture shadow-records-48 --output test-results/shadow.json
```

CI 以每类 3 对执行缩短版 matched benchmark；本报告记录的是本机每类 6 对，不将两者混淆。CI 不设机器依赖的毫秒红线，以独立正确性与完整尝试为门槛；输出原始 JSON 供回归比较。

## 仍未覆盖

完整 accessible-name 算法、跨域 iframe、闭合 Shadow DOM、虚拟列表、所有厂商新增行、复杂地区级联、长距离日历翻页、PDF／Word 自动解析和附件服务器回执仍非本次交付内容。没有真实塔塔对照，也不承诺所有网申表单无条件成功。本分支没有接入完整加密工作台；旧 MCP 明文文件和用户授权发送到 Codex／网站的数据边界保持不变。

机制文档：[Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting)、[MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)。官方 API 说明不替代本插件自身的安全审计。


## 同步范围

仅非加密资料库改动进入本轮：引擎、匹配索引、数值指标、bridge 兼容导出、测试、冻结基线和文档／CI。`extension/core/profile.mjs`、`vault.mjs`、`vault-session.mjs` 保持此前远程内容，完整工作台、资料版本控制器和本地模式消息改造未同步。先前本地 4→2 的扫描调用优化属于未同步工作台，不能列为当前 MCP 分支收益。
