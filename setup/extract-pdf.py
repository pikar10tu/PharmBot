# ============================================================
#  extract-pdf.py
#  PDF -> setup/guidelines/.extracted/{docId}/p{NNN}.txt (ข้อความดิบ)
#
#  วิธีใช้:
#    python extract-pdf.py                 # ทุก doc ที่ extract=pypdf
#    python extract-pdf.py --doc ccpe739_std
#    python extract-pdf.py --force         # เขียนทับ cache เดิม
#
#  doc ที่ extract=gemini จะถูกข้าม (ยังไม่ได้ทำในเฟสนี้)
#  ยังไม่ซ่อมข้อความ — lib/thai-repair.js ทำต่อตอน chunk
#
#  ต้องมี: pip install pypdf
#  (PyMuPDF ไม่ดีกว่า pypdf เลย — วัดแล้ว 2026-08-09 อย่าเสียเวลาลองซ้ำ)
# ============================================================
import argparse
import json
import os
import sys

from pypdf import PdfReader

# console ของ Windows ใช้ cp874/cp1252 -> ข้อความไทยจะเพี้ยน ต้องบังคับ UTF-8
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, 'reconfigure'):
        _stream.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
GUIDE = os.path.join(HERE, 'guidelines')
CACHE = os.path.join(GUIDE, '.extracted')


def parse_pages(spec, n_pages):
    """'10-37,52,68-70' -> [9..36, 51, 67,68,69]  (สเปกนับจาก 1 -> index นับจาก 0)"""
    if not spec:
        return list(range(n_pages))
    out = []
    for part in str(spec).split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            a, b = part.split('-', 1)
            out.extend(range(int(a) - 1, int(b)))
        else:
            out.append(int(part) - 1)
    seen = set()
    return [i for i in out if 0 <= i < n_pages and not (i in seen or seen.add(i))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--doc', help='ทำเฉพาะ docId นี้')
    ap.add_argument('--force', action='store_true', help='เขียนทับ cache เดิม')
    args = ap.parse_args()

    manifest_path = os.path.join(GUIDE, 'manifest.json')
    if not os.path.exists(manifest_path):
        print(f'\n❌  ไม่พบ {manifest_path}\n', file=sys.stderr)
        sys.exit(1)

    with open(manifest_path, encoding='utf-8') as f:
        manifest = json.load(f)

    total_pages = 0
    problems = []

    for doc in manifest['docs']:
        if args.doc and doc['id'] != args.doc:
            continue
        if doc.get('extract') != 'pypdf':
            print(f"skip {doc['id']} (extract={doc.get('extract')})")
            continue

        pdf_path = os.path.join(GUIDE, doc['file'])
        if not os.path.exists(pdf_path):
            print(f"!! ไม่พบไฟล์ {doc['file']}", file=sys.stderr)
            sys.exit(1)

        out_dir = os.path.join(CACHE, doc['id'])
        os.makedirs(out_dir, exist_ok=True)

        reader = PdfReader(pdf_path)
        idxs = parse_pages(doc.get('pages'), len(reader.pages))
        written = skipped = empty = 0

        for i in idxs:
            out_file = os.path.join(out_dir, f'p{i + 1:03d}.txt')
            if os.path.exists(out_file) and not args.force:
                skipped += 1
                continue
            try:
                text = reader.pages[i].extract_text() or ''
            except Exception as e:
                print(f'   หน้า {i + 1} แตกข้อความไม่ได้: {e}', file=sys.stderr)
                text = ''
            if not text.strip():
                empty += 1
            with open(out_file, 'w', encoding='utf-8') as f:
                f.write(text)
            written += 1

        total_pages += written
        processed = written + skipped
        flag = ''
        # หน้าว่างเยอะ = น่าจะเป็นภาพสแกน ต้องเปลี่ยนไปใช้ extract=gemini
        if written and empty > written * 0.3:
            flag = '  <-- ตรวจด่วน: หน้าว่างเยอะ อาจเป็นภาพสแกน'
            problems.append(doc['id'])
        print(f"{doc['id']:<22} {processed:>4} หน้า (เขียนใหม่ {written}, ข้าม {skipped}, ว่าง {empty}){flag}")

    print(f'\nรวมเขียนใหม่ {total_pages} หน้า -> {CACHE}')
    if problems:
        print(f'\n⚠️  ต้องตรวจ: {", ".join(problems)} — ถ้าเป็นภาพสแกนให้เปลี่ยน extract เป็น "gemini"')
        sys.exit(2)


if __name__ == '__main__':
    main()
