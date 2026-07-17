import unittest

from app.integrations.reading_resolver import (
    _best_arxiv,
    _best_crossref,
    _best_csdn,
    _best_douban,
    _best_juejin,
    title_match_score,
)


class ReadingResolverTests(unittest.TestCase):
    def test_title_matching_accepts_exact_and_common_generated_prefixes(self):
        self.assertEqual(title_match_score("Attention Is All You Need", "Attention Is All You Need"), 1)
        self.assertGreaterEqual(title_match_score("图解梯度下降", "梯度下降算法详解"), 0.84)
        self.assertLess(title_match_score("梯度下降", "完全无关的数据库教程"), 0.5)

    def test_arxiv_parser_returns_only_clean_abstract_url(self):
        body = """<?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Attention Is All You Need</title>
            <link href="https://arxiv.org/abs/1706.03762v7" rel="alternate" type="text/html"/>
          </entry>
        </feed>"""
        match = _best_arxiv(body, "Attention Is All You Need")
        self.assertIsNotNone(match)
        self.assertEqual(match["url"], "https://arxiv.org/abs/1706.03762v7")
        self.assertEqual(match["provider"], "arXiv")

    def test_crossref_parser_requires_matching_scholarly_type_and_doi(self):
        body = {
            "message": {
                "items": [
                    {"type": "posted-content", "title": ["Attention Is All You Need"], "DOI": "10.1/rejected"},
                    {"type": "journal-article", "title": ["Attention Is All You Need"], "DOI": "10.5555/accepted.1"},
                ]
            }
        }
        match = _best_crossref(body, "Attention Is All You Need")
        self.assertIsNotNone(match)
        self.assertEqual(match["url"], "https://doi.org/10.5555/accepted.1")

    def test_douban_parser_returns_book_subject_and_rejects_other_hosts(self):
        data = (
            '<script>window.__DATA__ = {"items": ['
            '{"title": "Pattern Recognition and Machine Learning", '
            '"url": "https://book.douban.com/subject/2061116/?source=search"}, '
            '{"title": "Pattern Recognition and Machine Learning", '
            '"url": "https://example.invalid/subject/2061116/"}'
            ']};</script>'
        )
        match = _best_douban(data, "Pattern Recognition and Machine Learning")
        self.assertIsNotNone(match)
        self.assertEqual(match["url"], "https://book.douban.com/subject/2061116/")

    def test_blog_parsers_strip_tracking_and_require_article_paths(self):
        csdn = _best_csdn(
            {
                "result_vos": [
                    {
                        "title": "图解梯度下降",
                        "url": "https://blog.csdn.net/example/article/details/123456?spm=tracking",
                    }
                ]
            },
            "图解梯度下降",
        )
        self.assertIsNotNone(csdn)
        self.assertEqual(csdn["url"], "https://blog.csdn.net/example/article/details/123456")

        juejin = _best_juejin(
            {
                "data": [
                    {
                        "result_model": {
                            "article_id": "7654321",
                            "article_info": {"title": "图解梯度下降"},
                        }
                    }
                ]
            },
            "图解梯度下降",
        )
        self.assertIsNotNone(juejin)
        self.assertEqual(juejin["url"], "https://juejin.cn/post/7654321")


if __name__ == "__main__":
    unittest.main()
