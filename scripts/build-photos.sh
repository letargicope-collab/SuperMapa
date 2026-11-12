#!/usr/bin/env bash
# Regenera src/map/data/office-photos.ts a partir de public/fotos/*.png
# (JPEG otimizado 800x450 embutido como data URI). Requer ImageMagick (convert).
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
for f in public/fotos/*.png; do
  n=$(basename "$f" .png)
  convert "$f" -strip -resize '800x450>' -quality 72 -sampling-factor 4:2:0 -interlace none "$tmp/$n.jpg"
done
python3 - "$tmp" << 'PY'
import base64, glob, os, sys
tmp = sys.argv[1]
files = sorted(glob.glob(os.path.join(tmp, '*.jpg')))
out = ["/**",
" * Fotos dos escritórios embutidas como data URI (JPEG otimizado, 800×450).",
" *",
" * Por que embutidas: o site é publicado como um único HTML e também é aberto",
" * em pré-visualizações cujo endereço não corresponde à pasta `public/`.",
" * Com as fotos dentro do próprio arquivo, elas aparecem em qualquer contexto",
" * (GitHub Pages, preview do editor, arquivo aberto localmente), sem depender",
" * de um caminho externo `fotos/...`.",
" *",
" * Origem: `public/fotos/*.png` (repositório SuperMapa2). Para atualizar uma",
" * foto, substitua o PNG em `public/fotos/` e rode `npm run fotos`.",
" * As chaves seguem o padrão NomeDaCidade_Rua dos arquivos originais.",
" */",
"export const OFFICE_PHOTOS: Record<string, string> = {"]
for f in files:
    name = os.path.basename(f)[:-4]
    b64 = base64.b64encode(open(f,'rb').read()).decode()
    out.append(f"  {name!r}: 'data:image/jpeg;base64,{b64}',")
out += ["}", "", "/** Foto da unidade pelo nome do arquivo original (sem extensão). */",
"export function officePhoto(key: string): string | undefined {", "  return OFFICE_PHOTOS[key]", "}"]
open('src/map/data/office-photos.ts','w',encoding='utf-8').write('\n'.join(out)+'\n')
print(f'office-photos.ts: {len(files)} fotos')
PY
rm -rf "$tmp"
