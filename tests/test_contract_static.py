import ast
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "SourceCredNews.py"


class SourceCredNewsContractStaticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = CONTRACT.read_text(encoding="utf-8")
        cls.tree = ast.parse(cls.source)

    def test_required_header_and_imports(self):
        lines = self.source.splitlines()
        self.assertEqual(lines[0], "# v0.2.16")
        self.assertEqual(
            lines[1],
            '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }',
        )
        self.assertEqual(lines[2], "from genlayer import *")
        self.assertIn("import typing", self.source)
        self.assertIn("import json", self.source)

    def test_nondeterminism_is_wrapped(self):
        self.assertIn("def run_review() -> str:", self.source)
        self.assertIn("gl.nondet.web.get", self.source)
        self.assertIn("gl.nondet.exec_prompt", self.source)
        self.assertIn("gl.eq_principle.strict_eq(run_review)", self.source)

    def test_core_methods_exist(self):
        for name in [
            "create_claim",
            "submit_evidence",
            "verify_evidence",
            "release_reward",
            "close_claim",
            "get_claim",
            "get_evidence",
        ]:
            self.assertIn(f"def {name}", self.source)

    def test_storage_annotations_use_allowed_types(self):
        contract_class = next(
            node
            for node in self.tree.body
            if isinstance(node, ast.ClassDef) and node.name == "SourceCredNews"
        )
        allowed = {"TreeMap[u256, str]", "TreeMap[u256, u256]", "DynArray[str]", "DynArray[u256]", "u256"}
        for statement in contract_class.body:
            if isinstance(statement, ast.AnnAssign):
                annotation = ast.unparse(statement.annotation)
                self.assertIn(annotation, allowed)

    def test_public_signatures_are_flat(self):
        forbidden = {"int", "float", "bool", "list", "dict", "tuple"}
        for node in ast.walk(self.tree):
            if not isinstance(node, ast.FunctionDef):
                continue
            decorators = [ast.unparse(item) for item in node.decorator_list]
            if not any(item.startswith("gl.public.") for item in decorators):
                continue
            self.assertLessEqual(len(node.args.args) - 1, 6)
            for arg in node.args.args[1:]:
                annotation = ast.unparse(arg.annotation)
                self.assertNotIn(annotation, forbidden)

    def test_no_demo_entrypoint(self):
        self.assertNotRegex(self.source, re.compile(r"if\s+__name__\s*=="))


if __name__ == "__main__":
    unittest.main()
