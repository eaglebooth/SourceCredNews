# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import typing
import json


class SourceCredNews(gl.Contract):
    claim_creators: TreeMap[u256, str]
    claim_titles: TreeMap[u256, str]
    claim_texts: TreeMap[u256, str]
    claim_contexts: TreeMap[u256, str]
    claim_budgets: TreeMap[u256, u256]
    claim_remaining: TreeMap[u256, u256]
    claim_min_scores: TreeMap[u256, u256]
    claim_statuses: TreeMap[u256, str]
    claim_verdicts: TreeMap[u256, str]
    claim_reasons: TreeMap[u256, str]
    claim_confidence_scores: TreeMap[u256, u256]
    claim_count: u256

    evidence_claim_ids: TreeMap[u256, u256]
    evidence_submitters: TreeMap[u256, str]
    evidence_primary_urls: TreeMap[u256, str]
    evidence_secondary_urls: TreeMap[u256, str]
    evidence_notes: TreeMap[u256, str]
    evidence_statuses: TreeMap[u256, str]
    evidence_quality_scores: TreeMap[u256, u256]
    evidence_reward_percentages: TreeMap[u256, u256]
    evidence_reasons: TreeMap[u256, str]
    evidence_count: u256

    reward_claim_ids: DynArray[u256]
    reward_evidence_ids: DynArray[u256]
    reward_recipients: DynArray[str]
    reward_amounts: DynArray[u256]
    reward_count: u256

    def __init__(self):
        self.claim_count = u256(0)
        self.evidence_count = u256(0)
        self.reward_count = u256(0)

    @gl.public.write
    def create_claim(
        self,
        creator: str,
        title: str,
        claim_text: str,
        context: str,
        bounty_amount: u256,
        min_quality_score: u256,
    ) -> typing.Any:
        if len(creator) == 0:
            return "EMPTY_CREATOR"
        if len(title) == 0:
            return "EMPTY_TITLE"
        if len(claim_text) == 0:
            return "EMPTY_CLAIM"
        if bounty_amount == u256(0):
            return "ZERO_BOUNTY"
        if min_quality_score > u256(100):
            return "BAD_MIN_SCORE"

        claim_id = self.claim_count
        self.claim_creators[claim_id] = creator
        self.claim_titles[claim_id] = title
        self.claim_texts[claim_id] = claim_text
        self.claim_contexts[claim_id] = context
        self.claim_budgets[claim_id] = bounty_amount
        self.claim_remaining[claim_id] = bounty_amount
        self.claim_min_scores[claim_id] = min_quality_score
        self.claim_statuses[claim_id] = "OPEN"
        self.claim_verdicts[claim_id] = ""
        self.claim_reasons[claim_id] = "Waiting for source evidence."
        self.claim_confidence_scores[claim_id] = u256(0)
        self.claim_count = claim_id + u256(1)
        return claim_id

    @gl.public.write
    def submit_evidence(
        self,
        claim_id: u256,
        submitter: str,
        primary_url: str,
        secondary_url: str,
        notes: str,
    ) -> typing.Any:
        if claim_id >= self.claim_count:
            return "CLAIM_NOT_FOUND"
        if self.claim_statuses[claim_id] != "OPEN":
            return "CLAIM_NOT_OPEN"
        if len(submitter) == 0:
            return "EMPTY_SUBMITTER"
        if len(primary_url) == 0:
            return "EMPTY_PRIMARY_URL"
        if self.claim_remaining[claim_id] == u256(0):
            return "NO_BOUNTY_REMAINING"

        evidence_id = self.evidence_count
        self.evidence_claim_ids[evidence_id] = claim_id
        self.evidence_submitters[evidence_id] = submitter
        self.evidence_primary_urls[evidence_id] = primary_url
        self.evidence_secondary_urls[evidence_id] = secondary_url
        self.evidence_notes[evidence_id] = notes
        self.evidence_statuses[evidence_id] = "PENDING"
        self.evidence_quality_scores[evidence_id] = u256(0)
        self.evidence_reward_percentages[evidence_id] = u256(0)
        self.evidence_reasons[evidence_id] = "Evidence submitted and waiting for GenLayer review."
        self.evidence_count = evidence_id + u256(1)
        return evidence_id

    @gl.public.write
    def verify_evidence(self, evidence_id: u256) -> typing.Any:
        if evidence_id >= self.evidence_count:
            return "EVIDENCE_NOT_FOUND"
        if self.evidence_statuses[evidence_id] != "PENDING":
            return "ALREADY_VERIFIED"

        claim_id = self.evidence_claim_ids[evidence_id]
        if claim_id >= self.claim_count:
            return "CLAIM_NOT_FOUND"
        if self.claim_statuses[claim_id] != "OPEN":
            return "CLAIM_NOT_OPEN"

        title = self.claim_titles[claim_id]
        claim_text = self.claim_texts[claim_id]
        context = self.claim_contexts[claim_id]
        min_score = self.claim_min_scores[claim_id]
        submitter = self.evidence_submitters[evidence_id]
        primary_url = self.evidence_primary_urls[evidence_id]
        secondary_url = self.evidence_secondary_urls[evidence_id]
        notes = self.evidence_notes[evidence_id]

        def run_review() -> str:
            primary_content = ""
            secondary_content = ""
            if len(primary_url) > 0:
                primary_response = gl.nondet.web.get(primary_url)
                primary_content = primary_response.body.decode("utf-8")
            if len(secondary_url) > 0:
                secondary_response = gl.nondet.web.get(secondary_url)
                secondary_content = secondary_response.body.decode("utf-8")
            if len(primary_content) > 3300:
                primary_content = primary_content[:3300]
            if len(secondary_content) > 2500:
                secondary_content = secondary_content[:2500]

            prompt = (
                "You are SourceCred News, a GenLayer on-chain fact-checking adjudicator. "
                "Review whether submitted web sources support, contradict, or fail to clarify a public claim. "
                "Score each category from 0 to 100: source_reliability, direct_relevance, corroboration, "
                "contradiction_detection, and evidence_quality. "
                "Final quality_score is the average of those five scores. "
                "Claim verdict thresholds: SUPPORTED when reliable sources directly confirm the claim; "
                "CONTRADICTED when reliable sources directly refute it; "
                "MISLEADING when the claim is partly true but omits important context; "
                "UNCLEAR when sources are weak, unavailable, or insufficient. "
                "Reward percentage: 100 if quality_score >= min_quality_score and verdict is not UNCLEAR; "
                "50 if quality_score >= 55 and evidence is useful; otherwise 0. "
                "Check semantic truth and source quality, not just URL shape. "
                f"Title: {title}\n"
                f"Claim: {claim_text}\n"
                f"Context: {context}\n"
                f"Minimum quality score: {min_score}\n"
                f"Submitter: {submitter}\n"
                f"Submitter notes: {notes}\n"
                f"Primary source content: {primary_content}\n"
                f"Secondary source content: {secondary_content}\n"
                "Respond with ONLY strict JSON, no markdown, no prose. "
                "Use this schema exactly: "
                "{{\"verdict\":\"SUPPORTED|CONTRADICTED|UNCLEAR|MISLEADING\","
                "\"quality_score\":0,\"confidence_score\":0,\"reward_percentage\":0,"
                "\"reason\":\"short reason\","
                "\"source_reliability\":0,\"direct_relevance\":0,\"corroboration\":0,"
                "\"contradiction_detection\":0,\"evidence_quality\":0}}"
            )
            return gl.nondet.exec_prompt(prompt)

        result = gl.eq_principle.strict_eq(run_review)
        data = json.loads(result)
        verdict = str(data["verdict"])
        quality_score = u256(int(data["quality_score"]))
        confidence_score = u256(int(data["confidence_score"]))
        reward_percentage = u256(int(data["reward_percentage"]))
        reason = str(data["reason"])

        if quality_score > u256(100):
            return "BAD_QUALITY_SCORE"
        if confidence_score > u256(100):
            return "BAD_CONFIDENCE_SCORE"
        if reward_percentage > u256(100):
            return "BAD_REWARD_PERCENTAGE"

        if verdict != "SUPPORTED" and verdict != "CONTRADICTED" and verdict != "UNCLEAR" and verdict != "MISLEADING":
            return "UNKNOWN_VERDICT"
        if reward_percentage == u256(100) and quality_score < min_score:
            return "QUALITY_BELOW_MIN"

        if reward_percentage == u256(0):
            self.evidence_statuses[evidence_id] = "REJECTED"
        elif reward_percentage == u256(100):
            self.evidence_statuses[evidence_id] = "APPROVED_FULL"
        else:
            self.evidence_statuses[evidence_id] = "APPROVED_PARTIAL"

        self.evidence_quality_scores[evidence_id] = quality_score
        self.evidence_reward_percentages[evidence_id] = reward_percentage
        self.evidence_reasons[evidence_id] = reason
        self.claim_verdicts[claim_id] = verdict
        self.claim_confidence_scores[claim_id] = confidence_score
        self.claim_reasons[claim_id] = reason
        if verdict != "UNCLEAR":
            self.claim_statuses[claim_id] = "VERIFIED"
        return result

    @gl.public.write
    def release_reward(self, evidence_id: u256) -> typing.Any:
        if evidence_id >= self.evidence_count:
            return "EVIDENCE_NOT_FOUND"

        status = self.evidence_statuses[evidence_id]
        if status != "APPROVED_FULL" and status != "APPROVED_PARTIAL":
            return "NOT_APPROVED"

        claim_id = self.evidence_claim_ids[evidence_id]
        remaining = self.claim_remaining[claim_id]
        if remaining == u256(0):
            return "NO_BOUNTY_REMAINING"

        reward_percentage = self.evidence_reward_percentages[evidence_id]
        if reward_percentage == u256(0):
            return "ZERO_REWARD"
        if reward_percentage > u256(100):
            return "BAD_REWARD_PERCENTAGE"

        amount = self.claim_budgets[claim_id] * reward_percentage // u256(100)
        if amount == u256(0):
            return "ZERO_AMOUNT"
        if amount > remaining:
            return "INSUFFICIENT_BOUNTY"

        new_remaining = remaining - amount
        self.claim_remaining[claim_id] = new_remaining
        self.evidence_statuses[evidence_id] = "PAID"

        self.reward_claim_ids.append(claim_id)
        self.reward_evidence_ids.append(evidence_id)
        self.reward_recipients.append(self.evidence_submitters[evidence_id])
        self.reward_amounts.append(amount)
        self.reward_count = self.reward_count + u256(1)
        return "PAID"

    @gl.public.write
    def close_claim(self, claim_id: u256) -> typing.Any:
        if claim_id >= self.claim_count:
            return "CLAIM_NOT_FOUND"
        if self.claim_statuses[claim_id] == "CLOSED":
            return "ALREADY_CLOSED"
        self.claim_statuses[claim_id] = "CLOSED"
        return "CLOSED"

    @gl.public.view
    def get_claim(self, claim_id: u256) -> typing.Any:
        if claim_id >= self.claim_count:
            return "CLAIM_NOT_FOUND"
        return json.dumps(
            {
                "claim_id": int(claim_id),
                "creator": self.claim_creators[claim_id],
                "title": self.claim_titles[claim_id],
                "claim_text": self.claim_texts[claim_id],
                "context": self.claim_contexts[claim_id],
                "budget": int(self.claim_budgets[claim_id]),
                "remaining": int(self.claim_remaining[claim_id]),
                "min_quality_score": int(self.claim_min_scores[claim_id]),
                "status": self.claim_statuses[claim_id],
                "verdict": self.claim_verdicts[claim_id],
                "confidence_score": int(self.claim_confidence_scores[claim_id]),
                "reason": self.claim_reasons[claim_id],
            },
            sort_keys=True,
            separators=(",", ":"),
        )

    @gl.public.view
    def get_evidence(self, evidence_id: u256) -> typing.Any:
        if evidence_id >= self.evidence_count:
            return "EVIDENCE_NOT_FOUND"
        return json.dumps(
            {
                "evidence_id": int(evidence_id),
                "claim_id": int(self.evidence_claim_ids[evidence_id]),
                "submitter": self.evidence_submitters[evidence_id],
                "primary_url": self.evidence_primary_urls[evidence_id],
                "secondary_url": self.evidence_secondary_urls[evidence_id],
                "notes": self.evidence_notes[evidence_id],
                "status": self.evidence_statuses[evidence_id],
                "quality_score": int(self.evidence_quality_scores[evidence_id]),
                "reward_percentage": int(self.evidence_reward_percentages[evidence_id]),
                "reason": self.evidence_reasons[evidence_id],
            },
            sort_keys=True,
            separators=(",", ":"),
        )

    @gl.public.view
    def get_claim_count(self) -> u256:
        return self.claim_count

    @gl.public.view
    def get_evidence_count(self) -> u256:
        return self.evidence_count

    @gl.public.view
    def get_reward_count(self) -> u256:
        return self.reward_count

    @gl.public.view
    def get_reward(self, reward_id: u256) -> typing.Any:
        if reward_id >= self.reward_count:
            return "REWARD_NOT_FOUND"
        return json.dumps(
            {
                "reward_id": int(reward_id),
                "claim_id": int(self.reward_claim_ids[reward_id]),
                "evidence_id": int(self.reward_evidence_ids[reward_id]),
                "recipient": self.reward_recipients[reward_id],
                "amount": int(self.reward_amounts[reward_id]),
            },
            sort_keys=True,
            separators=(",", ":"),
        )
