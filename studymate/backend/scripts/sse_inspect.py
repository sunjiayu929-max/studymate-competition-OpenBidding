"""读 SSE 原始日志，按 agent_done 抽 output 摘要。

用法： python sse_inspect.py <log_file>
"""
import io
import json
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)


def parse(path: Path):
    text = path.read_text(encoding="utf-8")
    blocks = text.split("\n\n")
    dones = []
    for blk in blocks:
        if "event: agent_done" not in blk:
            continue
        for line in blk.splitlines():
            if line.startswith("data: "):
                dones.append(json.loads(line[len("data: "):]))
                break
    return dones


def main():
    path = Path(sys.argv[1])
    print(f"[file] {path}  size={path.stat().st_size} bytes")
    dones = parse(path)
    print(f"[agent_done count] {len(dones)}")
    print("=" * 70)
    for d in dones:
        agent = d.get("agent")
        out = d.get("output", {})
        kind = out.get("type", agent)
        title = out.get("title", "")
        print(f"\n>>> agent={agent}  type={kind}  title={title}")
        if kind == "doc":
            c = out.get("content", "")
            print(f"    content len = {len(c)}")
            print("    --- first 500 chars ---")
            print(c[:500])
            print("    --- last 200 chars ---")
            print(c[-200:])
            cites = out.get("citations", [])
            print(f"    citations count = {len(cites)}")
        elif kind == "mindmap":
            c = out.get("content", "")
            print(f"    content len = {len(c)}")
            print(c)
        elif kind == "quiz":
            items = out.get("items", [])
            print(f"    items count = {len(items)}")
            for it in items:
                print(f"    [{it.get('type')}] {it.get('question','')[:80]}")
                print(f"        answer = {str(it.get('answer'))[:80]}  difficulty={it.get('difficulty')}")
        else:  # retriever
            chunks = out.get("chunks", [])
            print(f"    retrieved {len(chunks)} chunks")
            for c in chunks[:3]:
                print(f"    - score={c.get('score'):.2f} {c.get('source')} p.{c.get('page')}")


if __name__ == "__main__":
    main()
