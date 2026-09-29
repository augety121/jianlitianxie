# 同类插件参照与0.7.0取舍

访问日期：2026-09-26。下面记录发布方文档和公开开源README的可观察描述，不是对竞品安装包的安全审计，也没有登录竞品账号或做同条件成功率/性能比较。本轮未复制竞品源码、图片或样式文件，没有新增运行时依赖、云端解析或第三方模型服务。

## Simplify Copilot

官方来源：[Using Copilot to Autofill Applications](https://help.simplify.jobs/articles/2415391-using-copilot-to-autofill-applications)。文档将多份简历切换、填写后审阅和不支持页面上的资料复制放在同一使用流程中。

本轮借鉴的是可复用的选择与人工补填路径：提供加密命名资料方案，以及逐条确认的复制按钮。这里的方案仅引用事实，不冒充Simplify的独立简历文件；不复制其云端问答保存、自动追踪或生成能力，不将其营销覆盖率作为本插件的指标。

## Teal

官方来源：[Autofill Job Applications](https://www.tealhq.com/tools/autofill-job-applications)。页面将从简历导入资料、自动填写、本人审阅编辑连接起来。

本轮将资料导入从长列表下方移成独立入口，增加本机DOCX正文文字读取和未归类段落检查。明确“提取文字”不等于“知道该填哪个字段”；未确定事实保持草稿，不模仿云端生成或自动提交。

## 开源本地优先项目

来源：[zqybw98/job-application-autofill-extension README](https://github.com/zqybw98/job-application-autofill-extension)。公开说明强调本地资料、用户触发、可读的字段状态和手工审核提交，并将附件留给用户。

只参考说明中的产品组织和人工边界；未复用代码、未作安全背书。保留本项目已有加密库、字段范围约束、回读和MCP兼容；不新增其CareerOps Tracker连接。

## 塔塔网申

再次访问用户指定的[帮助页](https://www.tatawangshen.com/plugin-help)及[主页](https://tatawangshen.com/)，本次可用文本抓取未返回帮助正文。不能据此编造详细功能或平台适配表，也没有证据说0.7.0全面超过塔塔。

## 当前明确取舍

优先把“上传自己的资料→看清遗漏→保存岗位资料选择→核对位置→自动填或本人补填”做成可复现的真实流程，而不是再叠加一个无法验证的全站按钮。重用既有30/60/40分页和经历绑定，不删除500ms回读，不放宽密码、隐私、来源、已有值与最终提交限制。DOCX导入、方案和复制都不提高底层控件覆盖率；真实官网验收仍需独立记录。

实现机制参考：[DecompressionStream](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream/DecompressionStream)、[DOMParser.parseFromString](https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString)、[Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage)。正文用独立XML解析、文字渲染，不把导入节点注入界面。
