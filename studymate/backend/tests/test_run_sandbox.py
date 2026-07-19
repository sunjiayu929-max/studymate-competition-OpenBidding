from __future__ import annotations

import json
import unittest
from pathlib import Path
from unittest.mock import patch

from app.agents.code_agent import CodeAgent
from app.api.run import _prepare_source
from app.core.run_sandbox import (
    extract_top_level_imports,
    format_supported_libs_for_prompt,
    parse_piston_python_libs_file,
    pinned_pip_specs,
    run_capabilities,
    unsupported_import_message,
    unsupported_third_party_imports,
)


def _piston_libs_file_candidates() -> list[Path]:
    here = Path(__file__).resolve()
    return [
        # studymate/backend/tests -> studymate/scripts
        here.parents[2] / "scripts" / "piston_python_libs.txt",
        # 容器内若挂载到 /app/piston_python_libs.txt
        Path("/app/piston_python_libs.txt"),
        Path("/app/scripts/piston_python_libs.txt"),
    ]


def _find_piston_libs_file() -> Path | None:
    for path in _piston_libs_file_candidates():
        if path.is_file():
            return path
    return None


class RunSandboxTests(unittest.TestCase):
    def test_extract_imports_and_aliases(self):
        source = """
import numpy as np
from sklearn.datasets import make_blobs
import matplotlib.pyplot as plt
from PIL import Image
import pillow
import socket
"""
        names = extract_top_level_imports(source)
        self.assertEqual(names, ["numpy", "sklearn", "matplotlib", "PIL", "socket"])

    def test_whitelist_allows_supported_third_party_and_stdlib(self):
        source = """
import json, socket, re
import numpy, pandas, networkx
from sklearn.cluster import KMeans
import matplotlib.pyplot as plt
import seaborn as sns
import mpl_toolkits
import joblib
"""
        self.assertEqual(unsupported_third_party_imports(source), [])

    def test_whitelist_rejects_unknown_third_party(self):
        source = "import torch\nimport requests\nprint(1)\n"
        unsupported = unsupported_third_party_imports(source)
        self.assertEqual(unsupported, ["torch", "requests"])
        message = unsupported_import_message(unsupported)
        self.assertIn("torch", message)
        self.assertIn("requests", message)
        self.assertIn("numpy", message)
        self.assertIn("matplotlib", message)

    def test_prepare_source_sets_thread_and_matplotlib_backend(self):
        prepared = _prepare_source("python", "print(1)\n")
        self.assertIn("OPENBLAS_NUM_THREADS", prepared)
        self.assertIn("MPLBACKEND", prepared)
        self.assertIn("Agg", prepared)
        self.assertTrue(prepared.endswith("print(1)\n"))
        self.assertEqual(_prepare_source("cpp", "int main(){}"), "int main(){}")

    def test_capabilities_lists_languages_and_python_libs(self):
        caps = run_capabilities()
        language_ids = [item["id"] for item in caps["languages"]]
        self.assertEqual(language_ids, ["python", "c", "cpp"])
        import_names = [item["import_name"] for item in caps["python"]["third_party"]]
        for name in ("numpy", "scipy", "sklearn", "matplotlib", "PIL", "pandas", "networkx", "seaborn"):
            self.assertIn(name, import_names)

    def test_pinned_pip_specs_match_piston_libs_file_when_present(self):
        code_specs = pinned_pip_specs()
        self.assertEqual(
            code_specs,
            [
                "scikit-learn==1.3.2",
                "matplotlib==3.7.5",
                "pillow==10.2.0",
                "pandas==2.0.3",
                "networkx==3.1",
                "seaborn==0.13.2",
            ],
        )
        libs_file = _find_piston_libs_file()
        if libs_file is None:
            self.skipTest("piston_python_libs.txt not mounted in this environment")
        file_specs = parse_piston_python_libs_file(libs_file)
        self.assertEqual(file_specs, code_specs)

    def test_prompt_lib_names_use_pillow_instead_of_pil(self):
        prompt_libs = format_supported_libs_for_prompt()
        self.assertIn("pillow", prompt_libs)
        self.assertNotIn("PIL", prompt_libs)
        self.assertIn("matplotlib", prompt_libs)
        self.assertIn("networkx", prompt_libs)
        self.assertIn("seaborn", prompt_libs)


class CodeAgentSandboxPromptTests(unittest.IsolatedAsyncioTestCase):
    async def test_ml_prompt_embeds_live_sandbox_whitelist(self):
        agent = CodeAgent()
        captured: dict = {}

        class _FakeLLM:
            async def chat_structured(self, messages, temperature=0.4):
                captured["messages"] = messages
                return json.dumps(
                    {
                        "language": "python",
                        "filename": "example.py",
                        "code": "print(1)\n",
                        "explanation": "demo",
                        "expected_output": "1",
                    },
                    ensure_ascii=False,
                )

        with patch("app.agents.code_agent.get_llm_client", return_value=_FakeLLM()):
            payload = await agent._gen_real(
                topic="gradient-descent",
                profile={"knowledge_base": {"programming": 4}},
                persona="ml-tutor",
                course_name="machine-learning",
                style="ml",
                libs=["numpy", "sklearn", "matplotlib"],
            )

        self.assertEqual(payload["code"].strip(), "print(1)")
        system = captured["messages"][0]["content"]
        expected = format_supported_libs_for_prompt()
        self.assertIn(expected, system)
        self.assertIn("只允许使用在线沙箱已支持库", system)
        self.assertNotIn("numpy / scipy / pandas / sklearn / matplotlib / pillow", system)

    async def test_pseudo_prompt_also_embeds_sandbox_whitelist(self):
        agent = CodeAgent()
        captured: dict = {}

        class _FakeLLM:
            async def chat_structured(self, messages, temperature=0.4):
                captured["messages"] = messages
                return json.dumps(
                    {
                        "language": "c",
                        "filename": "tcp.pseudo.c",
                        "code": "// demo\n",
                        "explanation": "demo",
                        "expected_output": "ok",
                    },
                    ensure_ascii=False,
                )

        with patch("app.agents.code_agent.get_llm_client", return_value=_FakeLLM()):
            await agent._gen_real(
                topic="tcp-handshake",
                profile={},
                persona="net-tutor",
                course_name="computer-network",
                style="pseudo",
                libs=["Python socket", "networkx"],
            )

        system = captured["messages"][0]["content"]
        self.assertIn(format_supported_libs_for_prompt(), system)
        self.assertIn("沙箱白名单第三方库", system)


if __name__ == "__main__":
    unittest.main()
