"""Liệt kê mọi <error>/<failure> trong báo cáo JUnit XML của Gradle test.

extract_failed_tests.py chỉ lấy test-case failed; tool này bắt thêm lỗi ở mức
suite/framework (vd Robolectric khởi tạo hỏng) vốn nằm ở <error> của testsuite.
"""
import glob
import sys
import xml.etree.ElementTree as ET

found = False
for path in sorted(glob.glob("app/build/test-results/testDebugUnitTest/**/*.xml", recursive=True)):
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        continue
    suites = [root] if root.tag == "testsuite" else root.findall("testsuite")
    for suite in suites:
        for case in suite.findall("testcase"):
            for bad in list(case.findall("failure")) + list(case.findall("error")):
                found = True
                name = f"{case.get('classname')}.{case.get('name')}"
                text = (bad.text or "").strip().splitlines()
                print(f"## {name}")
                for line in text[:25]:
                    print(line)
                print()
        for bad in suite.findall("error"):
            found = True
            print(f"## [suite error] {suite.get('name')}")
            print((bad.text or "").strip()[:2000])
            print()

if not found:
    print("(không tìm thấy <error>/<failure> nào trong XML)")
