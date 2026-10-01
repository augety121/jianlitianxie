# 实际源码复用清单

## TshyGO / resume-form-assistant-plugin

- Repository: https://github.com/TshyGO/resume-form-assistant-plugin
- Commit: `386660cc736e78e4d39f73ff49f77590e5788440`
- File: `form-agent.js`
- Git blob: `b51d338fb52cb1e696081e91db8678c597059a9a`
- License: MIT, Copyright (c) 2026 TshyGO.
- 本次实际复制范围：`validatePlan` 函数体，保留原本的候选范围、重复动作、准确数量、每批最多5条等校验。
- 修改范围：仅增加隔离环境导出包装与来源注释；许可全文位于 `extension/vendor/repeat-plan/LICENSE`。
- 产品调用：`extension/repeat-controller.js` 在本站明确允许新增后，生成有界候选并调用该校验器。该控制器接收数量，不接收完整简历。
- 没有引入上游桌面端、AI 请求、同步存储、标志、页面注入消息桥或全套 content.js。

记录控制器、本地版本库和接口适配为本项目实现；已阅读但未授予复制许可的项目没有被复制到本分支。PDF.js 等原有资源继续按 `THIRD_PARTY.md` 保留许可。

实际复用不等于达梦官网兼容证明。当前新增整段确认的安装测试失败，详情见开发检查点；不能用上游项目的宣传替代本项目验收。
