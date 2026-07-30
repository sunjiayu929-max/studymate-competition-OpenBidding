"""
检索引擎抽象 + BM25 实现。
所有 chunk 必须带 source/page/url —— 引用追溯的基础（挑战杯硬性）。

注意：纯 Python 实现，不依赖 numpy/sklearn。
原因：用户的 Python 3.13 是 MINGW-W64 build，numpy 在其上 segfault。
若后续切换到向量检索，新增 VectorEngine 实现同一接口即可。
"""
from __future__ import annotations
import math
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class Chunk:
    chunk_id: str       # 业务 ID（用于 join 数据库 KnowledgeChunk.id）
    content: str
    source: str
    page: int | None = None
    url: str | None = None
    meta: dict = field(default_factory=dict)
    course_id: int | None = None  # 多课程隔离：检索时按此过滤
    embedding: list[float] | None = None  # 语义向量；None = 未向量化（混合检索时跳过）


@dataclass
class SearchHit:
    chunk: Chunk
    score: float


class RetrievalEngine(Protocol):
    def add(self, chunks: list[Chunk]) -> None: ...
    def search(self, query: str, k: int = 5) -> list[SearchHit]: ...
    def count(self) -> int: ...
    def clear(self) -> None: ...


_CJK = r"一-鿿㐀-䶿"  # CJK 基本区 + 扩展 A


def _tokenize(text: str) -> list[str]:
    """轻量中英混合分词（不引入 jieba，保持依赖轻）：
    - 英文/数字：按字母数字整词切（CS 术语 TCP/BM25/LRU 保持完整，命中精准）；
    - 中文：按相邻字符 bigram 切（"三次握手" → 三次/次握/握手）。
      bigram 让短语重新有黏性，并大幅降低单字 unigram 的常用字噪音（"什么是" 不再
      把 什/么/是 当独立词喂进去）。长度为 1 的孤立汉字退化为 unigram，保证可检索。
    """
    text = text.lower()
    tokens: list[str] = []
    for m in re.finditer(r"[a-z0-9_]+", text):
        tokens.append(m.group(0))
    # 取出每段连续中文，逐段做 bigram
    for run in re.findall(f"[{_CJK}]+", text):
        if len(run) == 1:
            tokens.append(run)
        else:
            for i in range(len(run) - 1):
                tokens.append(run[i:i + 2])
    return tokens


class BM25Engine:
    """纯 Python BM25 Okapi。
    - score(D,Q) = Σ_t IDF(t) * (f(t,D)*(k1+1)) / (f(t,D) + k1*(1-b+b*|D|/avgdl))
    - IDF(t)   = log( (N - df(t) + 0.5) / (df(t) + 0.5) + 1 )
    """
    K1 = 1.5
    B = 0.75

    def __init__(self):
        self._chunks: list[Chunk] = []
        self._tokens: list[list[str]] = []
        self._token_counts: list[Counter] = []     # 每文档词频
        self._doc_lens: list[int] = []
        self._df: Counter = Counter()              # document frequency
        self._avgdl: float = 0.0

    def add(self, chunks: list[Chunk]) -> None:
        for c in chunks:
            toks = _tokenize(c.content)
            self._chunks.append(c)
            self._tokens.append(toks)
            tc = Counter(toks)
            self._token_counts.append(tc)
            self._doc_lens.append(len(toks))
            for t in tc.keys():
                self._df[t] += 1
        n = len(self._doc_lens)
        self._avgdl = (sum(self._doc_lens) / n) if n else 0.0

    def _idf(self, term: str, n_docs: int) -> float:
        df = self._df.get(term, 0)
        return math.log((n_docs - df + 0.5) / (df + 0.5) + 1)

    def search(self, query: str, k: int = 5, course_id: int | None = None) -> list[SearchHit]:
        """检索 top-k。
        course_id 给定时只在该课范围内打分排序（多课程架构隔离）。
        """
        if not self._chunks:
            return []
        q_tokens = _tokenize(query)
        if not q_tokens:
            return []
        n = len(self._chunks)
        # 候选下标：course_id 过滤
        if course_id is not None:
            cand = [i for i, c in enumerate(self._chunks) if c.course_id == course_id]
            if not cand:
                return []
        else:
            cand = list(range(n))

        scores: dict[int, float] = {i: 0.0 for i in cand}
        # IDF 仍用全库统计（BM25 用整体语料更稳；少数 chunk 时差异不大）
        for term in q_tokens:
            if term not in self._df:
                continue
            idf = self._idf(term, n)
            for i in cand:
                f = self._token_counts[i].get(term, 0)
                if f == 0:
                    continue
                dl = self._doc_lens[i]
                denom = f + self.K1 * (1 - self.B + self.B * dl / (self._avgdl or 1.0))
                scores[i] += idf * (f * (self.K1 + 1)) / denom

        idx = sorted(cand, key=lambda i: scores[i], reverse=True)[:k]
        results: list[SearchHit] = []
        for i in idx:
            if scores[i] <= 0:
                continue
            results.append(SearchHit(chunk=self._chunks[i], score=float(scores[i])))
        return results

    def count(self) -> int:
        return len(self._chunks)

    def clear(self) -> None:
        self._chunks.clear()
        self._tokens.clear()
        self._token_counts.clear()
        self._doc_lens.clear()
        self._df.clear()
        self._avgdl = 0.0


class VectorIndex:
    """纯 Python 余弦相似度向量检索（不依赖 numpy —— 本机 MINGW numpy 会 segfault）。
    1709×1024 维点积约 ~1.75M 次乘法/查询，单次 < 50ms，演示规模完全够用。
    与 BM25Engine 同接口，便于在 RAGService 里做混合融合。
    """

    def __init__(self):
        self._chunks: list[Chunk] = []
        self._vecs: list[list[float]] = []
        self._norms: list[float] = []

    def add(self, chunks: list[Chunk]) -> None:
        for c in chunks:
            if not c.embedding:
                continue
            v = c.embedding
            n = math.sqrt(sum(x * x for x in v)) or 1.0
            self._chunks.append(c)
            self._vecs.append(v)
            self._norms.append(n)

    def search(self, query_vec: list[float], k: int = 5, course_id: int | None = None) -> list[SearchHit]:
        if not self._chunks or not query_vec:
            return []
        qn = math.sqrt(sum(x * x for x in query_vec)) or 1.0
        scored: list[tuple[float, int]] = []
        for i, c in enumerate(self._chunks):
            if course_id is not None and c.course_id != course_id:
                continue
            dot = 0.0
            vi = self._vecs[i]
            for a, b in zip(query_vec, vi):
                dot += a * b
            scored.append((dot / (qn * self._norms[i]), i))
        scored.sort(key=lambda t: t[0], reverse=True)
        return [SearchHit(chunk=self._chunks[i], score=float(s)) for s, i in scored[:k]]

    def count(self) -> int:
        return len(self._chunks)

    def clear(self) -> None:
        self._chunks.clear()
        self._vecs.clear()
        self._norms.clear()
