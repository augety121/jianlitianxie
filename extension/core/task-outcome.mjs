/** Completion refers to the whole scanned target, never just the chosen subset. */
export function taskOutcome(plan,results=[],expansion={}) {
  if(!results.length)return 'no-eligible-fields';
  const done=new Map(results.map(r=>[r.id,r.status]));
  if(expansion.uncertain||expansion.decision==='consent-required'||expansion.inventory?.some(r=>r.target>0&&r.code!=='satisfied'))return 'partial';
  return plan.entries.every(e=>done.get(e.id)==='verified'||
    e.status==='preserve'&&e.reasonCode==='existing-consistent'||
    e.status==='manual'&&e.reasonCode==='restricted-control')?'completed':'partial';
}
