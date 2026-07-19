# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import typing
import json


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


class SourceCredNews(gl.Contract):
    claim_count: u256
    claim_creator: TreeMap[u256, str]
    claim_title: TreeMap[u256, str]
    claim_text: TreeMap[u256, str]
    claim_context: TreeMap[u256, str]
    claim_min_score: TreeMap[u256, u256]
    claim_status: TreeMap[u256, str]
    claim_escrow: TreeMap[u256, u256]
    claim_reserved: TreeMap[u256, u256]
    claim_paid: TreeMap[u256, u256]
    claim_refunded: TreeMap[u256, u256]
    claim_evidence_marker: TreeMap[u256, u256]

    evidence_count: u256
    evidence_claim_id: TreeMap[u256, u256]
    evidence_submitter: TreeMap[u256, str]
    evidence_primary_url: TreeMap[u256, str]
    evidence_secondary_url: TreeMap[u256, str]
    evidence_notes: TreeMap[u256, str]
    evidence_status: TreeMap[u256, str]
    evidence_verdict: TreeMap[u256, str]
    evidence_quality_score: TreeMap[u256, u256]
    evidence_confidence_score: TreeMap[u256, u256]
    evidence_payout: TreeMap[u256, u256]
    evidence_reason: TreeMap[u256, str]

    total_escrowed: u256
    total_reserved: u256
    total_paid: u256
    total_refunded: u256

    def __init__(self):
        self.claim_count = u256(0)
        self.evidence_count = u256(0)
        self.total_escrowed = u256(0)
        self.total_reserved = u256(0)
        self.total_paid = u256(0)
        self.total_refunded = u256(0)

    def _valid_source_url(self, value: str) -> bool:
        return value.startswith("https://") and len(value) <= 500

    def _source_host(self, value: str) -> str:
        parts = value.split("/")
        if len(parts) < 3:
            return ""
        return parts[2].lower()

    def _available(self, claim_id: u256) -> u256:
        return (
            self.claim_escrow[claim_id]
            - self.claim_reserved[claim_id]
            - self.claim_paid[claim_id]
            - self.claim_refunded[claim_id]
        )

    def _parse_review(self, value: typing.Any) -> typing.Any:
        if isinstance(value, str):
            try:
                data = json.loads(value)
            except Exception:
                return None
        else:
            data = value
        if not isinstance(data, dict):
            return None

        verdict = str(data.get("verdict", "UNCLEAR")).upper()
        payout_band = str(data.get("payout_band", "NONE")).upper()
        if verdict not in ("SUPPORTED", "CONTRADICTED", "MISLEADING", "UNCLEAR"):
            return None
        if payout_band not in ("FULL", "PARTIAL", "NONE"):
            return None
        try:
            quality = int(data.get("quality_score", 0))
            confidence = int(data.get("confidence_score", 0))
        except Exception:
            return None
        if quality < 0:
            quality = 0
        elif quality > 100:
            quality = 100
        if confidence < 0:
            confidence = 0
        elif confidence > 100:
            confidence = 100
        reason = str(data.get("reason", "No evidence-based reason was returned."))[:900]
        return (verdict, payout_band, quality, confidence, reason)

    def _review_evidence(self, evidence_id: u256) -> typing.Any:
        claim_id = self.evidence_claim_id[evidence_id]
        title = self.claim_title[claim_id]
        claim_text = self.claim_text[claim_id]
        context = self.claim_context[claim_id]
        minimum = self.claim_min_score[claim_id]
        primary_url = self.evidence_primary_url[evidence_id]
        secondary_url = self.evidence_secondary_url[evidence_id]
        notes = self.evidence_notes[evidence_id]

        def run_review() -> typing.Any:
            def render_source(url: str, label: str) -> str:
                try:
                    content = gl.nondet.web.render(url, mode="text").strip()
                    if len(content) < 100:
                        return label + "_UNAVAILABLE: no substantive readable content"
                    return content[:3500]
                except Exception:
                    return label + "_UNAVAILABLE: source could not be rendered"

            primary = render_source(primary_url, "PRIMARY")
            secondary = render_source(secondary_url, "SECONDARY")
            prompt = f"""You are the independent GenLayer jury for a funded public-claim verification.
Your judgment controls real escrowed GEN paid to the source contributor.

TITLE: {title}
PUBLIC CLAIM: {claim_text}
CONTEXT: {context}
MINIMUM FULL-PAYOUT QUALITY: {minimum}
CONTRIBUTOR NOTES: {notes}

PRIMARY SOURCE ({primary_url}):
{primary}

SECONDARY SOURCE ({secondary_url}):
{secondary}

Determine whether the claim is SUPPORTED, CONTRADICTED, MISLEADING, or UNCLEAR.
Judge source authority, direct relevance, independence, corroboration, recency, and contradiction handling.
FULL requires two readable independent sources, quality >= {minimum}, and a decisive non-UNCLEAR verdict.
PARTIAL requires quality >= 60, at least one strong readable source, useful corroboration, and a non-UNCLEAR verdict.
NONE is mandatory when sources are unavailable, self-referential, irrelevant, too weak, or the verdict is UNCLEAR.

Return ONLY JSON with verdict, payout_band (FULL|PARTIAL|NONE), quality_score (0-100),
confidence_score (0-100), and one concise evidence-based reason."""
            return gl.nondet.exec_prompt(prompt, response_format="json")

        principle = """Two SourceCred reviews are equivalent only when they agree on both the substantive claim verdict
(SUPPORTED, CONTRADICTED, MISLEADING, or UNCLEAR) and the escrow payout band (FULL, PARTIAL, or NONE).
FULL and PARTIAL are never equivalent because they transfer different amounts. NONE is never equivalent to a paying
decision. Scores may differ by up to 10 points when they remain in the same payout band. Ignore JSON key order and
harmless wording differences, but do not ignore conflicting source conclusions or payment outcomes."""
        return self._parse_review(gl.eq_principle.prompt_comparative(run_review, principle))

    @gl.public.write.payable
    def create_claim(self, title: str, claim_text: str, context: str, min_quality_score: u256) -> typing.Any:
        escrow = gl.message.value
        if len(title) < 5 or len(title) > 160:
            raise gl.vm.UserError("INVALID_TITLE")
        if len(claim_text) < 30 or len(claim_text) > 1600:
            raise gl.vm.UserError("INVALID_CLAIM")
        if len(context) > 1200:
            raise gl.vm.UserError("INVALID_CONTEXT")
        if min_quality_score < u256(60) or min_quality_score > u256(100):
            raise gl.vm.UserError("INVALID_MIN_SCORE")
        if escrow == u256(0):
            raise gl.vm.UserError("ESCROW_REQUIRED")

        claim_id = self.claim_count
        self.claim_creator[claim_id] = gl.message.sender_address.as_hex
        self.claim_title[claim_id] = title
        self.claim_text[claim_id] = claim_text
        self.claim_context[claim_id] = context
        self.claim_min_score[claim_id] = min_quality_score
        self.claim_status[claim_id] = "OPEN"
        self.claim_escrow[claim_id] = escrow
        self.claim_reserved[claim_id] = u256(0)
        self.claim_paid[claim_id] = u256(0)
        self.claim_refunded[claim_id] = u256(0)
        self.claim_evidence_marker[claim_id] = u256(0)
        self.total_escrowed = self.total_escrowed + escrow
        self.claim_count = claim_id + u256(1)
        return str(claim_id)

    @gl.public.write
    def submit_evidence(self, claim_id: u256, primary_url: str, secondary_url: str, notes: str) -> typing.Any:
        if claim_id >= self.claim_count:
            raise gl.vm.UserError("CLAIM_NOT_FOUND")
        if self.claim_status[claim_id] != "OPEN":
            raise gl.vm.UserError("CLAIM_NOT_OPEN")
        submitter = gl.message.sender_address.as_hex
        if submitter == self.claim_creator[claim_id]:
            raise gl.vm.UserError("CREATOR_CANNOT_SUBMIT")
        if self.claim_evidence_marker[claim_id] != u256(0):
            raise gl.vm.UserError("EVIDENCE_ALREADY_SUBMITTED")
        if not self._valid_source_url(primary_url) or not self._valid_source_url(secondary_url):
            raise gl.vm.UserError("INVALID_SOURCE_URL")
        if primary_url == secondary_url or self._source_host(primary_url) == self._source_host(secondary_url):
            raise gl.vm.UserError("INDEPENDENT_SOURCES_REQUIRED")
        if len(notes) < 20 or len(notes) > 1000:
            raise gl.vm.UserError("INVALID_NOTES")
        if self._available(claim_id) == u256(0):
            raise gl.vm.UserError("NO_AVAILABLE_ESCROW")

        evidence_id = self.evidence_count
        self.evidence_claim_id[evidence_id] = claim_id
        self.evidence_submitter[evidence_id] = submitter
        self.evidence_primary_url[evidence_id] = primary_url
        self.evidence_secondary_url[evidence_id] = secondary_url
        self.evidence_notes[evidence_id] = notes
        self.evidence_status[evidence_id] = "PENDING"
        self.evidence_verdict[evidence_id] = "PENDING"
        self.evidence_quality_score[evidence_id] = u256(0)
        self.evidence_confidence_score[evidence_id] = u256(0)
        self.evidence_payout[evidence_id] = u256(0)
        self.evidence_reason[evidence_id] = "Awaiting GenLayer source review."
        self.claim_evidence_marker[claim_id] = evidence_id + u256(1)
        self.evidence_count = evidence_id + u256(1)
        return str(evidence_id)

    @gl.public.write
    def evaluate_evidence(self, evidence_id: u256) -> typing.Any:
        if evidence_id >= self.evidence_count:
            raise gl.vm.UserError("EVIDENCE_NOT_FOUND")
        if self.evidence_status[evidence_id] != "PENDING":
            raise gl.vm.UserError("EVIDENCE_NOT_PENDING")
        parsed = self._review_evidence(evidence_id)
        if parsed is None:
            raise gl.vm.UserError("INVALID_AI_RESPONSE")

        verdict, payout_band, quality_int, confidence_int, reason = parsed
        claim_id = self.evidence_claim_id[evidence_id]
        minimum = self.claim_min_score[claim_id]
        available = self._available(claim_id)
        payout = u256(0)

        if payout_band == "FULL" and u256(quality_int) < minimum:
            payout_band = "PARTIAL" if quality_int >= 60 else "NONE"
        if payout_band == "PARTIAL" and quality_int < 60:
            payout_band = "NONE"
        if verdict == "UNCLEAR":
            payout_band = "NONE"
        if payout_band == "FULL":
            payout = available
        elif payout_band == "PARTIAL":
            payout = available // u256(2)

        self.evidence_verdict[evidence_id] = verdict
        self.evidence_quality_score[evidence_id] = u256(quality_int)
        self.evidence_confidence_score[evidence_id] = u256(confidence_int)
        self.evidence_payout[evidence_id] = payout
        self.evidence_reason[evidence_id] = reason
        self.claim_status[claim_id] = "REVIEWED"

        if payout > u256(0):
            self.claim_reserved[claim_id] = payout
            self.total_reserved = self.total_reserved + payout
            self.evidence_status[evidence_id] = "APPROVED"
        elif verdict == "UNCLEAR":
            self.evidence_status[evidence_id] = "NEEDS_EVIDENCE"
        else:
            self.evidence_status[evidence_id] = "REJECTED"
        return self.get_evidence(evidence_id)

    @gl.public.write
    def settle_reward(self, evidence_id: u256) -> str:
        if evidence_id >= self.evidence_count:
            raise gl.vm.UserError("EVIDENCE_NOT_FOUND")
        if self.evidence_status[evidence_id] != "APPROVED":
            raise gl.vm.UserError("NOT_APPROVED")
        claim_id = self.evidence_claim_id[evidence_id]
        payout = self.evidence_payout[evidence_id]
        if payout == u256(0):
            raise gl.vm.UserError("ZERO_PAYOUT")
        if payout > self.claim_reserved[claim_id] or payout > self.total_reserved:
            raise gl.vm.UserError("RESERVE_MISMATCH")
        if payout > self.balance:
            raise gl.vm.UserError("CONTRACT_BALANCE_MISMATCH")

        self.claim_reserved[claim_id] = self.claim_reserved[claim_id] - payout
        self.claim_paid[claim_id] = self.claim_paid[claim_id] + payout
        self.total_reserved = self.total_reserved - payout
        self.total_paid = self.total_paid + payout
        self.claim_status[claim_id] = "SETTLED"
        self.evidence_status[evidence_id] = "PAID"
        _Recipient(Address(self.evidence_submitter[evidence_id])).emit_transfer(value=payout)
        return "PAID"

    @gl.public.write
    def close_and_refund(self, claim_id: u256) -> str:
        if claim_id >= self.claim_count:
            raise gl.vm.UserError("CLAIM_NOT_FOUND")
        if self.claim_creator[claim_id] != gl.message.sender_address.as_hex:
            raise gl.vm.UserError("NOT_CLAIM_CREATOR")
        status = self.claim_status[claim_id]
        if status != "OPEN" and status != "REVIEWED":
            raise gl.vm.UserError("CLAIM_NOT_REFUNDABLE")
        marker = self.claim_evidence_marker[claim_id]
        if marker != u256(0):
            evidence_id = marker - u256(1)
            evidence_status = self.evidence_status[evidence_id]
            if evidence_status == "PENDING":
                raise gl.vm.UserError("EVIDENCE_REVIEW_PENDING")
            if evidence_status == "APPROVED":
                raise gl.vm.UserError("APPROVED_PAYOUT_PENDING")
        refund = self._available(claim_id)
        self.claim_status[claim_id] = "CLOSED"
        if refund == u256(0):
            return "CLOSED"
        self.claim_refunded[claim_id] = self.claim_refunded[claim_id] + refund
        self.total_refunded = self.total_refunded + refund
        _Recipient(Address(self.claim_creator[claim_id])).emit_transfer(value=refund)
        return "REFUNDED"

    @gl.public.view
    def get_platform_state(self) -> str:
        return json.dumps(
            {
                "claim_count": int(self.claim_count),
                "contract_balance": str(self.balance),
                "evidence_count": int(self.evidence_count),
                "total_escrowed": str(self.total_escrowed),
                "total_paid": str(self.total_paid),
                "total_refunded": str(self.total_refunded),
                "total_reserved": str(self.total_reserved),
            },
            sort_keys=True,
            separators=(",", ":"),
        )

    @gl.public.view
    def get_claim(self, claim_id: u256) -> str:
        if claim_id >= self.claim_count:
            return json.dumps({"error": "CLAIM_NOT_FOUND"}, sort_keys=True, separators=(",", ":"))
        marker = self.claim_evidence_marker[claim_id]
        evidence_id = int(marker - u256(1)) if marker > u256(0) else -1
        return json.dumps(
            {
                "available": str(self._available(claim_id)),
                "claim_id": int(claim_id),
                "claim_text": self.claim_text[claim_id],
                "context": self.claim_context[claim_id],
                "creator": self.claim_creator[claim_id],
                "escrow": str(self.claim_escrow[claim_id]),
                "evidence_id": evidence_id,
                "min_quality_score": int(self.claim_min_score[claim_id]),
                "paid": str(self.claim_paid[claim_id]),
                "refunded": str(self.claim_refunded[claim_id]),
                "reserved": str(self.claim_reserved[claim_id]),
                "status": self.claim_status[claim_id],
                "title": self.claim_title[claim_id],
            },
            sort_keys=True,
            separators=(",", ":"),
        )

    @gl.public.view
    def get_evidence(self, evidence_id: u256) -> str:
        if evidence_id >= self.evidence_count:
            return json.dumps({"error": "EVIDENCE_NOT_FOUND"}, sort_keys=True, separators=(",", ":"))
        return json.dumps(
            {
                "claim_id": int(self.evidence_claim_id[evidence_id]),
                "confidence_score": int(self.evidence_confidence_score[evidence_id]),
                "evidence_id": int(evidence_id),
                "notes": self.evidence_notes[evidence_id],
                "payout": str(self.evidence_payout[evidence_id]),
                "primary_url": self.evidence_primary_url[evidence_id],
                "quality_score": int(self.evidence_quality_score[evidence_id]),
                "reason": self.evidence_reason[evidence_id],
                "secondary_url": self.evidence_secondary_url[evidence_id],
                "status": self.evidence_status[evidence_id],
                "submitter": self.evidence_submitter[evidence_id],
                "verdict": self.evidence_verdict[evidence_id],
            },
            sort_keys=True,
            separators=(",", ":"),
        )
