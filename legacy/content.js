/**
 * 秋招求职与简历助手 - Content Script
 * 采用 Shadow DOM 隔离技术，保证与宿主网页样式 100% 零冲突
 */

(() => {
  'use strict';

  // 避免重复注入
  if (document.getElementById('autumn-job-assistant-host')) return;

  const RESUME_STORAGE_KEY = 'autumnRecruitmentTracker.resume.v1';
  const RECORDS_STORAGE_KEY = 'autumnRecruitmentTracker.records.v1';

  // ================= 默认简历备用种子数据 =================
  const DEFAULT_RESUME = {
    "优先信息": {
      "身份证": "110101199801011234",
      "手机": "13800138000",
      "邮箱": "job_hunter@example.com",
      "微信号": "wechat_demo",
      "现居地": "北京市海淀区",
      "求职意向": "AI产品经理 / 算法工程师"
    },
    "基本信息": {
      "姓名": "李明",
      "性别": "男",
      "出生年月": "1999-06",
      "政治面貌": "共青团员",
      "籍贯": "山东省济南市",
      "紧急联系人": "李华 (13900139000)",
      "自我评价": "具备扎实的AI技术认知与产品化落地经验，自驱力强，跨部门沟通流畅。"
    },
    "教育经历": [
      {
        "_rowName": "硕士",
        "学校": "浙江大学",
        "学院": "计算机科学与技术学院",
        "专业": "人工智能",
        "学历": "硕士研究生",
        "开始时间": "2023-09",
        "结束时间": "2026-06",
        "导师": "张教授"
      },
      {
        "_rowName": "本科",
        "学校": "华东理工大学",
        "学院": "信息科学与工程学院",
        "专业": "软件工程",
        "学历": "本科",
        "开始时间": "2019-09",
        "结束时间": "2023-06"
      }
    ],
    "实习经历": [
      {
        "_rowName": "字节跳动",
        "单位": "北京字节跳动科技有限公司",
        "部门": "商业化产品部",
        "岗位": "AI产品经理实习生",
        "开始": "2025-06",
        "结束": "至今",
        "岗位职责": "1. 主导智能广告生成 Agent 方案设计；\n2. 协同算法团队完成模型微调，CTR 提升 12.4%；\n3. 撰写多份高保真 PRD 与交互原型。"
      }
    ],
    "项目经历": [
      {
        "_rowName": "LLM Agent 平台",
        "项目名称": "基于大模型多智能体的自动化仿真与决策工作流平台",
        "角色": "核心负责人",
        "开始": "2024-09",
        "结束": "2025-05",
        "主要工作": "设计认知层-技能层解耦架构，结合动态 Prompt 编排实现端到端自动化测试。"
      }
    ],
    "竞赛与技能": {
      "英语水平": "CET-6 (598分)",
      "专业技能": "Python, SQL, Figma, Prompt Engineering, Agent Architecture"
    }
  };

  let currentResumeData = DEFAULT_RESUME;
  let lastFocusedEl = null;
  let lastSelectionStart = null;
  let lastSelectionEnd = null;

  function updateActiveSelection(el) {
    if (!el) return;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      lastFocusedEl = el;
      try {
        lastSelectionStart = el.selectionStart;
        lastSelectionEnd = el.selectionEnd;
      } catch (_) {}
    } else if (el.isContentEditable) {
      lastFocusedEl = el;
    }
  }

  // ================= 监听宿主页面聚焦与光标交互事件 =================
  document.addEventListener('focusin', (e) => updateActiveSelection(e.target), true);
  document.addEventListener('click', (e) => updateActiveSelection(e.target), true);
  document.addEventListener('keyup', (e) => updateActiveSelection(e.target), true);
  document.addEventListener('select', (e) => updateActiveSelection(e.target), true);

  // ================= 创建宿主容器与 Shadow Root =================
  const host = document.createElement('div');
  host.id = 'autumn-job-assistant-host';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // ================= 注入 Shadow DOM 核心样式 =================
  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
    
    /* 悬浮吸边胶囊按钮 */
    #aja-toggle {
      position: fixed;
      top: 180px;
      right: 0;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px 8px 10px;
      background: linear-gradient(135deg, #5367e9, #4053cb);
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-right: none;
      border-radius: 20px 0 0 20px;
      box-shadow: 0 4px 16px rgba(64, 83, 203, 0.35);
      cursor: pointer;
      user-select: none;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    #aja-toggle:hover {
      padding-left: 14px;
      background: linear-gradient(135deg, #6275f0, #4c5fd6);
      box-shadow: 0 6px 20px rgba(64, 83, 203, 0.45);
    }
    #aja-toggle.hidden {
      display: none;
    }

    /* 侧边滑出抽屉面板 */
    #aja-drawer {
      position: fixed;
      top: 20px;
      right: 20px;
      bottom: 20px;
      width: 350px;
      max-height: calc(100vh - 40px);
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(16px);
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(15, 23, 42, 0.18);
      user-select: none;
      transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
      transform: translateX(0);
      opacity: 1;
    }
    #aja-drawer.collapsed {
      transform: translateX(calc(100% + 30px));
      opacity: 0;
      pointer-events: none;
    }

    /* 顶部标题栏 */
    .drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      background: linear-gradient(135deg, #4f64ee, #3d51cc);
      color: #fff;
      border-radius: 15px 15px 0 0;
      cursor: move;
    }
    .brand-area {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-icon {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      font-size: 14px;
    }
    .brand-title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }
    .shortcut-badge {
      font-size: 10px;
      background: rgba(255, 255, 255, 0.22);
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: normal;
      color: #e0e7ff;
    }
    .close-btn {
      background: none;
      border: none;
      color: #fff;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      padding: 2px 6px;
      border-radius: 4px;
      opacity: 0.8;
      transition: opacity 0.15s;
    }
    .close-btn:hover {
      opacity: 1;
      background: rgba(255, 255, 255, 0.2);
    }

    /* 抽屉内容滚动区域 */
    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .drawer-body::-webkit-scrollbar {
      width: 5px;
    }
    .drawer-body::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 4px;
    }

    /* 一键收录卡片 */
    .capture-card {
      background: linear-gradient(145deg, #f0f4ff, #e6edff);
      border: 1px solid #c7d7fe;
      border-radius: 12px;
      padding: 10px;
    }
    .capture-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 12px;
      background: #5367e9;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 650;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
    }
    .capture-btn:hover {
      background: #4053cb;
      transform: translateY(-1px);
    }
    .capture-btn:active {
      transform: translateY(0);
    }
    .autofill-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 12px;
      margin-top: 6px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 650;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
      box-shadow: 0 2px 4px rgba(217, 119, 6, 0.2);
    }
    .autofill-btn:hover {
      background: linear-gradient(135deg, #d97706, #b45309);
      transform: translateY(-1px);
      box-shadow: 0 4px 6px rgba(217, 119, 6, 0.25);
    }
    .autofill-btn:active {
      transform: translateY(0);
    }
    .autofill-warning-tip {
      font-size: 10.5px;
      color: #b45309;
      text-align: center;
      margin-top: 4px;
      line-height: 1.2;
      opacity: 0.9;
    }

    /* 快速微调确认表单 */
    .capture-form {
      display: none;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px dashed #bfdbfe;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .capture-form.hidden {
      display: none;
    }
    .title-hint {
      font-size: 11px;
      color: #64748b;
      background: #f8fafc;
      border: 1px dashed #e2e8f0;
      border-radius: 6px;
      padding: 5px 8px;
      line-height: 1.4;
      word-break: break-all;
      cursor: pointer;
    }
    .title-hint:hover {
      background: #eef2ff;
      border-color: #a5b4fc;
    }
    .title-hint-label {
      color: #94a3b8;
      font-size: 10px;
      margin-bottom: 2px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .form-group label {
      font-size: 11px;
      font-weight: 600;
      color: #475569;
    }
    .form-group input, .form-group select {
      padding: 5px 8px;
      font-size: 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #fff;
      color: #1e293b;
      outline: none;
    }
    .form-group input:focus, .form-group select:focus {
      border-color: #5367e9;
      box-shadow: 0 0 0 2px rgba(83, 103, 233, 0.15);
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .form-actions {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }
    .btn-save-record {
      flex: 1;
      padding: 6px;
      background: #24a475;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-save-record:hover {
      background: #1e8b63;
    }
    .btn-cancel-capture {
      padding: 6px 10px;
      background: #f1f5f9;
      color: #64748b;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
    }
    .btn-cancel-capture:hover {
      background: #e2e8f0;
    }

    /* 简历模块手风琴折叠 */
    .resume-section {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: #fff;
      overflow: hidden;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      background: #f8fafc;
      font-size: 12px;
      font-weight: 700;
      color: #334155;
      cursor: pointer;
      transition: background 0.15s;
    }
    .section-header:hover {
      background: #f1f5f9;
    }
    .section-arrow {
      font-size: 10px;
      transition: transform 0.2s;
      color: #94a3b8;
    }
    .resume-section.collapsed .section-arrow {
      transform: rotate(-90deg);
    }
    .section-content {
      padding: 6px 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .resume-section.collapsed .section-content {
      display: none;
    }

    /* 经历行卡片 */
    .exp-row {
      background: #f8fafc;
      border: 1px solid #f1f5f9;
      border-radius: 6px;
      padding: 6px;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .exp-row-title {
      width: 100%;
      font-size: 11px;
      font-weight: 700;
      color: #4f64ee;
      margin-bottom: 2px;
      border-bottom: 1px dashed #e2e8f0;
      padding-bottom: 2px;
    }

    /* 填充数据字段按钮 */
    .field-btn {
      display: inline-flex;
      align-items: center;
      padding: 4px 7px;
      background: #ffffff;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      color: #1e293b;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.12s;
      max-width: 100%;
      text-align: left;
    }
    .field-btn:hover {
      background: #eff6ff;
      border-color: #93c5fd;
      color: #1d4ed8;
      transform: translateY(-1px);
    }
    .field-btn:active {
      background: #dbeafe;
      transform: translateY(0);
    }
    .field-key {
      color: #64748b;
      font-size: 10px;
      margin-right: 4px;
      white-space: nowrap;
    }
    .field-key::after {
      content: ':';
    }
    .field-val {
      font-weight: 550;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 190px;
    }

    /* 抽屉底部快捷操作 */
    .drawer-footer {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      border-radius: 0 0 15px 15px;
    }
    .footer-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      background: #fff;
      color: #334155;
      cursor: pointer;
      transition: all 0.15s;
    }
    .footer-btn:hover {
      background: #eff6ff;
      border-color: #93c5fd;
      color: #4f64ee;
    }

    /* 提示 Toast */
    .aja-toast {
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: #1e293b;
      color: #fff;
      padding: 7px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
      box-shadow: 0 4px 14px rgba(0,0,0,0.2);
      pointer-events: none;
      z-index: 999;
      animation: fadeIn .2s ease;
      white-space: nowrap;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translate(-50%, -6px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
  `;
  shadow.appendChild(style);

  // ================= 构建 DOM 结构 =================
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="aja-toggle" title="展开秋招求职助手 (Ctrl+Shift+F)">
      <span>📝</span>
      <span>简历助手</span>
    </div>

    <div id="aja-drawer" class="collapsed">
      <div class="drawer-header" id="aja-drag-handle">
        <div class="brand-area">
          <div class="brand-icon">🚀</div>
          <div class="brand-title">秋招求职助手</div>
          <span class="shortcut-badge">Ctrl+Shift+F</span>
        </div>
        <button class="close-btn" id="aja-close-btn" title="收起面板">✕</button>
      </div>

      <div class="drawer-body">
        <!-- 一键收录岗位卡片 -->
        <div class="capture-card">
          <button class="capture-btn" id="aja-scan-btn">
            <span>📌</span>
            <span>一键收录当前岗位</span>
          </button>
          <button class="autofill-btn" id="aja-autofill-btn" title="自动匹配并填充页面空白表单项">
            <span>⚡</span>
            <span>一键填充当前页面</span>
          </button>
          <div class="autofill-warning-tip">功能不完善，请逐条核对</div>
          
          <div class="capture-form hidden" id="aja-capture-form">
            <div class="title-hint" id="cap-title-hint" title="点击复制网页标题">
              <div class="title-hint-label">📄 网页标题（参考）</div>
              <div id="cap-title-text"></div>
            </div>
            <div class="form-group">
              <label>公司名称</label>
              <input type="text" id="cap-company" placeholder="例如：字节跳动">
            </div>
            <div class="form-group">
              <label>投递岗位</label>
              <input type="text" id="cap-position" placeholder="例如：AI产品经理">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>目标城市</label>
                <input type="text" id="cap-city" placeholder="例如：北京">
              </div>
              <div class="form-group">
                <label>投递阶段</label>
                <select id="cap-stage">
                  <option value="已投递">已投递</option>
                  <option value="待投递">待投递</option>
                  <option value="笔试">笔试</option>
                  <option value="一面">一面</option>
                  <option value="二面">二面</option>
                  <option value="HR面">HR面</option>
                  <option value="Offer">Offer</option>
                  <option value="已结束">已结束</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>投递日期</label>
              <input type="date" id="cap-date">
            </div>
            <div class="form-actions">
              <button class="btn-save-record" id="cap-save-btn">✓ 确认存入看板</button>
              <button class="btn-cancel-capture" id="cap-cancel-btn">收起</button>
            </div>
          </div>
        </div>

        <!-- 简历资料库分类展示 -->
        <div id="aja-resume-list"></div>
      </div>

      <!-- 底部中枢入口 -->
      <div class="drawer-footer">
        <button class="footer-btn" id="aja-open-records-btn">
          <span>📊</span>
          <span>投递看板</span>
        </button>
        <button class="footer-btn" id="aja-open-resume-btn">
          <span>⚙️</span>
          <span>简历配置</span>
        </button>
      </div>
    </div>
  `;
  shadow.appendChild(wrapper);

  // ================= 获取 DOM 元素 =================
  const toggleBtn = shadow.getElementById('aja-toggle');
  const drawer = shadow.getElementById('aja-drawer');
  const closeBtn = shadow.getElementById('aja-close-btn');
  const dragHandle = shadow.getElementById('aja-drag-handle');
  const scanBtn = shadow.getElementById('aja-scan-btn');
  const autofillBtn = shadow.getElementById('aja-autofill-btn');
  const captureForm = shadow.getElementById('aja-capture-form');
  const capCompany = shadow.getElementById('cap-company');
  const capPosition = shadow.getElementById('cap-position');
  const capCity = shadow.getElementById('cap-city');
  const capStage = shadow.getElementById('cap-stage');
  const capDate = shadow.getElementById('cap-date');
  const capSaveBtn = shadow.getElementById('cap-save-btn');
  const capCancelBtn = shadow.getElementById('cap-cancel-btn');
  const capTitleHint = shadow.getElementById('cap-title-hint');
  const capTitleText = shadow.getElementById('cap-title-text');
  const resumeListEl = shadow.getElementById('aja-resume-list');
  const openRecordsBtn = shadow.getElementById('aja-open-records-btn');
  const openResumeBtn = shadow.getElementById('aja-open-resume-btn');

  // ================= 渲染简历模块 =================
  function renderResumeSections(resume) {
    if (!resume || typeof resume !== 'object') return;
    let html = '';

    for (const [sectionName, sectionData] of Object.entries(resume)) {
      if (!sectionData) continue;
      const isDefaultOpen = sectionName === '优先信息';
      const collapsedClass = isDefaultOpen ? '' : 'collapsed';

      html += `
        <div class="resume-section ${collapsedClass}">
          <div class="section-header">
            <span>${sectionName}</span>
            <span class="section-arrow">▼</span>
          </div>
          <div class="section-content">
      `;

      if (Array.isArray(sectionData)) {
        // 多段经历（如教育经历、实习、项目经历）
        sectionData.forEach(item => {
          html += `<div class="exp-row">`;
          if (item._rowName) {
            html += `<div class="exp-row-title">👉 ${item._rowName}</div>`;
          }
          for (const [k, v] of Object.entries(item)) {
            if (k.startsWith('_') || v === undefined || v === null || v === '') continue;
            const strVal = String(v);
            html += `
              <button class="field-btn" data-val="${encodeURIComponent(strVal)}" title="${k}: ${strVal.replace(/"/g, '&quot;')}">
                <span class="field-key">${k}</span>
                <span class="field-val">${strVal}</span>
              </button>
            `;
          }
          html += `</div>`;
        });
      } else if (typeof sectionData === 'object') {
        // 普通对象模块（如基本信息、优先信息）
        html += `<div class="exp-row">`;
        for (const [k, v] of Object.entries(sectionData)) {
          if (v === undefined || v === null || v === '') continue;
          const strVal = String(v);
          html += `
            <button class="field-btn" data-val="${encodeURIComponent(strVal)}" title="${k}: ${strVal.replace(/"/g, '&quot;')}">
              <span class="field-key">${k}</span>
              <span class="field-val">${strVal}</span>
            </button>
          `;
        }
        html += `</div>`;
      }

      html += `</div></div>`;
    }

    resumeListEl.innerHTML = html;
  }

  // ================= 从 storage 加载最新简历 =================
  async function loadResumeData() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const res = await chrome.storage.local.get([RESUME_STORAGE_KEY]);
        if (res[RESUME_STORAGE_KEY]) {
          currentResumeData = res[RESUME_STORAGE_KEY];
        }
      }
    } catch (e) {
      console.warn('读取扩展存储失败，使用默认简历', e);
    }
    renderResumeSections(currentResumeData);
  }
  loadResumeData();

  // 监听 storage 变化（当用户在看板页面修改了简历，网页端实时刷新）
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes[RESUME_STORAGE_KEY]) {
        currentResumeData = changes[RESUME_STORAGE_KEY].newValue || DEFAULT_RESUME;
        renderResumeSections(currentResumeData);
      }
    });
  }

  // ================= 页面收录与 DOM 解析引擎 =================
  // 1. 知名大厂官方招聘门户特征库
  const KNOWN_ENTERPRISES = [
    { match: /careers\.tencent\.com|tencent\.com/i, company: '腾讯科技' },
    { match: /jobs\.bytedance\.com|bytedance\.com/i, company: '字节跳动' },
    { match: /talent\.alibaba\.com|taotian\.com|alibabagroup\.com|aliyun\.com/i, company: '阿里巴巴' },
    { match: /zhaopin\.meituan\.com|meituan\.com/i, company: '美团' },
    { match: /career\.huawei\.com|huawei\.com/i, company: '华为' },
    { match: /hr\.163\.com|campus\.163\.com|163\.com/i, company: '网易' },
    { match: /talent\.baidu\.com|baidu\.com/i, company: '百度' },
    { match: /campus\.jd\.com|jd\.com/i, company: '京东' },
    { match: /campus\.kuaishou\.cn|zhaopin\.kuaishou\.cn|kuaishou\.com/i, company: '快手' },
    { match: /job\.xiaohongshu\.com|xiaohongshu\.com/i, company: '小红书' },
    { match: /careers\.pinduoduo\.com|pinduoduo\.com/i, company: '拼多多' },
    { match: /hr\.xiaomi\.com|xiaomi\.com/i, company: '小米' },
    { match: /talent\.antgroup\.com|antgroup\.com/i, company: '蚂蚁集团' },
    { match: /job\.bilibili\.com|bilibili\.com/i, company: '哔哩哔哩' },
    { match: /didiglobal\.com|didichuxing\.com/i, company: '滴滴出行' },
    { match: /careers\.oppo\.com|oppo\.com/i, company: 'OPPO' },
    { match: /hr\.vivo\.com|vivo\.com/i, company: 'vivo' },
    { match: /we-dji\.com|dji\.com/i, company: '大疆创新' },
    { match: /nio\.com/i, company: '蔚来汽车' },
    { match: /lixiang\.com/i, company: '理想汽车' },
    { match: /xiaopeng\.com/i, company: '小鹏汽车' },
    { match: /job\.byd\.com|byd\.com/i, company: '比亚迪' },
    { match: /campus\.sf-express\.com|sf-express\.com/i, company: '顺丰速运' },
    { match: /talent\.shein\.com|shein\.com/i, company: 'SHEIN' },
    { match: /careers\.shopee\.cn|shopee\.com/i, company: 'Shopee' },
    { match: /job\.dewu\.com|poizon\.com/i, company: '得物' },
    { match: /cvte\.com/i, company: 'CVTE' },
    { match: /360\.cn/i, company: '360' },
    { match: /lenovo\.com/i, company: '联想集团' },
    { match: /zte\.com\.cn/i, company: '中兴通讯' }
  ];

  // 辅助函数：按选择器数组顺序提取第一个非空文本
  function queryFirstText(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        if (!el || el.closest('#autumn-job-assistant-host')) continue;
        
        // 优先提取属性
        const attrVal = el.getAttribute('alt') || el.getAttribute('title') || el.getAttribute('value');
        if (attrVal && attrVal.trim().length >= 2 && attrVal.trim().length < 100) {
          return attrVal.trim();
        }
        
        const txt = el.textContent?.trim();
        if (txt && txt.length >= 2 && txt.length < 150) {
          return txt;
        }
      } catch (_) {}
    }
    return '';
  }

  // 2. 核心 ATS 系统专有解析器 (北森, Moka, 大易, 用友, 24Talent)
  function parseAtsJobData() {
    const host = location.hostname.toLowerCase();
    const pathname = location.pathname;

    // ① 北森 (Beisen / iTalent / zhiye)
    if (/beisen\.com|italent\.cn|zhiye\.com/i.test(host)) {
      const position = queryFirstText([
        '.job-detail-title',
        '.detail-title',
        '.detail-header .title',
        '.job-title',
        '.job-name',
        '.post-name',
        '.position-name',
        '.beisen-breadcrumb .ant-breadcrumb-link:last-child',
        '.ant-breadcrumb li:last-child',
        '.breadcrumb-item:last-child',
        'h1'
      ]);
      const company = queryFirstText([
        '.header-logo img',
        '.logo img',
        '.header .company-name',
        '.tenant-name',
        '.brand-name',
        '.header-left .name'
      ]);
      return { company, position, source: 'Beisen' };
    }

    // ② Moka (MokaHR)
    if (/mokahr\.com/i.test(host)) {
      const position = queryFirstText([
        '.job-title',
        '.position-title',
        'h1.title',
        '.position-head .title',
        '.job-detail-title',
        '.job-name',
        '.moka-breadcrumb span:last-child',
        '.ant-breadcrumb li:last-child'
      ]);
      let company = queryFirstText([
        '.org-logo img',
        '.logo img',
        '.org-name',
        '.company-title',
        '.brand-title'
      ]);
      if (!company) {
        const m = pathname.match(/(?:campus-recruitment|apply|campus|social-recruitment)\/([^\/\?#]+)/i);
        if (m && m[1]) company = m[1];
      }
      return { company, position, source: 'Moka' };
    }

    // ③ 大易 (Dayee / HiTalent / WinTalent / CloudTalent)
    if (/dayee\.com|hitalent\.cn|wintalent\.cn|cloudtalent\.cn|bphr\.com\.cn/i.test(host)) {
      const position = queryFirstText([
        '.jobName',
        '.job_name',
        '.post_name',
        '.job-title',
        '.detail_title',
        '.nav_path a:last-child',
        '.nav-path span:last-child',
        'h1'
      ]);
      const company = queryFirstText([
        '.header_logo img',
        '.logo img',
        '.comp-title',
        '.header-brand',
        '.company-name'
      ]);
      return { company, position, source: 'Dayee' };
    }

    // ④ 用友 (Yonyou / DayHR / YonBIP)
    if (/yonyou\.com|yonyoucloud\.com|dayhr\.com|upesn\.com/i.test(host)) {
      const position = queryFirstText([
        '.post-title',
        '.job-name',
        '.position-detail-title',
        '.recruit-title',
        '.detail-header-title',
        'h1'
      ]);
      const company = queryFirstText([
        '.header img',
        '.logo_wrap img',
        '.tenant-logo img',
        '.company-name'
      ]);
      return { company, position, source: 'Yonyou' };
    }

    // ⑤ 24Talent / 赛码 (24talent.com / acmcoder.com)
    if (/24talent\.com|24-talent\.com|acmcoder\.com|51sai\.com/i.test(host)) {
      const position = queryFirstText([
        '.position-title',
        '.job-title',
        '.detail-title',
        '.job-detail-head .title',
        'h1'
      ]);
      const company = queryFirstText([
        '.company-title',
        '.company_name',
        '.logo img'
      ]);
      return { company, position, source: '24Talent' };
    }

    // ⑥ 招聘平台专属 (BOSS直聘, 牛客, 实习僧, 猎聘, 智联, 前程无忧, 拉勾)
    if (/zhipin\.com/i.test(host)) {
      return {
        company: queryFirstText(['.company-name', '.company-info .name', '.job-sec-company .name']),
        position: queryFirstText(['.job-name', '.name', 'h1']),
        source: 'Boss'
      };
    }
    if (/nowcoder\.com/i.test(host)) {
      return {
        company: queryFirstText(['.company-item-title', '.job-detail-company', '.company-name', '.feed-item-company-name']),
        position: queryFirstText(['.job-item-title', '.job-title', '.detail-title', 'h1']),
        source: 'Nowcoder'
      };
    }
    if (/shixiseng\.com/i.test(host)) {
      return {
        company: queryFirstText(['.com-name', '.company-name', '.com_name']),
        position: queryFirstText(['.job-name', '.job_name', '.new_job_name', 'h1']),
        source: 'Shixiseng'
      };
    }
    if (/liepin\.com/i.test(host)) {
      return {
        company: queryFirstText(['.company-info-title', '.name-box .name', '.company-name']),
        position: queryFirstText(['.job-title-left .name', '.job-title-box .name', 'h1']),
        source: 'Liepin'
      };
    }

    return null;
  }

  // 3. 通用面包屑末项提取器
  function parseBreadcrumbPosition() {
    const breadcrumbSelectors = [
      '.ant-breadcrumb li:last-child',
      '.ant-breadcrumb-link:last-child',
      '.el-breadcrumb__item:last-child',
      '.breadcrumb-item:last-child',
      '.breadcrumb > *:last-child',
      'nav[aria-label*="breadcrumb" i] *:last-child',
      '[class*="breadcrumb" i] li:last-child',
      '[class*="nav-path" i] *:last-child',
      '[class*="navPath" i] *:last-child'
    ];
    for (const sel of breadcrumbSelectors) {
      const el = document.querySelector(sel);
      const txt = el?.textContent?.trim();
      if (txt && txt.length >= 2 && txt.length <= 60 && !/首页|主页|返回|详情|列表|校招|社招|岗位列表|招聘信息/i.test(txt)) {
        return txt;
      }
    }
    return '';
  }

  // 4. 通用顶栏 Logo 反查企业名称
  function parseHeaderLogoCompany() {
    const logoSelectors = [
      'header img[alt]',
      'nav img[alt]',
      '.header img[alt]',
      '.navbar img[alt]',
      '.logo img[alt]',
      '[class*="logo" i] img[alt]',
      '[class*="brand" i] img[alt]',
      'header a[title]',
      'nav a[title]'
    ];
    for (const sel of logoSelectors) {
      const el = document.querySelector(sel);
      const txt = (el?.getAttribute('alt') || el?.getAttribute('title') || '').trim();
      if (txt && txt.length >= 2 && txt.length <= 40 && !/logo|icon|image|pic|首页|图片|招聘官网|招聘系统/i.test(txt)) {
        return txt;
      }
    }
    return '';
  }

  // 5. 智能岗位名称清洗器 (彻底废除 split(/\s+/)[0]，保留中英文混排空格)
  function cleanJobPosition(raw) {
    if (!raw) return '';
    let str = String(raw).replace(/[\r\n\t]+/g, ' ').trim();

    // 剔除前后方括号/圆括号内的修饰词 (如 【2025届校招】、[秋招]、(急聘)、【校招/全职】、【应届生】)
    str = str.replace(/^[【\[（(][^【\[（()）\]】]{1,25}[】\]）)]\s*/g, '');
    str = str.replace(/\s*[【\[（(][^【\[（()）\]】]{1,25}[】\]）)]$/g, '');

    // 剔除前置标签：如 "招聘职位："、"应聘岗位："、"职位详情："、"校招-"
    str = str.replace(/^(?:招聘职位|投递岗位|应聘岗位|职位名称|岗位名称|招聘岗位|招聘)\s*[:：\-—|·]\s*/i, '');
    str = str.replace(/^(?:20\d{2}届?(?:校园招聘|校招|秋招|春招|全球校招)?)\s*[:：\-—|·]\s*/i, '');

    // 剔除后缀噪音词：如 "- 职位详情"、"| 校园招聘"、"- 招聘官网"
    str = str.replace(/\s*[-—|·_]\s*(?:职位详情|岗位详情|校园招聘|校招|网申通道|投递通道|招聘官网|招聘门户|招聘管理系统).*$/i, '');

    // 压缩连续多余空格，但完整保留内部空格（如 "AI 产品经理"）
    str = str.replace(/\s{2,}/g, ' ').trim();

    return str.slice(0, 60) || '待确认岗位';
  }

  // 6. 智能企业名称清洗器
  function cleanJobCompany(raw, host, pageTitle) {
    let str = String(raw || '').replace(/[\r\n\t]+/g, ' ').trim();

    // 剔除系统与平台后缀
    str = str.replace(/\s*[-—|·_]\s*(?:北森|Moka|大易|用友|24Talent|BOSS直聘|猎聘|智联招聘|前程无忧|牛客网?|实习僧|招聘官网|校园招聘|招聘系统|招聘门户).*$/i, '');
    str = str.replace(/^(?:关于|欢迎加入|走进)\s*/i, '');
    str = str.replace(/(?:校园招聘|官方招聘|人才招聘|招聘门户|招聘主页|招聘官网)$/i, '');

    // 如果清洗后为空或太短，从 document.title 智能拆解
    if (!str || str.length < 2 || /待确认|未知|招聘|职位|详情|首页/i.test(str)) {
      const parts = String(pageTitle || document.title || '')
        .split(/[-—|·_]/)
        .map(p => p.trim())
        .filter(p => p.length >= 2 && !/招聘|职位|详情|BOSS|猎聘|智联|前程|牛客|实习僧|Moka|北森|大易|官网|首页|系统|管理|投递/i.test(p));
      if (parts.length > 0) {
        str = parts[0];
      }
    }

    // 若仍为空，从二级域名反查 (如 oppo.italent.cn -> OPPO)
    if (!str || str.length < 2) {
      const sub = (host || location.hostname).split('.')[0];
      if (sub && sub.length >= 2 && !/www|app|campus|jobs?|careers?|talent|hr|zhaopin/i.test(sub)) {
        str = sub.toUpperCase();
      }
    }

    return str.slice(0, 50) || '待确认公司';
  }

  // ================= 综合调度提取主函数 =================
  function extractPageJobData() {
    let detectedCompany = '';
    let detectedPosition = '';
    let city = '';
    const host = location.hostname.toLowerCase();

    // Step 1: 知名大厂官方域名优先锁定
    const matchedEnterprise = KNOWN_ENTERPRISES.find(item => item.match.test(host));
    if (matchedEnterprise) {
      detectedCompany = matchedEnterprise.company;
    }

    // Step 2: 专有 ATS / 招聘系统解析
    const atsData = parseAtsJobData();
    if (atsData) {
      if (!detectedCompany && atsData.company) detectedCompany = atsData.company;
      if (atsData.position) detectedPosition = atsData.position;
    }

    // Step 3: 面包屑末项精准捕获 (岗位通用探测)
    if (!detectedPosition) {
      detectedPosition = parseBreadcrumbPosition();
    }

    // Step 4: JSON-LD 结构化数据探测
    function flatten(value, output = []) {
      if (!value) return output;
      if (Array.isArray(value)) value.forEach(item => flatten(item, output));
      else if (typeof value === 'object') {
        output.push(value);
        if (value['@graph']) flatten(value['@graph'], output);
      }
      return output;
    }
    const jsonObjects = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach(node => {
      try { flatten(JSON.parse(node.textContent), jsonObjects); } catch (_) {}
    });
    const jobLd = jsonObjects.find(item => {
      const type = item && item['@type'];
      return type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'));
    }) || {};

    if (!detectedPosition && jobLd.title) detectedPosition = jobLd.title;
    if (!detectedCompany && (jobLd.hiringOrganization?.name || typeof jobLd.hiringOrganization === 'string')) {
      detectedCompany = typeof jobLd.hiringOrganization === 'string' ? jobLd.hiringOrganization : jobLd.hiringOrganization.name;
    }

    // Step 5: 通用 DOM 大字号标题与 Logo 探测
    if (!detectedPosition) {
      detectedPosition = queryFirstText([
        'h1',
        '[class*="job-title" i]',
        '[class*="jobTitle" i]',
        '[class*="position-title" i]',
        '[class*="positionTitle" i]',
        '[class*="post-title" i]',
        '[class*="job-name" i]',
        '[class*="jobName" i]',
        '[class*="position" i]',
        '.title'
      ]);
    }
    if (!detectedCompany) {
      detectedCompany = parseHeaderLogoCompany() || queryFirstText([
        '[data-testid*="company" i]',
        '[class*="company-name" i]',
        '[class*="companyName" i]',
        '[class*="company_title" i]',
        '[class*="companyTitle" i]',
        '[class*="org-name" i]'
      ]);
    }

    // Step 6: Meta 元数据与网页 Title 兜底
    if (!detectedPosition) {
      detectedPosition = document.querySelector('meta[property="og:title"],meta[name="og:title"]')?.content?.trim() || document.title;
    }
    if (!detectedCompany) {
      detectedCompany = document.querySelector('meta[property="og:site_name"],meta[name="og:site_name"]')?.content?.trim() || '';
    }

    // Step 7: 智能清洗与标准化
    const position = cleanJobPosition(detectedPosition);
    const company = cleanJobCompany(detectedCompany, host, document.title);

    // Step 8: 城市与阶段分析
    const locations = Array.isArray(jobLd.jobLocation) ? jobLd.jobLocation : [jobLd.jobLocation].filter(Boolean);
    city = locations.map(loc => {
      const address = loc?.address || loc;
      return [address?.addressLocality, address?.addressRegion].filter(Boolean).join(' ');
    }).filter(Boolean).join(' / ');

    const pageText = (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 50000);
    if (!city) {
      const knownCities = ['北京','上海','广州','深圳','杭州','南京','苏州','成都','重庆','武汉','西安','长沙','天津','厦门','合肥','郑州','青岛','济南','宁波','无锡','珠海','佛山','东莞','福州','昆明','南昌','大连','沈阳','哈尔滨','香港','澳门'];
      city = knownCities.find(c => (position + ' ' + document.title + ' ' + pageText.slice(0, 4000)).includes(c)) || '';
    }

    const stage = '已投递';

    const dateMatch = pageText.match(/(?:投递|申请)(?:时间|日期)?\s*[:：]?\s*(20\d{2})[.\/年-](\d{1,2})[.\/月-](\d{1,2})日?/);
    const applicationDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}` : new Date().toISOString().slice(0, 10);

    return {
      company,
      position,
      city: city.slice(0, 30),
      stage,
      applicationDate,
      applicationUrl: location.href
    };
  }

  // ================= 交互事件绑定 =================
  let isCollapsed = true;
  function toggleDrawer(open) {
    isCollapsed = typeof open === 'boolean' ? !open : !isCollapsed;
    if (isCollapsed) {
      drawer.classList.add('collapsed');
      toggleBtn.classList.remove('hidden');
    } else {
      drawer.classList.remove('collapsed');
      toggleBtn.classList.add('hidden');
    }
  }

  toggleBtn.addEventListener('click', () => toggleDrawer(true));
  closeBtn.addEventListener('click', () => toggleDrawer(false));

  // 快捷键 Ctrl+Shift+F
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
      e.preventDefault();
      toggleDrawer();
    }
  });

  // 手风琴折叠交互
  resumeListEl.addEventListener('click', (e) => {
    const headerEl = e.target.closest('.section-header');
    if (headerEl) {
      const sec = headerEl.closest('.resume-section');
      sec.classList.toggle('collapsed');
    }
  });

  // 点击字段按钮 -> 光标处插入/追加 + 剪贴板兜底
  resumeListEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.field-btn');
    if (!btn) return;

    const rawVal = btn.getAttribute('data-val');
    if (!rawVal) return;
    const value = decodeURIComponent(rawVal);

    // 剪贴板兜底
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).catch(err => console.warn('剪贴板写入异常', err));
    }

    const targetEl = lastFocusedEl;
    if (targetEl && document.contains(targetEl)) {
      try {
        if (targetEl instanceof HTMLInputElement || targetEl instanceof HTMLTextAreaElement) {
          const prevVal = targetEl.value || '';
          
          // 获取当前光标位置（如选区存在则替换选区，如无选区则直接在光标处插入）
          let start = (typeof targetEl.selectionStart === 'number' && targetEl.selectionStart >= 0)
            ? targetEl.selectionStart
            : ((typeof lastSelectionStart === 'number' && lastSelectionStart >= 0) ? lastSelectionStart : prevVal.length);
            
          let end = (typeof targetEl.selectionEnd === 'number' && targetEl.selectionEnd >= 0)
            ? targetEl.selectionEnd
            : ((typeof lastSelectionEnd === 'number' && lastSelectionEnd >= 0) ? lastSelectionEnd : start);

          if (start > prevVal.length) start = prevVal.length;
          if (end > prevVal.length) end = prevVal.length;

          // 拼接新值
          const newVal = prevVal.slice(0, start) + value + prevVal.slice(end);

          const proto = (targetEl instanceof HTMLTextAreaElement) ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (setter) {
            setter.call(targetEl, newVal);
          } else {
            targetEl.value = newVal;
          }

          // 触发 input 与 change 事件通知网页端框架 (Vue/React/Angular)
          targetEl.dispatchEvent(new Event('input', { bubbles: true }));
          targetEl.dispatchEvent(new Event('change', { bubbles: true }));

          // 将光标定位在新插入内容的末尾并聚焦
          targetEl.focus();
          const nextCursorPos = start + value.length;
          try {
            targetEl.setSelectionRange(nextCursorPos, nextCursorPos);
            lastSelectionStart = nextCursorPos;
            lastSelectionEnd = nextCursorPos;
          } catch (_) {}

          showToast(`已插入: ${value.slice(0, 12)}${value.length > 12 ? '...' : ''}`);
        } else if (targetEl.isContentEditable) {
          targetEl.focus();
          document.execCommand('insertText', false, value);
          showToast(`已插入: ${value.slice(0, 12)}${value.length > 12 ? '...' : ''}`);
        } else {
          showToast(`已复制到剪贴板，请在表单中粘贴`);
        }
      } catch (err) {
        console.warn('插入文本异常', err);
        showToast(`已复制到剪贴板，请手动粘贴`);
      }
    } else {
      showToast(`已复制到剪贴板，请在表单中粘贴`);
    }
  });

  // 一键提取岗位并展示微调表单
  scanBtn.addEventListener('click', () => {
    const detected = extractPageJobData();
    capCompany.value = detected.company;
    capPosition.value = detected.position;
    capCity.value = detected.city;
    capStage.value = detected.stage;
    capDate.value = detected.applicationDate;

    // 显示网页标题作为参考，帮助用户快速修正
    const pageTitle = document.title || '';
    capTitleText.textContent = pageTitle;
    capTitleHint.title = `点击复制: ${pageTitle}`;

    captureForm.classList.remove('hidden');

    // 自动聚焦公司名称输入框，方便快速修正
    setTimeout(() => capCompany.focus(), 50);
  });

  // 点击标题参考栏 -> 复制到剪贴板
  capTitleHint.addEventListener('click', () => {
    const title = capTitleText.textContent || '';
    if (title && navigator.clipboard) {
      navigator.clipboard.writeText(title).then(() => {
        showToast('📋 网页标题已复制到剪贴板');
      }).catch(() => {});
    }
  });

  capCancelBtn.addEventListener('click', () => {
    captureForm.classList.add('hidden');
  });

  // 保存投递记录
  capSaveBtn.addEventListener('click', async () => {
    const record = {
      company: capCompany.value.trim() || '待确认公司',
      position: capPosition.value.trim() || '待确认岗位',
      city: capCity.value.trim(),
      stage: capStage.value,
      applicationDate: capDate.value || new Date().toISOString().slice(0, 10),
      applicationUrl: location.href,
      recentSchedule: '已完成网申投递',
      nextAction: '关注招聘动态与邮件通知'
    };

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'SAVE_JOB_RECORD', record }, (res) => {
        if (res && res.ok) {
          showToast(`🎉 已收录: ${record.company} - ${record.position}`);
          captureForm.classList.add('hidden');
        } else {
          showToast(`保存失败: ${res?.message || '未知错误'}`);
        }
      });
    } else {
      showToast('扩展连接不可用');
    }
  });

  // ================= 智能一键自动填充表单引擎 (深度适配北森/Moka/大易/用友/24Talent/大厂门户) =================
  const AUTOFILL_FIELD_SYNONYMS = [
    // 1. 姓名与基本信息
    { keys: ['姓名', '中文名', '真实姓名'], patterns: [/^姓\s*名$/, /^中文名$/, /^真实姓名$/, /^name$/i, /^applicant\s*name$/i, /^xm$/i, /^real_?name$/i, /姓名/i, /中文名/i] },
    { keys: ['姓氏', '姓'], patterns: [/^姓\s*氏$/, /^姓$/, /^last\s*name$/i, /^surname$/i, /^family\s*name$/i, /^xing$/i] },
    { keys: ['名字', '名'], patterns: [/^名\s*字$/, /^名$/, /^first\s*name$/i, /^given\s*name$/i, /^ming$/i] },
    { keys: ['英文名', '拼音'], patterns: [/^英文名$/, /^拼音$/, /^english\s*name$/i, /^pinyin$/i] },
    { keys: ['性别'], patterns: [/^性\s*别$/, /^gender$/i, /^sex$/i, /^xb$/i, /性别/i] },
    { keys: ['民族'], patterns: [/^民\s*族$/, /^nationality$/i, /^ethnicity$/i, /^nation$/i, /^mz$/i, /民族/i] },
    { keys: ['政治面貌', '政治'], patterns: [/^政治面貌$/, /^政治$/, /^political\s*status$/i, /^political$/i, /^zzmm$/i, /政治面貌/i] },
    { keys: ['婚姻状况'], patterns: [/^婚姻状况$/, /^婚姻$/, /^marital\s*status$/i, /^hyzk$/i, /婚姻/i] },
    { keys: ['健康状况'], patterns: [/^健康状况$/, /^健康$/, /^health\s*status$/i, /^health$/i, /^jkzk$/i, /健康/i] },
    { keys: ['身高'], patterns: [/^身\s*高$/, /^height$/i, /^sg$/i] },
    { keys: ['体重'], patterns: [/^体\s*重$/, /^weight$/i, /^tz$/i] },

    // 2. 出生日期与年龄
    { keys: ['标准出生日期', '出生日期', '出生年月', '生日'], patterns: [/^出生日期$/, /^出生年月$/, /^生\s*日$/, /^birthday$/i, /^birth\s*date$/i, /^csrq$/i, /^csny$/i, /出生日期/i, /出生年月/i, /生日/i] },
    { keys: ['出生年份', '出生年'], patterns: [/^出生年份$/, /^出生年$/, /^birth\s*year$/i, /^csnf$/i] },
    { keys: ['出生月份', '出生月'], patterns: [/^出生月份$/, /^出生月$/, /^birth\s*month$/i, /^csyf$/i] },
    { keys: ['出生日', '出生号'], patterns: [/^出生日$/, /^出生号$/, /^birth\s*day$/i] },

    // 3. 证件信息
    { keys: ['证件类型', '证件名称'], patterns: [/^证件类型$/, /^证件名称$/, /^id\s*type$/i, /^certificate\s*type$/i, /^card\s*type$/i, /证件类型/i] },
    { keys: ['证件号码', '身份证号', '身份证', '证件号'], patterns: [/^身份证(?:号(?:码)?)?$/, /^证件号码$/, /^证件号$/, /^id\s*card$/i, /^id\s*number$/i, /^sfz$/i, /^zjhm$/i, /身份证/i, /证件号/i] },

    // 4. 联系方式
    { keys: ['手机', '联系电话', '手机号', '电话'], patterns: [/^手\s*机(?:号(?:码)?)?$/, /^联系电话$/, /^移动电话$/, /^phone(?:\s*number)?$/i, /^mobile$/i, /^tel$/i, /^sjh$/i, /^lxdh$/i, /手机号?/i, /联系电话/i] },
    { keys: ['邮箱', '电子邮箱', 'Email', 'E-mail'], patterns: [/^电子邮箱$/, /^邮\s*箱$/, /^e-?mail(?:\s*address)?$/i, /^yx$/i, /^dzyx$/i, /邮箱/i, /e-?mail/i] },
    { keys: ['微信号', '微信'], patterns: [/^微\s*信(?:号)?$/, /^wechat(?:\s*id)?$/i, /^wx$/i, /^weixin$/i, /微信号?/i, /wechat/i] },
    { keys: ['QQ号', 'QQ'], patterns: [/^qq(?:\s*号)?$/i] },

    // 5. 紧急联系人
    { keys: ['紧急联系人姓名', '紧急联系人'], patterns: [/^紧急联系人(?:姓名)?$/, /^emergency\s*contact(?:\s*name)?$/i, /^jjlxr$/i, /紧急联系人/i] },
    { keys: ['紧急联系人电话', '紧急联系人手机'], patterns: [/^紧急联系人(?:电话|手机)$/, /^emergency\s*(?:phone|tel|mobile)$/i, /^jjlxrdh$/i, /紧急联系人电话/i] },
    { keys: ['紧急联系人关系'], patterns: [/^紧急联系人关系$/, /^与本人关系$/, /^emergency\s*relation$/i, /^jjlxrgx$/i, /紧急联系人关系/i] },

    // 6. 地址与籍贯
    { keys: ['现居省份'], patterns: [/^现居省份$/, /^现住省份$/, /^居住省份$/, /^current\s*province$/i] },
    { keys: ['现居城市', '当前城市', '居住地', '现居地'], patterns: [/^现居(?:地|城市)?$/, /^居住(?:地|城市)?$/, /^当前城市$/, /^现住址$/, /^现住地$/, /^current\s*city$/i, /^live_?city$/i, /现居/i, /居住地/i] },
    { keys: ['通讯地址', '现居详细地址', '详细地址', '家庭住址'], patterns: [/^通讯地址$/, /^详细地址$/, /^现居详细地址$/, /^家庭住址$/, /^联系地址$/, /^address$/i, /^detail\s*address$/i, /^txdz$/i, /通讯地址/i, /详细地址/i] },
    { keys: ['籍贯省份'], patterns: [/^籍贯省份$/, /^户籍省份$/, /^native\s*province$/i] },
    { keys: ['籍贯城市', '籍贯', '户籍地', '户口所在地'], patterns: [/^籍\s*贯$/, /^户\s*籍(?:所在地)?$/, /^户口所在地$/, /^家乡$/, /^native\s*place$/i, /^hukou$/i, /^jg$/i, /籍贯/i, /户籍/i] },
    { keys: ['邮政编码', '邮编'], patterns: [/^邮政编码$/, /^邮\s*编$/, /^zip\s*code$/i, /^postcode$/i, /^yzbm$/i, /邮编/i] },

    // 7. 求职意向与招聘偏好
    { keys: ['求职意向', '意向岗位', '期望岗位', '期望职位'], patterns: [/^求职意向$/, /^意向岗位$/, /^期望岗位$/, /^期望职位$/, /^应聘职位$/, /^intended\s*position$/i, /^target\s*job$/i, /^qzyx$/i, /求职意向/i, /期望岗位/i] },
    { keys: ['期望工作地点', '期望城市', '意向城市'], patterns: [/^期望(?:工作)?(?:地点|城市)$/, /^意向(?:地点|城市)$/, /^expected\s*city$/i, /^work\s*city$/i, /^qwdd$/i, /期望工作地点/i, /期望城市/i] },
    { keys: ['期望薪资', '期望薪酬'], patterns: [/^期望薪[资酬]$/, /^expected\s*salary$/i, /^salary$/i, /^qwxz$/i] },
    { keys: ['到岗时间', '最快到岗'], patterns: [/^到岗时间$/, /^最快到岗$/, /^入职时间$/, /^available\s*time$/i, /^dgsj$/i, /到岗时间/i] },
    { keys: ['是否接受调剂', '调剂'], patterns: [/^是否(?:接受)?调剂$/, /^服从调剂$/, /^accept\s*transfer$/i, /^sftj$/i, /调剂/i] },
    { keys: ['招聘渠道', '信息来源'], patterns: [/^招聘(?:信息)?渠道$/, /^信息来源$/, /^了解渠道$/, /^recruitment\s*channel$/i, /^source$/i, /招聘渠道/i, /信息来源/i] },
    { keys: ['求职状态'], patterns: [/^求职状态$/, /^当前状态$/, /^job\s*status$/i] },

    // 8. 教育经历 (最高学历/当前学历)
    { keys: ['学校', '毕业院校', '就读学校', '最高学历学校'], patterns: [/^毕业院校$/, /^就读学校$/, /^毕业学校$/, /^学\s*校$/, /^最高学历学校$/, /^university$/i, /^school$/i, /^college$/i, /^byxx$/i, /^jdxx$/i, /毕业院校/i, /就读学校/i, /毕业学校/i] },
    { keys: ['学院', '院系', '所学学院', '最高学历学院'], patterns: [/^学\s*院$/, /^院\s*系$/, /^所学学院$/, /^department$/i, /^faculty$/i, /^xy$/i, /学院/i, /院系/i] },
    { keys: ['专业', '所学专业', '专业名称', '最高学历专业'], patterns: [/^所学专业$/, /^专业名称$/, /^专\s*业$/, /^major$/i, /^profession$/i, /^zy$/i, /^sxzy$/i, /所学专业/i, /专业名称/i] },
    { keys: ['学历', '最高学历', '学历层次'], patterns: [/^最高学历$/, /^学\s*历$/, /^学历层次$/, /^education$/i, /^edu\s*level$/i, /^xl$/i, /^zgxl$/i, /最高学历/i, /学历/i] },
    { keys: ['学位', '最高学位'], patterns: [/^最高学位$/, /^学\s*位$/, /^degree$/i, /^academic\s*degree$/i, /^xw$/i, /学位/i] },
    { keys: ['培养方式', '学历类别', '学习形式'], patterns: [/^培养方式$/, /^学历类别$/, /^学习形式$/, /^教育类型$/, /^study\s*mode$/i, /^pyfs$/i, /培养方式/i, /学历类别/i] },
    { keys: ['入学年份', '入学年'], patterns: [/^入学年份$/, /^入学年$/, /^start\s*year$/i, /^enroll\s*year$/i, /^rxnf$/i] },
    { keys: ['入学月份', '入学月'], patterns: [/^入学月份$/, /^入学月$/, /^start\s*month$/i, /^enroll\s*month$/i, /^rxyf$/i] },
    { keys: ['入学时间', '入学年月'], patterns: [/^入学(?:时间|年月|日期)$/, /^开始(?:时间|年月)$/, /^enroll\s*date$/i, /^start\s*date$/i, /^rxsj$/i, /入学时间/i] },
    { keys: ['毕业年份', '毕业年'], patterns: [/^毕业年份$/, /^毕业年$/, /^预计毕业年(?:份)?$/, /^grad\s*year$/i, /^bynf$/i] },
    { keys: ['毕业月份', '毕业月'], patterns: [/^毕业月份$/, /^毕业月$/, /^预计毕业月(?:份)?$/, /^grad\s*month$/i, /^byyf$/i] },
    { keys: ['毕业时间', '毕业年月'], patterns: [/^毕业(?:时间|年月|日期)$/, /^预计毕业(?:时间|年月|日期)$/, /^结束(?:时间|年月)$/, /^grad\s*date$/i, /^end\s*date$/i, /^bysj$/i, /毕业时间/i] },
    { keys: ['导师', '指导老师'], patterns: [/^导\s*师$/, /^指导老师$/, /^advisor$/i, /^supervisor$/i, /^ds$/i, /导师/i] },
    { keys: ['成绩排名', '专业排名'], patterns: [/^成绩排名$/, /^专业排名$/, /^年级排名$/, /^major\s*ranking$/i, /^ranking$/i, /^cjpm$/i, /排名/i] },
    { keys: ['GPA', '平均绩点'], patterns: [/^gpa$/i, /^平均绩点$/, /^平均学分绩点$/, /^grade\s*point$/i, /^jd$/i] },

    // 9. 语言能力与技能证书
    { keys: ['英语水平', '英语等级', '外语水平'], patterns: [/^英语水平$/, /^外语水平$/, /^英语等级$/, /^english\s*level$/i, /^yysp$/i, /^yydj$/i, /英语水平/i, /英语等级/i] },
    { keys: ['英语分数', '英语成绩', '四六级成绩'], patterns: [/^英语(?:成绩|分数)$/, /^四六级(?:成绩|分数)$/, /^cet(?:-?[46])?(?:成绩|分数)$/i, /^english\s*score$/i, /^yycj$/i, /英语成绩/i, /英语分数/i] },
    { keys: ['计算机水平', '计算机等级'], patterns: [/^计算机水平$/, /^计算机等级$/, /^computer\s*level$/i, /^jsjsp$/i] },
    { keys: ['专业技能', '技能评价', 'IT技能', '技能'], patterns: [/^专业技能$/, /^技能评价$/, /^IT技能$/, /^技\s*能$/, /^skills?$/i, /^zyjn$/i, /专业技能/i, /技能/i] },

    // 10. 实习与工作经历
    { keys: ['实习单位', '实习公司', '单位', '公司', '工作单位'], patterns: [/^实习单位$/, /^工作单位$/, /^实习公司$/, /^单位名称$/, /^公司名称$/, /^单位$/, /^公\s*司$/, /^company$/i, /^employer$/i, /^sxdw$/i, /实习单位/i, /工作单位/i, /公司名称/i] },
    { keys: ['实习部门', '部门'], patterns: [/^实习部门$/, /^部\s*门$/, /^department$/i, /^sxbm$/i] },
    { keys: ['实习岗位', '岗位', '职位'], patterns: [/^实习岗位$/, /^工作岗位$/, /^职\s*位$/, /^岗\s*位$/, /^position$/i, /^job\s*title$/i, /^sxgw$/i] },
    { keys: ['岗位职责', '主要工作', '工作内容', '工作描述'], patterns: [/^岗位职责$/, /^主要工作$/, /^工作内容$/, /^工作描述$/, /^实习内容$/, /^responsibilities$/i, /^job\s*description$/i, /^gznr$/i, /^gwzz$/i, /岗位职责/i, /工作内容/i] },

    // 11. 项目经历
    { keys: ['项目名称'], patterns: [/^项目名称$/, /^project\s*name$/i, /^xmmc$/i, /项目名称/i] },
    { keys: ['项目角色'], patterns: [/^项目角色$/, /^担任职务$/, /^project\s*role$/i, /^xmjs$/i, /项目角色/i] },
    { keys: ['主要工作', '项目描述', '项目职责'], patterns: [/^项目描述$/, /^项目职责$/, /^主要工作$/, /^项目主要工作$/, /^project\s*description$/i, /^xmms$/i, /项目描述/i, /项目职责/i] },

    // 12. 自我评价与开放问答
    { keys: ['自我评价', '个人评价', '个人简介', '个人优势', '自我介绍'], patterns: [/^自我评价$/, /^个人评价$/, /^个人简介$/, /^个人优势$/, /^自我介绍$/, /^self\s*evaluation$/i, /^personal\s*summary$/i, /^zwpj$/i, /自我评价/i, /个人评价/i, /个人优势/i, /自我介绍/i] },
    { keys: ['应聘理由', '为什么选择本公司'], patterns: [/^应聘理由$/, /^求职动机$/, /^为什么选择(?:本|我|贵)公司$/, /^reason\s*for\s*applying$/i, /应聘理由/i] }
  ];

  function buildResumeFlatMap(resume) {
    const flatMap = {};
    if (!resume || typeof resume !== 'object') return flatMap;

    // 1. 先将原数据所有已有键值存入 (支持用户自定义字段)
    for (const [sectionName, sectionData] of Object.entries(resume)) {
      if (!sectionData) continue;
      if (Array.isArray(sectionData)) {
        sectionData.forEach((item, idx) => {
          if (item && typeof item === 'object') {
            for (const [k, v] of Object.entries(item)) {
              if (k.startsWith('_') || v === undefined || v === null || v === '') continue;
              const strVal = String(v).trim();
              if (idx === 0 && !flatMap[k]) flatMap[k] = strVal;
              flatMap[`${k}_${idx}`] = strVal;
            }
          }
        });
      } else if (typeof sectionData === 'object') {
        for (const [k, v] of Object.entries(sectionData)) {
          if (v === undefined || v === null || v === '') continue;
          flatMap[k] = String(v).trim();
        }
      }
    }

    // 2. 智能衍生与字段拆解 (Zero configuration, automatically derived)
    
    // ① 姓名拆解 (姓 / 名 / 英文名 / 拼音)
    const fullName = flatMap['姓名'] || flatMap['中文名'] || '';
    if (fullName) {
      if (fullName.length === 2) {
        flatMap['姓氏'] = flatMap['姓'] = fullName[0];
        flatMap['名字'] = flatMap['名'] = fullName[1];
      } else if (fullName.length >= 3) {
        const compoundSurnames = ['欧阳', '司马', '上官', '诸葛', '皇甫', '令狐', '慕容', '宇文', '司徒', '端木'];
        const isCompound = compoundSurnames.some(s => fullName.startsWith(s));
        if (isCompound && fullName.length >= 3) {
          flatMap['姓氏'] = flatMap['姓'] = fullName.slice(0, 2);
          flatMap['名字'] = flatMap['名'] = fullName.slice(2);
        } else {
          flatMap['姓氏'] = flatMap['姓'] = fullName[0];
          flatMap['名字'] = flatMap['名'] = fullName.slice(1);
        }
      }
      if (!flatMap['英文名'] && !flatMap['拼音']) {
        flatMap['拼音'] = fullName;
      }
    }

    // ② 出生年月拆解 (年 / 月 / 日 / 完整格式)
    const birthday = flatMap['出生年月'] || flatMap['出生日期'] || flatMap['生日'] || '';
    if (birthday) {
      const m = birthday.match(/(\d{4})[^\d]?(\d{1,2})?(?:[^\d]?(\d{1,2}))?/);
      if (m) {
        flatMap['出生年份'] = flatMap['出生年'] = m[1];
        if (m[2]) {
          flatMap['出生月份'] = flatMap['出生月'] = m[2].padStart(2, '0');
          flatMap['出生月份_无零'] = String(parseInt(m[2], 10));
        }
        if (m[3]) {
          flatMap['出生日'] = flatMap['出生号'] = m[3].padStart(2, '0');
        } else {
          flatMap['出生日'] = '01';
        }
        flatMap['标准出生日期'] = `${flatMap['出生年']}-${flatMap['出生月'] || '01'}-${flatMap['出生日'] || '01'}`;
      }
    }

    // ③ 身份证与证件
    const idCard = flatMap['身份证'] || flatMap['身份证号'] || flatMap['证件号'] || '';
    if (idCard) {
      flatMap['证件类型'] = '居民身份证';
      flatMap['证件名称'] = '身份证';
      flatMap['证件号码'] = idCard;
      if (!birthday && idCard.length === 18) {
        const idYear = idCard.slice(6, 10);
        const idMonth = idCard.slice(10, 12);
        const idDay = idCard.slice(12, 14);
        flatMap['出生年'] = idYear;
        flatMap['出生月'] = idMonth;
        flatMap['出生日'] = idDay;
        flatMap['出生年月'] = `${idYear}-${idMonth}`;
        flatMap['标准出生日期'] = `${idYear}-${idMonth}-${idDay}`;
      }
    }

    // ④ 现居地与籍贯拆解 (省 / 市 / 区 / 详细地址)
    const currentLoc = flatMap['现居地'] || flatMap['居住地'] || flatMap['现住址'] || flatMap['当前城市'] || '';
    if (currentLoc) {
      const pMatch = currentLoc.match(/(.+?省|.+?自治区|北京市|上海市|天津市|重庆市)/);
      if (pMatch) flatMap['现居省份'] = pMatch[1];
      const cMatch = currentLoc.match(/(.+?市|.+?地区|.+?自治州)/);
      if (cMatch) flatMap['现居城市'] = cMatch[1];
      flatMap['现居详细地址'] = currentLoc;
      flatMap['通讯地址'] = currentLoc;
      flatMap['家庭住址'] = currentLoc;
    }

    const nativePlace = flatMap['籍贯'] || flatMap['户籍'] || flatMap['户口所在地'] || '';
    if (nativePlace) {
      const npMatch = nativePlace.match(/(.+?省|.+?自治区|北京市|上海市|天津市|重庆市)/);
      if (npMatch) flatMap['籍贯省份'] = npMatch[1];
      const ncMatch = nativePlace.match(/(.+?市|.+?地区)/);
      if (ncMatch) flatMap['籍贯城市'] = ncMatch[1];
      flatMap['户口所在地'] = nativePlace;
      flatMap['户籍地'] = nativePlace;
    }

    // ⑤ 紧急联系人拆解 (姓名 / 电话 / 关系)
    const emContact = flatMap['紧急联系人'] || '';
    if (emContact) {
      const phoneM = emContact.match(/(1[3-9]\d{9})/);
      if (phoneM) flatMap['紧急联系人电话'] = flatMap['紧急联系人手机'] = phoneM[1];
      const nameM = emContact.replace(/(1[3-9]\d{9})|[\(\)（）\s,，]/g, '').trim();
      if (nameM) flatMap['紧急联系人姓名'] = nameM;
      flatMap['紧急联系人关系'] = /父|母|爸|妈|家/.test(emContact) ? '父母' : '亲属';
    }

    // ⑥ 英语水平与分数拆解
    const english = flatMap['英语水平'] || flatMap['外语水平'] || '';
    if (english) {
      if (/cet-?6|六级/i.test(english)) {
        flatMap['英语等级'] = '大学英语六级(CET-6)';
        flatMap['英语六级'] = 'CET-6';
      } else if (/cet-?4|四级/i.test(english)) {
        flatMap['英语等级'] = '大学英语四级(CET-4)';
        flatMap['英语四级'] = 'CET-4';
      }
      const scoreM = english.match(/(\d{3})/);
      if (scoreM) {
        flatMap['英语分数'] = flatMap['英语成绩'] = scoreM[1];
        flatMap['四六级成绩'] = scoreM[1];
      }
    }

    // ⑦ 教育经历深度拆解 (支持硕士/本科多段，入学/毕业年/月分离)
    const eduList = Array.isArray(resume['教育经历']) ? resume['教育经历'] : [];
    eduList.forEach((edu, idx) => {
      const prefix = idx === 0 ? '最高学历' : (idx === 1 ? '本科' : `教育${idx}`);
      const school = edu['学校'] || '';
      const major = edu['专业'] || '';
      const degree = edu['学历'] || '';
      const start = edu['开始时间'] || edu['开始年月'] || '';
      const end = edu['结束时间'] || edu['结束年月'] || '';

      if (school) {
        flatMap[`${prefix}学校`] = school;
        if (idx === 0) {
          flatMap['学校'] = flatMap['毕业院校'] = flatMap['就读学校'] = school;
        }
      }
      if (major) {
        flatMap[`${prefix}专业`] = major;
        if (idx === 0) flatMap['专业'] = flatMap['所学专业'] = major;
      }
      if (degree) {
        flatMap[`${prefix}学历`] = degree;
        if (idx === 0) {
          flatMap['学历'] = flatMap['最高学历'] = degree;
          flatMap['学位'] = /硕士|研究生/.test(degree) ? '硕士' : (/博士/.test(degree) ? '博士' : '学士');
        }
      }
      if (start) {
        const sm = start.match(/(\d{4})[^\d]?(\d{1,2})?/);
        if (sm) {
          flatMap[`${prefix}入学年份`] = flatMap[`${prefix}入学年`] = sm[1];
          if (sm[2]) flatMap[`${prefix}入学月份`] = sm[2].padStart(2, '0');
          if (idx === 0) {
            flatMap['入学年份'] = flatMap['入学年'] = sm[1];
            if (sm[2]) flatMap['入学月份'] = flatMap['入学月'] = sm[2].padStart(2, '0');
            flatMap['入学时间'] = flatMap['入学年月'] = start;
          }
        }
      }
      if (end) {
        const em = end.match(/(\d{4})[^\d]?(\d{1,2})?/);
        if (em) {
          flatMap[`${prefix}毕业年份`] = flatMap[`${prefix}毕业年`] = em[1];
          if (em[2]) flatMap[`${prefix}毕业月份`] = em[2].padStart(2, '0');
          if (idx === 0) {
            flatMap['毕业年份'] = flatMap['毕业年'] = em[1];
            if (em[2]) flatMap['毕业月份'] = flatMap['毕业月'] = em[2].padStart(2, '0');
            flatMap['毕业时间'] = flatMap['毕业年月'] = end;
          }
        }
      }
    });

    // ⑧ 常见网申系统默认值预设 (Default fallbacks for ATS)
    if (!flatMap['民族']) flatMap['民族'] = '汉族';
    if (!flatMap['婚姻状况']) flatMap['婚姻状况'] = '未婚';
    if (!flatMap['政治面貌']) flatMap['政治面貌'] = '共青团员';
    if (!flatMap['健康状况']) flatMap['健康状况'] = '健康';
    if (!flatMap['培养方式']) flatMap['培养方式'] = flatMap['学历类别'] = flatMap['学习形式'] = '全日制统招';
    if (!flatMap['是否接受调剂']) flatMap['是否接受调剂'] = flatMap['调剂'] = '服从';
    if (!flatMap['到岗时间']) flatMap['到岗时间'] = flatMap['最快到岗'] = '随时';
    if (!flatMap['求职状态']) flatMap['求职状态'] = '应届生';
    if (!flatMap['邮政编码']) flatMap['邮政编码'] = flatMap['邮编'] = '100000';
    if (!flatMap['招聘渠道']) flatMap['招聘渠道'] = flatMap['信息来源'] = '官方校园招聘网站';
    if (!flatMap['期望工作地点']) flatMap['期望工作地点'] = flatMap['期望城市'] = flatMap['现居城市'] || '全国';
    if (!flatMap['应聘理由']) flatMap['应聘理由'] = '对贵公司的业务前景与团队氛围高度认同，自身专业技能与岗位需求高度匹配。';

    return flatMap;
  }

  function extractFieldLabel(el) {
    if (!el) return '';
    const candidates = [];

    // 1. ATS 专属属性直锁 (Moka, Beisen, Dayee, Yonyou, 24Talent)
    const atsAttrs = [
      'data-key', 'data-field-name', 'data-name', 'data-title', 'data-label',
      'prop', 'data-prop', 'name', 'id', 'aria-label', 'placeholder', 'title'
    ];
    for (const attr of atsAttrs) {
      const v = el.getAttribute ? el.getAttribute(attr) : null;
      if (v && typeof v === 'string' && v.length >= 2 && v.length <= 40) {
        candidates.push(v);
      }
    }

    // 2. label[for=id]
    if (el.id) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl && lbl.innerText) candidates.push(lbl.innerText);
      } catch (_) {}
    }

    // 3. aria-labelledby
    const labelledBy = el.getAttribute ? el.getAttribute('aria-labelledby') : null;
    if (labelledBy) {
      try {
        const lbl = document.getElementById(labelledBy);
        if (lbl && lbl.innerText) candidates.push(lbl.innerText);
      } catch (_) {}
    }

    // 4. 祖先表单容器中的 label / 标题 (全面覆盖各大 ATS 类名)
    const parentContainer = el.closest ? el.closest(`
      .form-item, .form-group, .el-form-item, .ant-form-item, .semi-form-field,
      .next-form-item, .moka-form-item, .beisen-form-item, .dayee-form-item,
      .item-wrap, .field-wrap, .form-row, .form-line, tr, td,
      [class*="form-item" i], [class*="formItem" i], [class*="form-group" i],
      [class*="formGroup" i], [class*="form-field" i], [class*="formField" i]
    `) : null;
    if (parentContainer) {
      const lbl = parentContainer.querySelector(`
        label, [class*="label" i], .ant-form-item-label, .el-form-item__label,
        .semi-form-field-label, .next-form-item-label, th, [class*="title" i], [class*="name" i]
      `);
      if (lbl && lbl.innerText) {
        candidates.push(lbl.innerText);
      }
    }

    // 5. 前置兄弟节点中的文本 (如 <span>姓名:</span><input> 或 <th>毕业院校</th>)
    let prev = el.previousElementSibling;
    while (prev) {
      if (['LABEL', 'SPAN', 'DIV', 'STRONG', 'P', 'TH', 'B'].includes(prev.tagName)) {
        const txt = prev.innerText?.trim();
        if (txt && txt.length <= 30) {
          candidates.push(txt);
          break;
        }
      }
      prev = prev.previousElementSibling;
    }

    // 综合清洗提取
    for (const raw of candidates) {
      const cleaned = String(raw)
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/[*＊:：?？!！_]/g, ' ') // 剔除必填星号、下划线及标点
        .replace(/^(?:请输入|请选择|请填写|录入|填写|input|select)\s*/i, '')
        .replace(/\s*(?:必填|选填|optional|required)$/i, '')
        .trim();
      if (cleaned && cleaned.length >= 1 && cleaned.length <= 50) {
        return cleaned;
      }
    }

    return '';
  }

  function findMatchedResumeValue(label, flatMap) {
    if (!label || !flatMap) return null;
    const cleanLabel = label.trim();

    // 1. 直接精确包含或匹配 flatMap 自身的 key
    for (const [k, v] of Object.entries(flatMap)) {
      if (cleanLabel === k || cleanLabel.includes(k) || (k.length >= 2 && cleanLabel.startsWith(k))) {
        if (v) return v;
      }
    }

    // 2. 根据同义词规则库进行模式匹配
    for (const rule of AUTOFILL_FIELD_SYNONYMS) {
      let matched = false;
      for (const pat of rule.patterns) {
        if (pat.test(cleanLabel)) {
          matched = true;
          break;
        }
      }
      if (matched) {
        for (const k of rule.keys) {
          if (flatMap[k]) {
            return flatMap[k];
          }
        }
      }
    }

    return null;
  }

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // 模拟用户真实点击
  function simulateClick(el) {
    if (!el) return;
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {}
    const rect = el.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const evtOpts = { bubbles: true, cancelable: true, view: window, clientX, clientY };

    el.dispatchEvent(new MouseEvent('mousedown', evtOpts));
    el.dispatchEvent(new MouseEvent('mouseup', evtOpts));
    el.dispatchEvent(new MouseEvent('click', evtOpts));
    if (typeof el.focus === 'function') el.focus();
  }

  // 关闭残留打开的下拉弹层
  function closeActiveDropdowns() {
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    } catch (_) {}
  }

  // 尝试匹配并点击下拉浮层中的选项
  async function pickCustomDropdownOption(targetVal) {
    if (!targetVal) return false;
    await sleep(130); // 等待下拉浮层挂载渲染

    const cleanTarget = String(targetVal).trim().toLowerCase();

    // 寻找页面上处于可见激活状态的下拉浮层容器
    const containerSelectors = [
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden)',
      '.ant-cascader-dropdown:not(.ant-cascader-dropdown-hidden)',
      '.el-select-dropdown:not([style*="display: none"])',
      '.el-popper:not([style*="display: none"])',
      '.el-cascader__dropdown:not([style*="display: none"])',
      '[role="listbox"]:not([style*="display: none"])',
      '.select-dropdown:not([style*="display: none"])',
      '.dropdown-menu:not([style*="display: none"])',
      '[class*="dropdown-menu" i]:not([style*="display: none"])',
      '[class*="dropdown-panel" i]:not([style*="display: none"])',
      '[class*="select-options" i]:not([style*="display: none"])',
      '[class*="select_dropdown" i]:not([style*="display: none"])',
      '[class*="selectDropdown" i]:not([style*="display: none"])'
    ];

    let activeDropdowns = [];
    for (const sel of containerSelectors) {
      const els = Array.from(document.querySelectorAll(sel)).filter(d => {
        if (d.closest('#autumn-job-assistant-host')) return false;
        const rect = d.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (els.length > 0) activeDropdowns.push(...els);
    }

    if (activeDropdowns.length === 0) {
      activeDropdowns = Array.from(document.querySelectorAll('[role="listbox"], [role="menu"]')).filter(d => {
        if (d.closest('#autumn-job-assistant-host')) return false;
        const rect = d.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    }

    if (activeDropdowns.length === 0) return false;

    // 获取最新激活的下拉框容器
    const dropdown = activeDropdowns[activeDropdowns.length - 1];

    // 1. 如果下拉浮层内有搜索输入框，先尝试输入过滤
    const searchInput = dropdown.querySelector('input[type="text"], input[type="search"], .ant-select-selection-search-input, .el-select__input');
    if (searchInput && !searchInput.readOnly) {
      const proto = HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(searchInput, targetVal);
      else searchInput.value = targetVal;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(150); // 等待过滤
    }

    // 2. 查找选项节点
    const optionSelectors = [
      '.ant-select-item-option-content',
      '.ant-select-item-option',
      '.ant-cascader-menu-item',
      '.el-select-dropdown__item',
      '.el-cascader-node',
      '[role="option"]',
      'li[class*="option" i]',
      'div[class*="option" i]',
      'li',
      'span'
    ];

    let optionNodes = [];
    for (const sel of optionSelectors) {
      const items = Array.from(dropdown.querySelectorAll(sel)).filter(item => {
        const txt = (item.textContent || '').trim();
        return txt.length > 0 && txt.length < 50;
      });
      if (items.length > 0) {
        optionNodes = items;
        break;
      }
    }

    // 3. 匹配选项文本
    let bestOption = null;

    // ① 精确匹配
    for (const opt of optionNodes) {
      const txt = (opt.textContent || '').trim().toLowerCase();
      if (txt === cleanTarget) {
        bestOption = opt;
        break;
      }
    }

    // ② 包含 / 被包含匹配
    if (!bestOption) {
      for (const opt of optionNodes) {
        const txt = (opt.textContent || '').trim().toLowerCase();
        if (txt.includes(cleanTarget) || (cleanTarget.length >= 2 && cleanTarget.includes(txt))) {
          bestOption = opt;
          break;
        }
      }
    }

    if (bestOption) {
      simulateClick(bestOption);
      await sleep(100);
      return true;
    }

    // 未匹配到，收起弹层
    closeActiveDropdowns();
    return false;
  }

  function setSelectFieldValue(el, targetVal) {
    if (!el || !targetVal) return false;
    const cleanTarget = String(targetVal).trim().toLowerCase();
    let matchedIndex = -1;

    for (let i = 0; i < el.options.length; i++) {
      const optText = el.options[i].text.trim().toLowerCase();
      const optVal = el.options[i].value.trim().toLowerCase();
      if (!optText && !optVal) continue;
      if (optText === cleanTarget || optVal === cleanTarget || optText.includes(cleanTarget) || (cleanTarget.length >= 2 && cleanTarget.includes(optText))) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex >= 0) {
      el.selectedIndex = matchedIndex;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  async function autoFillPageForm() {
    if (autofillBtn.disabled) return;
    const origBtnHtml = autofillBtn.innerHTML;
    autofillBtn.disabled = true;
    autofillBtn.innerHTML = `<span>⏳</span><span>正在智能填充...</span>`;

    try {
      const flatMap = buildResumeFlatMap(currentResumeData);
      if (Object.keys(flatMap).length === 0) {
        showToast('⚠️ 简历库为空，请先在看板配置简历');
        return;
      }

      let filledCount = 0;
      let skippedCount = 0;
      const processedElements = new Set();
      const processedRadios = new Set();

      // ================= 阶段 1: 常规表单项快速填充 (Input, Textarea, Select, Radio) =================
      const allElements = Array.from(document.querySelectorAll('input, textarea, select')).filter(el => {
        if (el.closest('#autumn-job-assistant-host')) return false;
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(type)) return false;
        if (el.disabled) return false;
        
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        if (el.offsetParent === null && style.position !== 'fixed') return false;

        return true;
      });

      for (const el of allElements) {
        const type = (el.getAttribute('type') || el.type || '').toLowerCase();

        // 1. 单选框 (Radio)
        if (type === 'radio') {
          const name = el.name;
          if (name && processedRadios.has(name)) continue;
          
          const label = extractFieldLabel(el);
          const val = findMatchedResumeValue(label, flatMap);
          if (val) {
            const group = name ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)) : [el];
            let checkedAny = false;
            for (const r of group) {
              const rLabel = extractFieldLabel(r);
              const rVal = r.value || '';
              if (rLabel.includes(val) || val.includes(rLabel) || rVal === val) {
                r.checked = true;
                r.dispatchEvent(new Event('change', { bubbles: true }));
                r.dispatchEvent(new Event('input', { bubbles: true }));
                checkedAny = true;
                break;
              }
            }
            if (checkedAny) {
              filledCount++;
              if (name) processedRadios.add(name);
            } else {
              skippedCount++;
            }
          }
          processedElements.add(el);
          continue;
        }

        // 2. 原生 Select 下拉框
        if (el instanceof HTMLSelectElement) {
          if (el.selectedIndex > 0 && el.value && el.value.trim() !== '') {
            skippedCount++;
            processedElements.add(el);
            continue;
          }
          const label = extractFieldLabel(el);
          const val = findMatchedResumeValue(label, flatMap);
          if (val) {
            const ok = setSelectFieldValue(el, val);
            if (ok) filledCount++;
            else skippedCount++;
          } else {
            skippedCount++;
          }
          processedElements.add(el);
          continue;
        }

        // 3. 可写 Input & Textarea
        if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !el.readOnly) {
          if (el.value && el.value.trim().length > 0) {
            skippedCount++;
            processedElements.add(el);
            continue;
          }

          const label = extractFieldLabel(el);
          const val = findMatchedResumeValue(label, flatMap);
          if (val) {
            const proto = (el instanceof HTMLTextAreaElement) ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (setter) {
              setter.call(el, val);
            } else {
              el.value = val;
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            filledCount++;
          } else {
            skippedCount++;
          }
          processedElements.add(el);
        }
      }

      // ================= 阶段 2: 现代 UI 自定义下拉选择/弹出选择控件 (AntD/Element/ATS组件) =================
      const customSelectWrappers = Array.from(document.querySelectorAll(`
        .ant-select:not(.ant-select-disabled),
        .el-select:not(.is-disabled),
        .ant-cascader:not(.ant-cascader-disabled),
        .el-cascader:not(.is-disabled),
        [role="combobox"]:not([aria-disabled="true"]),
        [aria-haspopup="listbox"]:not([disabled]),
        [aria-haspopup="true"]:not([disabled]),
        [class*="custom-select" i],
        [class*="select-trigger" i],
        [class*="select_trigger" i],
        [class*="selectTrigger" i],
        input[readonly]:not([type="hidden"]):not([type="button"])
      `)).filter(el => {
        if (el.closest('#autumn-job-assistant-host')) return false;
        if (processedElements.has(el)) return false;
        
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;

        // 检查是否已有已选择的内容（排除占位词）
        const text = (el.textContent || el.value || '').trim();
        if (text && !/^(?:请选择|选择|请选取|select|click\s*to\s*select)/i.test(text) && text.length >= 2) {
          return false;
        }

        return true;
      });

      for (const customEl of customSelectWrappers) {
        const label = extractFieldLabel(customEl);
        const val = findMatchedResumeValue(label, flatMap);
        if (val) {
          const trigger = customEl.querySelector('.ant-select-selector, .el-select__wrapper, .el-input__inner, [class*="trigger" i], input') || customEl;
          simulateClick(trigger);
          const ok = await pickCustomDropdownOption(val);
          if (ok) {
            filledCount++;
          } else {
            skippedCount++;
          }
          processedElements.add(customEl);
          await sleep(60);
        }
      }

      if (filledCount > 0) {
        showToast(`⚡ 已自动填充 ${filledCount} 项，跳过 ${skippedCount} 项`);
      } else {
        showToast(`未检测到可匹配的空白输入项 (跳过 ${skippedCount} 项)`);
      }
    } finally {
      autofillBtn.disabled = false;
      autofillBtn.innerHTML = origBtnHtml;
    }
  }

  // 绑定一键自动填充按钮
  autofillBtn.addEventListener('click', autoFillPageForm);

  // 底部直达中枢按钮
  openRecordsBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD', targetHash: '#records' });
    }
  });

  openResumeBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD', targetHash: '#resume' });
    }
  });

  // Toast 消息函数
  let toastTimer = null;
  function showToast(msg) {
    const existing = shadow.querySelector('.aja-toast');
    if (existing) existing.remove();
    if (toastTimer) clearTimeout(toastTimer);

    const t = document.createElement('div');
    t.className = 'aja-toast';
    t.textContent = msg;
    shadow.appendChild(t);

    toastTimer = setTimeout(() => {
      t.remove();
    }, 2000);
  }

  // 悬浮胶囊垂直拖拽定位
  let isDraggingToggle = false;
  let toggleStartY = 0;
  let toggleStartTop = 0;

  toggleBtn.addEventListener('mousedown', (e) => {
    isDraggingToggle = true;
    toggleStartY = e.clientY;
    toggleStartTop = toggleBtn.getBoundingClientRect().top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDraggingToggle) return;
    const dy = e.clientY - toggleStartY;
    const newTop = Math.min(Math.max(20, toggleStartTop + dy), window.innerHeight - 60);
    toggleBtn.style.top = `${newTop}px`;
  });

  document.addEventListener('mouseup', () => {
    isDraggingToggle = false;
  });

  console.log('🚀 [秋招求职与简历助手] Shadow DOM 侧边栏已挂载。按 Ctrl+Shift+F 唤起。');
})();
