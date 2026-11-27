#!/usr/bin/env python3
"""Trích testcase thất bại từ JUnit XML của Gradle — in ra stdout cho CI diag.

Dùng trong .github/workflows/ci.yml (không nhét heredoc vào YAML block scalar).
"""

import glob
import xml.etree.ElementTree as ET

count = 0
for path in sorted(glob.glob("/home/runner/work/**/test-results/**/*.xml", recursive=True)):
    try:
        root = ET.parse(path).getroot()
    except Exception:
        continue
    for tc in root.iter("testcase"):
        fail = tc.find("failure")
        if fail is None:
            fail = tc.find("error")
        if fail is None:
            continue
        count += 1
        print(f"FAIL {tc.get('classname')} :: {tc.get('name')}")
        print(f"  message: {(fail.get('message') or '')[:400]}")
        for line in (fail.text or "").strip().splitlines()[:15]:
            print("  " + line[:300])
        print()

if count:
    print(f"(tổng {count} test thất bại)")
else:
    print("(không có test nào thất bại)")
