/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 TshyGO
 * validatePlan from TshyGO/resume-form-assistant-plugin, form-agent.js,
 * commit 386660cc736e78e4d39f73ff49f77590e5788440.
 * Function body preserved; isolated-world export wrapper added by augety121.
 * See LICENSE and SOURCE.md in this directory.
 */
(() => {
  function validatePlan(plan, candidates) {
    if (!Array.isArray(plan) || plan.length > 4) throw new Error("AI 新增计划格式无效。");
    const used = new Set();
    let total = 0;
    return plan.map(action => {
      const candidate = candidates.find(c => c.id === action?.id);
      if (!candidate || !Number.isInteger(candidate.current) || !Number.isInteger(candidate.target) || candidate.current < 0 ||
          used.has(action.id) || Object.keys(action).some(k => !["id", "count"].includes(k)) ||
          !Number.isInteger(action.count) || action.count < 1 || action.count !== candidate.target - candidate.current) {
        throw new Error("AI 计划超出允许的新增范围。");
      }
      used.add(action.id);
      total += action.count;
      if (total > 5) throw new Error("每次最多新增 5 条，请分次操作。");
      return { id: action.id, count: action.count };
    });
  }
  globalThis.__resumeRepeatPlan = Object.freeze({validatePlan});
})();
