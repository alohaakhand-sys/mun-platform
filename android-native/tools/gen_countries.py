import re, sys
root = sys.argv[1]
s = open(root + '/src/lib/data/countries.ts', encoding='utf8').read()
rows = re.findall(r'\{\s*code:\s*"([^"]+)",\s*name:\s*"([^"]*)"\s*\}', s)
out = [
    'package com.munpro.app.domain',
    '',
    "// GENERATED from src/lib/data/countries.ts (the web registry). Regenerate, don't edit by hand:",
    '// ISO-2 lowercase codes, plus the UK constituent codes (gb-eng, ...) and Kosovo (xk).',
    '',
    'data class Country(val code: String, val name: String)',
    '',
    'val COUNTRIES: List<Country> = listOf(',
]
for c, n in rows:
    out.append('    Country("%s", "%s"),' % (c, n.replace('$', '\\$')))
out.append(')')
open(root + '/android-native/app/src/main/java/com/munpro/app/domain/CountryTable.kt', 'w', encoding='utf8', newline='\n').write('\n'.join(out) + '\n')
print(len(rows))
