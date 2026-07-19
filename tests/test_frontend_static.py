import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE = (ROOT / "frontend" / "src" / "app" / "page.tsx").read_text(encoding="utf-8")
SDK = (ROOT / "frontend" / "src" / "lib" / "genlayer.ts").read_text(encoding="utf-8")


class SourceCredNewsFrontendStaticTests(unittest.TestCase):
    def test_all_contract_actions_are_wired(self):
        for method in [
            '"create_claim"',
            '"submit_evidence"',
            '"evaluate_evidence"',
            '"settle_reward"',
            '"close_and_refund"',
        ]:
            self.assertIn(method, PAGE)

    def test_accepted_transactions_are_verified_by_state(self):
        self.assertIn("TransactionStatus.ACCEPTED", SDK)
        self.assertNotIn("TransactionStatus.FINALIZED", SDK)
        self.assertIn("Waiting for indexed contract state", PAGE)
        self.assertIn("Do not submit it twice", PAGE)
        self.assertIn("waitFor(verify)", PAGE)

    def test_no_fake_contract_or_demo_fallback(self):
        combined = PAGE + SDK
        self.assertNotIn("demoMode", combined)
        self.assertNotIn("fakeState", combined)
        self.assertNotIn("mockClaims", combined)
        self.assertNotIn("Run demo", combined)

    def test_reviewer_can_select_contract_at_runtime(self):
        self.assertIn("localStorage", PAGE)
        self.assertIn("Use and verify", PAGE)
        self.assertIn("Restore production default", PAGE)

    def test_live_directory_reads_are_bounded_and_sequential(self):
        self.assertIn("nextPlatform.claim_count - 30", PAGE)
        self.assertIn("nextPlatform.evidence_count - 30", PAGE)
        self.assertNotIn("Promise.all", PAGE)

    def test_one_primary_action_is_state_driven(self):
        for state in ["canSubmit", "canEvaluate", "canSettle", "canRefund"]:
            self.assertIn(state, PAGE)


if __name__ == "__main__":
    unittest.main()
