"""Minimal fail-closed test bundler for this repository's static named imports.
Only used in an isolated about:blank UI fixture, never shipped to the extension.
"""
from pathlib import Path
import re,json

def bundle(entry):
    modules=[];known=set()
    def visit(path):
        path=path.resolve()
        key=str(path)
        if key in known:return key
        known.add(key)
        source=path.read_text(encoding='utf-8')
        # Preserve each module's URL when embedding it in a classic-script UI fixture.
        # These fixtures do not load PDF workers; PDF byte extraction has separate tests.
        source=source.replace('import.meta.url',json.dumps(path.as_uri()))
        imp=re.compile(r"^\s*import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?",re.M)
        bindings=[]
        for match in imp.finditer(source):
            target=visit(path.parent/match[2])
            names=re.sub(r'\s+as\s+',':',match[1])
            bindings.append(f'const {{{names}}}=M[{json.dumps(target)}];')
        source=imp.sub('',source)
        exported=re.findall(r'\bexport\s+(?:async\s+)?(?:function|class|const|let)\s+(\w+)',source)
        source=re.sub(r'\bexport\s+(?=(?:async\s+)?(?:function|class|const|let)\b)','',source)
        named=re.findall(r'\bexport\s*\{([^}]+)\}\s*;?',source)
        for group in named:
            for name in group.split(','):
                name=name.strip()
                if not re.fullmatch(r'[A-Za-z_$][\w$]*',name):raise ValueError('Unsupported named test export: '+name)
                exported.append(name)
        source=re.sub(r'\bexport\s*\{[^}]+\}\s*;?','',source)
        exported=list(dict.fromkeys(exported))

        if re.search(r'^\s*(?:import|export)\s',source,re.M):raise ValueError('Unsupported test bundle syntax: '+key)
        modules.append(f'M[{json.dumps(key)}]=await(async()=>{{\n'+ '\n'.join(bindings)+'\n'+source+'\nreturn {'+','.join(exported)+'};\n})();')
        return key
    visit(Path(entry))
    return '(async()=>{const M={};\n'+'\n'.join(modules)+'\n})().catch(e=>{globalThis.__bundleError=String(e.stack||e);console.error(e);});'
