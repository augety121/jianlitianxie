/** The DOM executor may report arbitrary strings. Only these fixed execution
 * signals are allowed across the trusted worker/diagnostic boundary. */
const phases=new Set(['target-check','opening','searching','choosing','writing','verification']);
const codes=new Set(['option-unavailable','target-changed','readback-failed','native-constraint']);
export function executionReceipt(value) {
  if(!value||typeof value!=='object')return {};
  return {
    ...(phases.has(value.executionPhase)?{executionPhase:value.executionPhase}:{}),
    ...(typeof value.attempted==='boolean'?{attempted:value.attempted}:{}),
    ...(codes.has(value.reasonCode)?{reasonCode:value.reasonCode}:{})
  };
}
