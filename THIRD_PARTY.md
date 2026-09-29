# 随扩展分发的第三方资源

## PDF.js / pdfjs-dist 5.6.205

- 上游：https://github.com/mozilla/pdf.js
- 用途：在浏览器本地读取PDF文字层，不上传简历。
- 本机来源：Codex bundled Node runtime 的 `node_modules/pdfjs-dist`，package版本5.6.205。
- 分发文件：`extension/vendor/pdfjs/pdf.mjs`、`pdf.worker.mjs`，来自上游 `legacy/build`，以及 `cmaps`、`standard_fonts`。
- 主许可证：Apache-2.0，全文为 `extension/vendor/pdfjs/LICENSE`。
- CMap与字体附带许可证分别保存在 `cmaps/LICENSE`、`standard_fonts/LICENSE_FOXIT`、`standard_fonts/LICENSE_LIBERATION`。
- 没有修改这些库文件；没有打包node_modules或个人简历。

## 参考项目

TshyGO/resume-form-assistant-plugin，MIT许可。仅研究工作流、标签识别和数据结构，没有复制源码或分发其程序。

## 测试依赖

jsdom 26.1.0 为开发依赖，通过package-lock固定；不进入扩展包，不负责真实网站访问或浏览器操作。
