"""CodeAgent —— 代码 / 伪代码 / 硬件示例生成。

四种 code_style（来自 CourseConfig）：
- ml        → numpy + sklearn 真代码（机器学习）
- algorithm → C++17 算法实现（数据结构与算法），可直接 g++ 编译运行
- pseudo    → C 风格伪代码 + 中文注释（操作系统 / 计算机网络）
- hardware  → 汇编 / Verilog 片段 + 时序解释（计算机组成原理）

无 LLM 时按 style 走对应 mock 模板，保证演示能用。
"""
from __future__ import annotations
import asyncio
import json

from app.agents.base import AgentBase, AgentMeta, EventEmitter
from app.core.run_sandbox import format_supported_libs_for_prompt
from app.llm import get_llm_client, has_llm_key


class CodeAgent(AgentBase):
    meta = AgentMeta(
        id="code",
        name="代码 Agent",
        icon="💻",
        color="violet",
        description="按课程风格生成代码/伪代码/硬件示例",
    )

    async def run(self, context: dict, emit: EventEmitter) -> dict:
        topic = context.get("topic", "机器学习")
        profile = context.get("profile", {})
        course_cfg = context.get("course_cfg")
        course_name = context.get("course_name", "机器学习")
        persona = course_cfg.persona if course_cfg else f"{course_name}课程助教"
        style = course_cfg.code_style if course_cfg else "ml"
        libs = course_cfg.code_libs if course_cfg else ["numpy", "sklearn"]

        if not has_llm_key():
            payload = self._mock_payload(topic, style, course_name)
        else:
            try:
                payload = await self._gen_real(topic, profile, persona, course_name, style, libs)
                if not payload.get("code"):
                    raise ValueError("empty code")
            except Exception:
                payload = self._mock_payload(topic, style, course_name)

        # 模拟代码 typing 流式
        snippet = payload["code"][:200]
        for ch in snippet:
            await self.emit_delta(emit, ch, kind="text")
            await asyncio.sleep(0.005)

        return {
            "type": "code",
            "title": f"《{topic}》代码案例",
            "language": payload.get("language", "python"),
            "filename": payload.get("filename", "example.py"),
            "code": payload["code"],
            "explanation": payload.get("explanation", ""),
            "expected_output": payload.get("expected_output", ""),
        }

    async def _gen_real(
        self,
        topic: str,
        profile: dict,
        persona: str,
        course_name: str,
        style: str,
        libs: list[str],
    ) -> dict:
        llm = get_llm_client()
        # 按画像挑难度等级（仅 ml 风格用）
        kb = profile.get("knowledge_base", {}) if profile else {}
        prog = kb.get("programming", 3) if isinstance(kb, dict) else 3

        # ===== 按 style 装不同 prompt =====
        if style == "ml":
            if prog <= 2:
                level_hint = "**最小可运行版本**：纯 numpy，控制在 25 行内，每行加注释"
            elif prog >= 4:
                level_hint = "**完整工程版本**：pandas/sklearn + matplotlib 可视化，40-60 行，体现最佳实践"
            else:
                level_hint = "**中等版本**：numpy 实现核心 + sklearn 对比验证，30-40 行"
            sandbox_libs = format_supported_libs_for_prompt()
            style_rules = f"""1. {level_hint}
2. 代码**无外部数据依赖**：自己造数据（np.random）或用 sklearn.datasets.make_*
3. 可直接 `python file.py` 运行；只允许使用在线沙箱已支持库：{sandbox_libs}
4. matplotlib 无 GUI：不要依赖 plt.show() 弹窗；关键结果用 print 输出；可写 plt.savefig 但不保证前端展示图片
5. 优先使用：{', '.join(libs)}（且必须落在沙箱白名单内）"""
            lang = "python"
            fname = "example.py"

        elif style == "algorithm":
            style_rules = f"""1. **C++17 实现**，可直接 `g++ -std=c++17` 编译运行；优先用 STL（vector / unordered_map / priority_queue / deque / algorithm 等），可 `#include <bits/stdc++.h>`
2. 代码必须 self-contained：含 `int main()` 跑一个小例子，用 std::cout 打印结果
3. 关键函数上方注释写时间/空间复杂度
4. 风格 {'简洁 30 行内' if prog <= 2 else '完整 40-60 行 + 边界处理'}
5. 优先使用：{', '.join(libs)}"""
            lang = "cpp"
            fname = "algorithm.cpp"

        elif style == "pseudo":
            sandbox_libs = format_supported_libs_for_prompt()
            style_rules = f"""1. **C 风格伪代码** + 中文注释（不要求真能编译，重在表达逻辑）
2. 关键步骤用 // 注释标出"为什么这样做"
3. 必要时附时序图或状态转移说明（Markdown 注释）
4. 复杂度 / 边界情况要点写在文件顶部块注释
5. 若附带可运行 Python 片段：仅允许标准库（如 socket/json/struct）或沙箱白名单第三方库（{sandbox_libs}）；禁止未安装第三方库
6. 优先使用：{', '.join(libs)}"""
            lang = "c"
            fname = f"{topic.replace(' ', '_')}.pseudo.c"

        elif style == "hardware":
            style_rules = f"""1. **汇编片段（RISC-V 优先）/ Verilog 简单模块 / 时序图 三选一最合适的**
2. 每行汇编/Verilog 加中文注释
3. 必要时附真值表 / 状态机说明（写成代码注释或 Markdown 块）
4. 文件名根据语言选择：`.s`（汇编） / `.v`（Verilog） / `.md`（仅时序图）
5. 优先使用：{', '.join(libs)}"""
            lang = "asm"
            fname = f"{topic.replace(' ', '_')}.s"
        else:
            # 兜底走 ml
            sandbox_libs = format_supported_libs_for_prompt()
            style_rules = f"1. 仅使用沙箱白名单库生成真代码 30 行内：{sandbox_libs}"
            lang = "python"
            fname = "example.py"

        sys = f"""你是一位{persona}，为学生生成《{course_name}》课程下「{topic}」的代码/示例。

输出**严格 JSON**（不要 Markdown 包裹）：
{{
  "language": "{lang}（python / cpp / c / asm / verilog 之一）",
  "filename": "snake_case 文件名，带正确后缀",
  "code": "完整代码字符串（用 \\n 转义换行）",
  "explanation": "80字内说明这段代码做了什么、关键点在哪",
  "expected_output": "运行/执行后的预期表现，30字内"
}}

风格要求（{style}）：
{style_rules}

**语言要求（必须严格遵守）**：
- explanation 和 expected_output 必须使用**简体中文**
- 代码内的注释（# 或 //）必须使用**简体中文**
- 代码标识符（变量名 / 函数名 / 类名）保留英文
- 即使输入主题是英文（如 "K-Means"），所有说明文字和代码注释都必须用简体中文

学生画像：{json.dumps(profile, ensure_ascii=False)}

不要输出 Markdown 包裹符号 / 多余文字。
"""
        msgs = [{"role": "system", "content": sys}, {"role": "user", "content": f"主题：{topic}"}]
        raw = await llm.chat_structured(messages=msgs, temperature=0.4)
        data = json.loads(raw)
        return {
            "language": str(data.get("language", lang)),
            "filename": str(data.get("filename", fname))[:60],
            "code": str(data.get("code", "")),
            "explanation": str(data.get("explanation", ""))[:200],
            "expected_output": str(data.get("expected_output", ""))[:120],
        }

    # ============ Mock 模板：四个风格各一份 ============

    def _mock_payload(self, topic: str, style: str, course_name: str) -> dict:
        if style == "algorithm":
            return self._mock_algorithm(topic)
        if style == "pseudo":
            return self._mock_pseudo(topic, course_name)
        if style == "hardware":
            return self._mock_hardware(topic)
        return self._mock_ml(topic)

    def _mock_ml(self, topic: str) -> dict:
        return {
            "language": "python",
            "filename": "gradient_descent_demo.py",
            "code": (
                "import numpy as np\n\n"
                "# 1. 造一组带噪声的线性数据：y = 2x + 1 + noise\n"
                "rng = np.random.default_rng(42)\n"
                "X = rng.uniform(-3, 3, 200)\n"
                "y = 2 * X + 1 + rng.normal(0, 0.5, 200)\n\n"
                "# 2. 手写梯度下降\n"
                "w, b, lr = 0.0, 0.0, 0.05\n"
                "for step in range(300):\n"
                "    y_hat = w * X + b\n"
                "    dw = -2 * np.mean(X * (y - y_hat))\n"
                "    db = -2 * np.mean(y - y_hat)\n"
                "    w -= lr * dw\n"
                "    b -= lr * db\n"
                "    if step % 50 == 0:\n"
                "        loss = np.mean((y - y_hat) ** 2)\n"
                "        print(f\"step={step} loss={loss:.4f} w={w:.3f} b={b:.3f}\")\n\n"
                "print(f\"最终: w={w:.3f} (期望 2.0), b={b:.3f} (期望 1.0)\")\n"
            ),
            "explanation": f"手写梯度下降拟合 y=2x+1，可看到 loss 单调下降、参数收敛到真值。这是 {topic} 的最简版本。",
            "expected_output": "loss 从 ~5 降到 ~0.25，w≈2.0 b≈1.0",
        }

    def _mock_algorithm(self, topic: str) -> dict:
        return {
            "language": "cpp",
            "filename": "algorithm_demo.cpp",
            "code": (
                "#include <bits/stdc++.h>\n"
                "using namespace std;\n\n"
                f"// 演示《{topic}》的最简实现思路\n"
                "// 复杂度：时间 O(n log n) 平均，空间 O(log n)\n"
                "void quick_sort(vector<int>& a, int l, int r) {\n"
                "    if (l >= r) return;\n"
                "    int pivot = a[l + (r - l) / 2], i = l, j = r;\n"
                "    while (i <= j) {\n"
                "        while (a[i] < pivot) i++;          // 左边找到 >= pivot 的\n"
                "        while (a[j] > pivot) j--;          // 右边找到 <= pivot 的\n"
                "        if (i <= j) swap(a[i++], a[j--]);  // 交换并向中间收缩\n"
                "    }\n"
                "    quick_sort(a, l, j);                   // 递归左半\n"
                "    quick_sort(a, i, r);                   // 递归右半\n"
                "}\n\n"
                "int main() {\n"
                "    vector<int> a = {3, 1, 4, 1, 5, 9, 2, 6};\n"
                "    quick_sort(a, 0, (int)a.size() - 1);\n"
                "    for (int x : a) cout << x << ' ';       // 升序输出\n"
                "    cout << '\\n';\n"
                "    return 0;\n"
                "}\n"
            ),
            "explanation": f"《{topic}》的占位示例：标准快排（双指针 partition + 分治递归）；配 LLM key 后会按主题生成对应 C++ 实现。",
            "expected_output": "1 1 2 3 4 5 6 9",
        }

    def _mock_pseudo(self, topic: str, course_name: str) -> dict:
        return {
            "language": "c",
            "filename": f"{topic.replace(' ', '_')}.pseudo.c",
            "code": (
                f"// 主题：{topic}（{course_name}）\n"
                "// 时间复杂度：O(n)\n"
                "// 关键不变量：进入循环前 condition 恒成立\n\n"
                "void demo(Resource *r) {\n"
                "    acquire_lock(&r->mu);          // 1. 进临界区前拿锁\n"
                "    while (!ready(r)) {            // 2. 条件不满足就等\n"
                "        wait(&r->cv, &r->mu);      //    cv 释放锁睡眠，唤醒后重抢\n"
                "    }\n"
                "    do_work(r);                    // 3. 真正干活\n"
                "    notify_all(&r->cv);            // 4. 通知其他等待者\n"
                "    release_lock(&r->mu);          // 5. 出临界区\n"
                "}\n"
            ),
            "explanation": f"《{topic}》的伪代码骨架：先拿锁 → 等条件 → 干活 → 通知 → 释放锁。注意 wait 必须在 while 而非 if 里（防虚假唤醒）。",
            "expected_output": "概念示意，不实际运行",
        }

    def _mock_hardware(self, topic: str) -> dict:
        return {
            "language": "asm",
            "filename": f"{topic.replace(' ', '_')}.s",
            "code": (
                f"# RISC-V 示例：与《{topic}》相关的核心片段\n"
                "# 寄存器约定：a0 为参数 / 返回值\n\n"
                ".text\n"
                ".globl add_two\n"
                "add_two:                  # int add_two(int a, int b)\n"
                "    add   a0, a0, a1      # a0 = a0 + a1\n"
                "    ret                   # 跳回调用者（jr ra）\n\n"
                ".globl main\n"
                "main:\n"
                "    li    a0, 3           # 第一个参数 = 3\n"
                "    li    a1, 4           # 第二个参数 = 4\n"
                "    call  add_two         # 调用，结果存 a0\n"
                "    li    a7, 93          # ecall 编号 93 = exit\n"
                "    ecall                 # 系统调用退出，返回值 = a0 = 7\n"
            ),
            "explanation": f"《{topic}》的最简 RISC-V 演示：函数调用约定（a0-a7 传参，ra 存返回地址）+ ecall 系统调用退出。",
            "expected_output": "退出码 7",
        }
