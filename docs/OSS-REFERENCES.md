# 开源参照与本轮实现边界

本轮独立实现资料转换、导入比较及经历绑定，没有复制以下项目源码，也没有添加在线模型调用。

| 项目 | 借鉴点 | 许可与使用边界 |
|---|---|---|
| [JSON Resume](https://jsonresume.org/schema) | 以 basics/education/work/projects 等明确记录结构提供可迁移资料文件 | 官方schema标明MIT；本插件独立实现字段白名单转换，不宣称支持所有自定义扩展字段 |
| [Playwright](https://github.com/microsoft/playwright) | 基于可观察标签定位，目标唯一性、状态等待、独立回读；用于测试夹具 | Apache-2.0；仅作为测试依赖，未将浏览器自动化运行时打包入扩展 |
| [Bitwarden browser autofill](https://github.com/bitwarden/clients/tree/main/apps/browser/src/autofill) | 页面发现、建议、选择、执行分层；用户先选数据再写网页 | 默认GPL-3.0，部分bitwarden_license代码另有许可；仅参考架构，没有搬入实现 |

不通过模糊模型输出决定写入哪个学校或项目。本插件的辅助判断和手动映射始终受分区、经历、网站、旧值及本次计划约束；无法确认的情况进入待核对。
