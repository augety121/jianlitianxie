# 官方竞品入口核对与改进取舍（2026-09-27）

本次找到的是Chrome官方商店中的“塔塔网申神器 - AI一键求职填简历”，扩展ID为 `ldohbgcnonoffldimgdngkojkejibina`，发布页面关联www.tatawangshen.com。抓取时详情为0.8.2、更新日期2026-09-03，标记“提供应用内购商品”。这证明有内购入口，不证明每种操作都必须付费；未取得当时登录后会员定价，不臆测价格。

官方商店：https://chromewebstore.google.com/detail/ldohbgcnonoffldimgdngkojkejibina?hl=zh-CN
帮助页：https://www.tatawangshen.com/plugin-help

帮助页文本抓取仍无正文。本次没有登录塔塔账号、支付、使用会员服务或复制其私有实现。商店宣传的覆盖范围、速度和隐私申明是发布方声明，不是本项目已做的独立对照或安全认证。

公开的“塔塔网申神器”视频账号展示过一键、增量、选区填入等教程入口；参照的是产品流程，不把历史视频里的成功率当成当前基准。入口：https://www.bilibili.com/video/BV1UH4y1B7MZ/

## 本轮真正实施

给自己的插件本地候选接入诊断页与真实操作日志，形成“开启记录—本人复现—查看错误类别—导出所选操作—虚构用例复现—修复—回归”的流程。新日志源码的远端写入未成功，不把本文件当作GitHub已包含功能的证明。不为了快速报错而搜集网页全文、简历、Cookie、截屏或原始报错。

保留用户明确选择、经历绑定、已有值保护、填写后回读。没有因为竞品有会员功能就虚构本项目已经同等覆盖；新增日志也不代表跨域iframe、复杂级联、虚拟滚动或附件回执问题已经解决。

## 后续适配验收方法

每个失败报告先核对版本和运行方式，按日志中的扫描遗漏、匹配失败、目标变化、输入校验、回读失败或桥接状态分类。需要DOM结构时使用虚构最小页面，不上传真实页面。每个控件适配要有成功、错误经历、重复选项、动态重绘、取消/过期和独立值核对用例。任何“支持某平台”声明都应标注页面步骤和实际验证日期，不能从通用控件测试外推。

Chrome存储机制参考：https://developer.chrome.com/docs/extensions/reference/api/storage
后台生命周期参考：https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
