"""在线代码沙箱能力清单与 Python import 白名单。

与 scripts/piston_python_libs.txt / scripts/init-piston.sh 保持同一套第三方库。
运行时不提供任意 pip install，避免依赖漂移与安全风险。
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class ThirdPartyLib:
    """import 顶层名 → 安装包元数据。"""

    import_name: str
    package: str
    version: str | None
    note: str = ""


# 固定白名单：只允许这些第三方顶层模块进入 Piston。
# 标准库一律放行；动态 import / try 导入仍可能在运行期失败。
PYTHON_THIRD_PARTY_LIBS: tuple[ThirdPartyLib, ...] = (
    ThirdPartyLib("numpy", "numpy", None, "官方 Python runtime 预装"),
    ThirdPartyLib("scipy", "scipy", None, "官方 Python runtime 预装"),
    ThirdPartyLib("sklearn", "scikit-learn", "1.3.2", "机器学习算法与数据集"),
    ThirdPartyLib("matplotlib", "matplotlib", "3.7.5", "静态绘图（Agg 后端，无 GUI）"),
    ThirdPartyLib("PIL", "pillow", "10.2.0", "图像读写，配合 matplotlib"),
    ThirdPartyLib("pandas", "pandas", "2.0.3", "表格数据处理"),
    ThirdPartyLib("networkx", "networkx", "3.1", "图算法 / 网络拓扑示意"),
    ThirdPartyLib("seaborn", "seaborn", "0.13.2", "统计可视化，配合 matplotlib/pandas"),
)

PYTHON_THIRD_PARTY_IMPORTS: frozenset[str] = frozenset(
    item.import_name for item in PYTHON_THIRD_PARTY_LIBS
)

# 随白名单主库一起安装、教学代码里常见的附属顶层名。
# 不单独作为“可宣传能力”列出，但预检时应放行，避免误杀可运行代码。
PYTHON_SATELLITE_IMPORTS: frozenset[str] = frozenset(
    {
        # matplotlib
        "mpl_toolkits",
        "pylab",
        "matplotlib_inline",
        # scikit-learn ecosystem
        "joblib",
        "threadpoolctl",
        # pandas / scientific stack
        "dateutil",
        "pytz",
        "tzdata",
        "six",
        "packaging",
        # matplotlib deps sometimes imported directly
        "cycler",
        "kiwisolver",
        "fontTools",
        "contourpy",
        "pyparsing",
    }
)

# 常见别名：用户写 import pillow 时映射到 PIL
PYTHON_IMPORT_ALIASES: dict[str, str] = {
    "pillow": "PIL",
    "scikit_learn": "sklearn",
    "sklearn": "sklearn",
}

SUPPORTED_LANGUAGES: tuple[dict[str, object], ...] = (
    {"id": "python", "label": "Python 3.10", "compile_args": []},
    {"id": "c", "label": "C (gcc -std=c11)", "compile_args": ["-std=c11", "-O2"]},
    {"id": "cpp", "label": "C++ (g++ -std=c++17)", "compile_args": ["-std=c++17", "-O2"]},
)

# 注入到 Python 源码前的环境约束：限制数值库线程，并固定 matplotlib 无界面后端。
PYTHON_RUNTIME_PRELUDE = (
    "import os as _studymate_os\n"
    "_studymate_os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')\n"
    "_studymate_os.environ.setdefault('OMP_NUM_THREADS', '1')\n"
    "_studymate_os.environ.setdefault('MKL_NUM_THREADS', '1')\n"
    "_studymate_os.environ.setdefault('NUMEXPR_NUM_THREADS', '1')\n"
    "_studymate_os.environ.setdefault('MPLBACKEND', 'Agg')\n"
)


def prepare_python_source(source: str) -> str:
    return PYTHON_RUNTIME_PRELUDE + source


def _stdlib_top_level() -> frozenset[str]:
    names = set(getattr(sys, "stdlib_module_names", ()))
    # 兼容：保证常见内置名一定在集合里
    names.update({"__future__", "builtins", "sys", "os", "typing"})
    return frozenset(names)


_STDLIB_TOP_LEVEL = _stdlib_top_level()


def normalize_import_name(name: str) -> str:
    top = (name or "").split(".", 1)[0].strip()
    if not top:
        return ""
    return PYTHON_IMPORT_ALIASES.get(top, top)


def extract_top_level_imports(source: str) -> list[str]:
    """静态提取源码中的顶层 import 模块名；解析失败时返回空列表（交由沙箱运行时报错）。"""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []

    found: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                top = normalize_import_name(alias.name)
                if top:
                    found.append(top)
        elif isinstance(node, ast.ImportFrom):
            # relative import（from .x import y）不检查
            if node.level and node.level > 0:
                continue
            if not node.module:
                continue
            top = normalize_import_name(node.module)
            if top:
                found.append(top)
    # 保序去重
    seen: set[str] = set()
    ordered: list[str] = []
    for name in found:
        if name not in seen:
            seen.add(name)
            ordered.append(name)
    return ordered


def unsupported_third_party_imports(source: str) -> list[str]:
    unsupported: list[str] = []
    for name in extract_top_level_imports(source):
        if name in _STDLIB_TOP_LEVEL:
            continue
        if name in PYTHON_THIRD_PARTY_IMPORTS or name in PYTHON_SATELLITE_IMPORTS:
            continue
        unsupported.append(name)
    return unsupported


def pinned_pip_specs() -> list[str]:
    """部署脚本应安装的固定 package==version 列表。"""
    return [f"{item.package}=={item.version}" for item in PYTHON_THIRD_PARTY_LIBS if item.version]


def parse_piston_python_libs_file(path: str | Path) -> list[str]:
    """解析 scripts/piston_python_libs.txt 中的 package==version 行。"""
    specs: list[str] = []
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "==" not in line:
            continue
        package, version = line.split("==", 1)
        package = package.strip()
        version = version.strip()
        if package and version:
            specs.append(f"{package}=={version}")
    return specs


def format_supported_libs_for_prompt() -> str:
    """给 LLM 提示用的库名：pillow 比 PIL 更直观。"""
    names: list[str] = []
    for item in PYTHON_THIRD_PARTY_LIBS:
        if item.import_name == "PIL":
            names.append("pillow")
        else:
            names.append(item.import_name)
    return "、".join(names)


def format_supported_libs() -> str:
    return "、".join(item.import_name for item in PYTHON_THIRD_PARTY_LIBS)


def unsupported_import_message(unsupported: Iterable[str]) -> str:
    names = "、".join(unsupported)
    return (
        f"当前在线沙箱暂不支持第三方库：{names}。\n"
        f"已支持：{format_supported_libs()}。\n"
        "标准库（如 socket、json、re、math、collections）可直接使用；"
        "如需新增库，请更新 piston_python_libs.txt 并由管理员重新初始化沙箱。"
    )


def run_capabilities() -> dict:
    return {
        "languages": [dict(item) for item in SUPPORTED_LANGUAGES],
        "python": {
            "version": "3.10.0",
            "third_party": [
                {
                    "import_name": item.import_name,
                    "package": item.package,
                    "version": item.version,
                    "note": item.note,
                }
                for item in PYTHON_THIRD_PARTY_LIBS
            ],
            "notes": [
                "运行时禁止 pip install；依赖由部署时 init-piston 固定安装。",
                "matplotlib 使用 Agg 无界面后端；plt.show() 不会弹出窗口，当前接口也不返回图片字节。",
                "C / C++ 仅提供标准库与 STL，不提供第三方头文件。",
            ],
        },
        "c": {"version": "10.2.0", "standard": "c11", "third_party": []},
        "cpp": {"version": "10.2.0", "standard": "c++17", "third_party": []},
    }
