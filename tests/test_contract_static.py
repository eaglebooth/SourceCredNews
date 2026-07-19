import ast
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "SourceCredNews.py"


class SourceCredNewsContractStaticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = CONTRACT.read_text(encoding="utf-8")
        cls.tree = ast.parse(cls.source)

    def test_studio_runner_header_is_exact(self):
        lines = self.source.splitlines()
        self.assertEqual(lines[0], "# v0.2.16")
        self.assertEqual(
            lines[1],
            '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }',
        )
        self.assertEqual(lines[2], "from genlayer import *")

    def test_semantic_consensus_reads_two_web_sources(self):
        self.assertIn("gl.nondet.web.render", self.source)
        self.assertIn("gl.nondet.exec_prompt", self.source)
        self.assertIn("gl.eq_principle.prompt_comparative", self.source)
        self.assertNotIn("gl.eq_principle.strict_eq", self.source)
        self.assertIn("agree on both the substantive claim verdict", self.source)
        self.assertIn("escrow payout band", self.source)

    def test_real_payable_lifecycle_exists(self):
        for name in [
            "create_claim",
            "submit_evidence",
            "evaluate_evidence",
            "settle_reward",
            "close_and_refund",
            "get_platform_state",
            "get_claim",
            "get_evidence",
        ]:
            self.assertIn(f"def {name}", self.source)
        self.assertIn("@gl.public.write.payable", self.source)
        self.assertIn("escrow = gl.message.value", self.source)
        self.assertIn("emit_transfer(value=payout)", self.source)
        self.assertIn("emit_transfer(value=refund)", self.source)

    def test_roles_come_from_transaction_sender(self):
        self.assertIn("gl.message.sender_address.as_hex", self.source)
        self.assertIn('UserError("CREATOR_CANNOT_SUBMIT")', self.source)
        self.assertIn('UserError("NOT_CLAIM_CREATOR")', self.source)
        self.assertNotIn("creator_address:", self.source)
        self.assertNotIn("submitter_address:", self.source)

    def test_evidence_has_provenance_guards(self):
        self.assertIn("INDEPENDENT_SOURCES_REQUIRED", self.source)
        self.assertIn("primary_url == secondary_url", self.source)
        self.assertIn("_source_host(primary_url) == self._source_host(secondary_url)", self.source)
        self.assertIn("EVIDENCE_ALREADY_SUBMITTED", self.source)

    def test_storage_annotations_use_supported_types(self):
        contract_class = next(
            node for node in self.tree.body
            if isinstance(node, ast.ClassDef) and node.name == "SourceCredNews"
        )
        allowed = {
            "TreeMap[u256, str]",
            "TreeMap[u256, u256]",
            "DynArray[str]",
            "DynArray[u256]",
            "u256",
        }
        for statement in contract_class.body:
            if isinstance(statement, ast.AnnAssign):
                self.assertIn(ast.unparse(statement.annotation), allowed)

    def test_public_signatures_are_flat(self):
        forbidden = {"int", "float", "bool", "list", "dict", "tuple"}
        for node in ast.walk(self.tree):
            if not isinstance(node, ast.FunctionDef):
                continue
            decorators = [ast.unparse(item) for item in node.decorator_list]
            if not any(item.startswith("gl.public.") for item in decorators):
                continue
            self.assertLessEqual(len(node.args.args) - 1, 6)
            for argument in node.args.args[1:]:
                self.assertNotIn(ast.unparse(argument.annotation), forbidden)

    def test_no_unsupported_time_or_demo_entrypoint(self):
        for forbidden in ["get_block_timestamp", "time.time", 'if __name__ == "__main__"']:
            self.assertNotIn(forbidden, self.source)


if __name__ == "__main__":
    unittest.main()
