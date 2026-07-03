"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  FileSearch,
  HandCoins,
  Loader2,
  Newspaper,
  PenLine,
  SearchCheck,
  ShieldQuestion,
  Wallet,
} from "lucide-react";
import { useState, useEffect } from "react";
import { connectWallet, readContract, writeContract } from "@/lib/genlayer";

type Tone = "ok" | "warn" | "bad";

type LogEntry = {
  label: string;
  value: string;
  tone: Tone;
};

type VerificationView = {
  claimId: string;
  evidenceId: string;
  status: string;
  verdict: string;
  quality: string;
  confidence: string;
  reward: string;
  reason: string;
};

const statusClass: Record<string, string> = {
  DRAFT: "bg-white",
  OPEN: "bg-[var(--sky)]",
  PENDING: "bg-[var(--butter)]",
  APPROVED_FULL: "bg-[var(--mint)]",
  APPROVED_PARTIAL: "bg-[var(--butter)]",
  REJECTED: "bg-[var(--blush)]",
  PAID: "bg-[var(--ink)] text-white",
  VERIFIED: "bg-[var(--mint)]",
};

export default function Home() {
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
  const networkName = process.env.NEXT_PUBLIC_NETWORK || "testnetAsimov";
  const contractConfigured = Boolean(contractAddress);
  const [wallet, setWallet] = useState("");
  const [busy, setBusy] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      label: "Ready",
      value: contractConfigured
        ? `Contract ${contractAddress.slice(0, 6)}...${contractAddress.slice(-4)} on ${networkName}.`
        : "Demo mode active. Add NEXT_PUBLIC_CONTRACT_ADDRESS after Studio deploy.",
      tone: contractConfigured ? "ok" : "warn",
    },
  ]);

  const [view, setView] = useState<VerificationView>({
    claimId: "-",
    evidenceId: "-",
    status: "DRAFT",
    verdict: "-",
    quality: "0",
    confidence: "0",
    reward: "0",
    reason: "Frame a public claim, submit source URLs, then let GenLayer verify the evidence.",
  });

  const [claimForm, setClaimForm] = useState({
    creator: "Civic Desk DAO",
    title: "Battery plant funding announcement",
    claimText:
      "The city council approved a new public grant for the North River battery plant this week.",
    context:
      "Verify whether the announcement is supported by official council records or reliable local reporting.",
    bounty: "900",
    minScore: "78",
  });

  const [evidenceForm, setEvidenceForm] = useState({
    submitter: "source-maya",
    primaryUrl: "https://example.com/city-council-battery-plant-grant",
    secondaryUrl: "https://example.com/local-news-north-river-plant",
    notes:
      "Primary source is a council agenda summary; secondary source is local coverage with quotes and dates.",
  });

  function pushLog(entry: LogEntry) {
    setLogs((current) => [entry, ...current].slice(0, 5));
  }

  async function syncState() {
    setBusy("sync");
    try {
      const [claimCountRes, evidenceCountRes, rewardCountRes] = await Promise.all([
        readContract("get_claim_count"),
        readContract("get_evidence_count"),
        readContract("get_reward_count"),
      ]);

      if (!claimCountRes.success || !evidenceCountRes.success || !rewardCountRes.success) {
        const err = claimCountRes.error || evidenceCountRes.error || rewardCountRes.error || "RPC connection failed";
        pushLog({ label: "Sync failed", value: err, tone: "warn" });
        return;
      }

      const cCount = Number(claimCountRes.data);
      const eCount = Number(evidenceCountRes.data);
      const rCount = Number(rewardCountRes.data);

      pushLog({
        label: "Sync success",
        value: `Connected to GenLayer. Found ${cCount} claims, ${eCount} evidence submissions, ${rCount} rewards.`,
        tone: "ok",
      });
    } catch (error) {
      pushLog({
        label: "Sync error",
        value: error instanceof Error ? error.message : "Unknown error during sync",
        tone: "bad",
      });
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    if (contractConfigured) {
      syncState();
    }
  }, []);

  async function handleWallet() {
    setBusy("wallet");
    const result = await connectWallet();
    if (result.success && typeof result.data === "string") {
      setWallet(result.data);
      pushLog({ label: "Wallet", value: result.data, tone: "ok" });
    } else {
      pushLog({ label: "Wallet", value: result.error || "No wallet provider found", tone: "warn" });
    }
    setBusy("");
  }

  async function createClaim() {
    setBusy("claim");
    if (!contractConfigured) {
      setView((current) => ({
        ...current,
        claimId: "0",
        status: "OPEN",
        reason: "Demo claim bounty opened with 900 tokens reserved for high-quality source evidence.",
      }));
      pushLog({ label: "Claim", value: "Created demo verification claim #0.", tone: "ok" });
      setBusy("");
      return;
    }

    const result = await writeContract("create_claim", [
      claimForm.creator,
      claimForm.title,
      claimForm.claimText,
      claimForm.context,
      Number(claimForm.bounty || "0"),
      Number(claimForm.minScore || "0"),
    ]);
    pushLog({
      label: "create_claim",
      value: result.success ? `Finalized ${String(result.data ?? result.hash)}` : result.error || "Failed",
      tone: result.success ? "ok" : "bad",
    });
    if (result.success) {
      const claimId = typeof result.data === "number" || typeof result.data === "string" ? String(result.data) : "0";
      setView((current) => ({
        ...current,
        claimId,
        status: "OPEN",
        reason: `Claim #${claimId} was created on GenLayer. Submit source evidence next.`,
      }));
    }
    setBusy("");
  }

  async function submitEvidence() {
    setBusy("evidence");
    if (!contractConfigured) {
      setView({
        claimId: "0",
        evidenceId: "0",
        status: "PENDING",
        verdict: "-",
        quality: "0",
        confidence: "0",
        reward: "0",
        reason: "Two source URLs submitted. SourceCred News is ready to verify semantic support.",
      });
      pushLog({ label: "Evidence", value: "Submitted demo source packet #0.", tone: "ok" });
      setBusy("");
      return;
    }

    const result = await writeContract("submit_evidence", [
      Number(view.claimId === "-" ? "0" : view.claimId),
      evidenceForm.submitter,
      evidenceForm.primaryUrl,
      evidenceForm.secondaryUrl,
      evidenceForm.notes,
    ]);
    pushLog({
      label: "submit_evidence",
      value: result.success ? `Finalized ${String(result.data ?? result.hash)}` : result.error || "Failed",
      tone: result.success ? "ok" : "bad",
    });
    if (result.success) {
      const evidenceId =
        typeof result.data === "number" || typeof result.data === "string" ? String(result.data) : "0";
      setView((current) => ({
        ...current,
        evidenceId,
        status: "PENDING",
        reason: `Evidence #${evidenceId} was submitted to the configured GenLayer contract.`,
      }));
    }
    setBusy("");
  }

  async function verifyEvidence() {
    setBusy("verify");
    if (!contractConfigured) {
      await new Promise((resolve) => setTimeout(resolve, 650));
      setView({
        claimId: "0",
        evidenceId: "0",
        status: "APPROVED_FULL",
        verdict: "SUPPORTED",
        quality: "88",
        confidence: "84",
        reward: "100",
        reason:
          "The sources directly support the claim with dated council records and corroborating local reporting.",
      });
      pushLog({ label: "AI verdict", value: "SUPPORTED. Quality 88, reward 100%.", tone: "ok" });
      setBusy("");
      return;
    }

    const evidenceId = Number(view.evidenceId === "-" ? "0" : view.evidenceId);
    const result = await writeContract("verify_evidence", [evidenceId]);
    pushLog({
      label: "verify_evidence",
      value: result.success ? `AI verdict ${String(result.data ?? result.hash)}` : result.error || "Failed",
      tone: result.success ? "ok" : "bad",
    });
    if (result.success) {
      const evidenceRead = await readContract("get_evidence", [evidenceId]);
      const claimRead = await readContract("get_claim", [Number(view.claimId === "-" ? "0" : view.claimId)]);
      if (evidenceRead.success && claimRead.success && typeof evidenceRead.data === "string" && typeof claimRead.data === "string") {
        const evidence = JSON.parse(evidenceRead.data);
        const claim = JSON.parse(claimRead.data);
        setView({
          claimId: String(evidence.claim_id || "0"),
          evidenceId: String(evidence.evidence_id || "0"),
          status: String(evidence.status || "PENDING"),
          verdict: String(claim.verdict || "-"),
          quality: String(evidence.quality_score || "0"),
          confidence: String(claim.confidence_score || "0"),
          reward: String(evidence.reward_percentage || "0"),
          reason: String(evidence.reason || claim.reason || ""),
        });
      }
    }
    setBusy("");
  }

  async function releaseReward() {
    setBusy("reward");
    if (!contractConfigured) {
      const canPay = view.status === "APPROVED_FULL" || view.status === "APPROVED_PARTIAL";
      setView((current) => ({
        ...current,
        status: canPay ? "PAID" : current.status,
        reason: canPay ? "Demo reward ledger paid 900 tokens to source-maya." : "Evidence must be approved before reward release.",
      }));
      pushLog({ label: "Reward", value: canPay ? "Released demo reward." : "Blocked until approved.", tone: canPay ? "ok" : "warn" });
      setBusy("");
      return;
    }

    const result = await writeContract("release_reward", [Number(view.evidenceId === "-" ? "0" : view.evidenceId)]);
    pushLog({
      label: "release_reward",
      value: result.success ? `Finalized ${String(result.data ?? result.hash)}` : result.error || "Failed",
      tone: result.success ? "ok" : "bad",
    });
    if (result.success) {
      setView((current) => ({ ...current, status: "PAID", reason: "Source reward was finalized on GenLayer." }));
    }
    setBusy("");
  }

  async function startVerification() {
    document.getElementById("case-study")?.scrollIntoView({ behavior: "smooth", block: "start" });
    await createClaim();
    await submitEvidence();
    await verifyEvidence();
  }

  return (
    <main className="min-h-screen overflow-hidden">
      <header className="mx-auto mt-7 flex max-w-6xl items-center justify-between rounded-[22px] px-7 py-4 nav-shell">
        <a href="#" className="text-3xl font-semibold tracking-[-0.05em]">SourceCred</a>
        <nav className="hidden items-center gap-9 text-sm font-semibold md:flex">
          <a href="#case-study">Verify</a>
          <a href="#process">Process</a>
          <a href="#numbers">Metrics</a>
          <a href="#ledger">Ledger</a>
        </nav>
        <button onClick={handleWallet} className="ink-button flex h-10 items-center gap-2 rounded-[12px] px-4 text-sm font-bold">
          {busy === "wallet" ? <Loader2 className="animate-spin" size={16} /> : <Wallet size={16} />}
          {wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "Connect"}
        </button>
      </header>

      <section className="relative mx-auto max-w-7xl px-5 pb-28 pt-40 text-center">
        <div className="sticker absolute left-[8%] top-40 hidden -rotate-12 rounded-full px-5 py-3 text-sm font-semibold md:block">
          Multi-source proof
        </div>
        <div className="sticker sticker-pink absolute right-[8%] top-64 hidden rotate-12 rounded-full px-5 py-3 text-sm font-semibold md:block">
          Reward credible sources
        </div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="mx-auto max-w-5xl text-6xl font-semibold leading-[1.05] tracking-[-0.07em] md:text-8xl">
            Hello! <span className="inline-grid size-20 translate-y-2 place-items-center rounded-full border border-[var(--line)] bg-[var(--butter)] md:size-24">
              <Newspaper size={44} />
            </span>{" "}
            I&apos;m SourceCred,
            <br />
            a truth verification desk.
          </h1>
          <p className="mx-auto mt-8 max-w-3xl text-xl leading-9 text-[var(--muted)]">
            I reward people who submit reliable sources, while GenLayer reads the web and decides whether a public
            claim is supported, contradicted, misleading, or still unclear.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <button onClick={startVerification} disabled={Boolean(busy)} className="dark-button flex h-13 items-center gap-2 rounded-[16px] px-7 font-bold disabled:opacity-60">
              {busy ? <Loader2 className="animate-spin" size={17} /> : <SearchCheck size={17} />}
              Start source review
              <ArrowRight size={17} />
            </button>
            <a href="#case-study" className="ink-button flex h-13 items-center gap-2 rounded-[16px] px-7 font-bold">
              Open verification desk
              <PenLine size={17} />
            </a>
          </div>
        </motion.div>
      </section>

      <section id="case-study" className="bg-[var(--paper)] px-5 py-24">
        <div className="mx-auto max-w-6xl text-center">
          <h2 className="text-5xl font-semibold tracking-[-0.055em]">Selected verification work</h2>
          <p className="mx-auto mt-5 max-w-3xl text-xl leading-8 text-[var(--muted)]">
            A real contract flow wrapped like a case study: frame the claim, submit source evidence, ask validators to
            reason, then release rewards.
          </p>
        </div>

        <div className="case-card mx-auto mt-16 grid max-w-6xl gap-9 rounded-[28px] p-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="flex flex-col justify-center">
            <div className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Claim desk</div>
            <h3 className="mt-5 text-4xl font-semibold tracking-[-0.05em]">The public claim</h3>
            <p className="mt-5 text-lg leading-8 text-[var(--muted)]">
              SourceCred News does not reward opinions. It rewards evidence that helps a contract reach a transparent
              verification verdict.
            </p>
            <div className="mt-7 grid gap-3">
              <Metric label="Claim" value={`#${view.claimId}`} />
              <Metric label="Evidence" value={`#${view.evidenceId}`} />
              <Metric label="Verdict" value={view.verdict} />
            </div>
          </div>

          <div className="paper-stack rounded-[28px] bg-[var(--paper)] p-5">
            <div className="grid gap-4 rounded-[24px] border border-[var(--line)] bg-[var(--blush)] p-5">
              <Panel title="1. Frame claim" icon={<ShieldQuestion size={18} />}>
                <Field label="Creator" value={claimForm.creator} onChange={(creator) => setClaimForm({ ...claimForm, creator })} />
                <Field label="Title" value={claimForm.title} onChange={(title) => setClaimForm({ ...claimForm, title })} />
                <Field label="Claim text" value={claimForm.claimText} onChange={(claimText) => setClaimForm({ ...claimForm, claimText })} area />
                <Field label="Context" value={claimForm.context} onChange={(context) => setClaimForm({ ...claimForm, context })} area />
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Bounty" value={claimForm.bounty} onChange={(bounty) => setClaimForm({ ...claimForm, bounty })} />
                  <Field label="Min quality score" value={claimForm.minScore} onChange={(minScore) => setClaimForm({ ...claimForm, minScore })} />
                </div>
                <ActionButton busy={busy === "claim"} onClick={createClaim} icon={<BookOpenCheck size={17} />}>
                  Create claim bounty
                </ActionButton>
              </Panel>

              <Panel title="2. Submit sources" icon={<FileSearch size={18} />}>
                <Field label="Submitter" value={evidenceForm.submitter} onChange={(submitter) => setEvidenceForm({ ...evidenceForm, submitter })} />
                <Field label="Primary source URL" value={evidenceForm.primaryUrl} onChange={(primaryUrl) => setEvidenceForm({ ...evidenceForm, primaryUrl })} />
                <Field label="Secondary source URL" value={evidenceForm.secondaryUrl} onChange={(secondaryUrl) => setEvidenceForm({ ...evidenceForm, secondaryUrl })} />
                <Field label="Source notes" value={evidenceForm.notes} onChange={(notes) => setEvidenceForm({ ...evidenceForm, notes })} area />
                <ActionButton busy={busy === "evidence"} onClick={submitEvidence} icon={<BadgeCheck size={17} />}>
                  Submit source packet
                </ActionButton>
              </Panel>
            </div>
          </div>
        </div>
      </section>

      <section id="process" className="mx-auto grid max-w-7xl gap-10 px-5 py-24 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <h2 className="max-w-xl text-5xl font-semibold leading-tight tracking-[-0.055em]">
            High-quality sources with real value considered.
          </h2>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[var(--muted)]">
            The workflow starts with a public claim, asks contributors for source packets, then lets GenLayer judge
            support, contradiction, missing context, and reward quality.
          </p>
          <a href="#ledger" className="ink-button mt-8 inline-flex h-12 items-center rounded-[14px] px-6 font-bold">
            See ledger
          </a>
        </div>
        <div className="grid gap-5">
          <ProcessCard number="01" color="bg-[var(--blush)]" title="Problem framing" icon={<ShieldQuestion />}>
            Turn a vague rumor into a specific claim with context and a bounty for useful source evidence.
          </ProcessCard>
          <ProcessCard number="02" color="bg-[var(--mint)]" title="Source packet" icon={<FileSearch />}>
            Contributors submit primary and secondary URLs with notes explaining relevance.
          </ProcessCard>
          <ProcessCard number="03" color="bg-[var(--butter)]" title="On-chain verification" icon={<SearchCheck />}>
            GenLayer reads the web, weighs reliability and contradictions, then stores a claim verdict.
          </ProcessCard>
        </div>
      </section>

      <section id="ledger" className="bg-[var(--paper)] px-5 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="text-5xl font-semibold tracking-[-0.055em]">Verification ledger</h2>
              <p className="mt-5 text-lg leading-8 text-[var(--muted)]">{view.reason}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <ActionButton busy={busy === "verify"} onClick={verifyEvidence} icon={<SearchCheck size={17} />}>
                  Verify evidence
                </ActionButton>
                <ActionButton busy={busy === "reward"} onClick={releaseReward} icon={<HandCoins size={17} />}>
                  Release source reward
                </ActionButton>
              </div>
            </div>
            <div className="soft-card rounded-[28px] bg-[var(--sky)] p-6">
              <div className="flex items-center justify-between">
                <div className={`inline-flex rounded-full border border-[var(--line)] px-4 py-2 text-sm font-bold ${statusClass[view.status] || statusClass.DRAFT}`}>
                  {view.status}
                </div>
                <button
                  onClick={syncState}
                  disabled={Boolean(busy)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-4 text-xs font-bold shadow-[2px_2px_0_var(--line)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_var(--line)] disabled:opacity-50"
                >
                  <Loader2 size={12} className={busy === "sync" ? "animate-spin" : ""} />
                  {busy === "sync" ? "Syncing..." : "Sync Contract"}
                </button>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <Metric label="Quality" value={view.quality} large />
                <Metric label="Confidence" value={view.confidence} large />
                <Metric label="Reward %" value={view.reward} large />
              </div>
              <div className="mt-6 grid gap-2">
                {logs.map((entry) => (
                  <div key={`${entry.label}-${entry.value}`} className={`rounded-[16px] border border-[var(--line)] px-4 py-3 text-sm ${logClass(entry.tone)}`}>
                    <span className="font-bold">{entry.label}:</span>{" "}
                    <span>{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="numbers" className="px-5 py-24 text-center">
        <h2 className="text-5xl font-semibold tracking-[-0.055em]">The source desk says it all</h2>
        <p className="mx-auto mt-5 max-w-3xl text-xl leading-8 text-[var(--muted)]">
          These numbers reflect a verification flow designed for useful sources, not noisy takes.
        </p>
        <div className="mx-auto mt-12 flex max-w-5xl flex-wrap justify-center gap-6">
          <Stat number="2+" label="sources per packet" />
          <Stat number="4" label="claim verdicts" />
          <Stat number="100%" label="on-chain reward guard" />
          <Stat number="5" label="quality checks" />
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  area = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  area?: boolean;
}) {
  const className = "field rounded-[12px] px-3 py-2.5 text-sm";
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted)]">{label}</span>
      {area ? (
        <textarea className={`${className} min-h-20 resize-none`} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input className={className} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border border-[var(--line)] bg-[var(--paper)] p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold">
        <span className="grid size-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--mint)]">
          {icon}
        </span>
        {title}
      </div>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

function ActionButton({
  children,
  icon,
  busy,
  onClick,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={busy} className="ink-button flex h-11 items-center justify-center gap-2 rounded-[14px] px-4 text-sm font-bold disabled:opacity-60">
      {busy ? <Loader2 className="animate-spin" size={17} /> : icon}
      {children}
    </button>
  );
}

function Metric({ label, value, large = false }: { label: string; value: string; large?: boolean }) {
  return (
    <div className="rounded-[18px] border border-[var(--line)] bg-[var(--paper)] p-4">
      <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</div>
      <div className={`${large ? "outline-text text-5xl" : "text-2xl"} mt-2 font-semibold tracking-[-0.05em]`}>
        {value}
      </div>
    </div>
  );
}

function ProcessCard({
  number,
  color,
  title,
  icon,
  children,
}: {
  number: string;
  color: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`soft-card rounded-[28px] ${color} p-8`}>
      <div className="flex items-start justify-between">
        <span className="grid size-16 place-items-center rounded-full border border-[var(--line)] bg-[var(--paper)]">
          {icon}
        </span>
        <span className="text-lg">({number})</span>
      </div>
      <h3 className="mt-8 text-2xl font-semibold tracking-[-0.04em]">{title}</h3>
      <p className="mt-4 text-lg leading-8 text-[var(--muted)]">{children}</p>
    </div>
  );
}

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div className="case-card flex min-w-[250px] items-center gap-5 rounded-full px-7 py-5 text-left">
      <span className="outline-text text-5xl font-semibold tracking-[-0.06em]">{number}</span>
      <span className="text-lg leading-6">{label}</span>
    </div>
  );
}

function logClass(tone: Tone) {
  if (tone === "ok") {
    return "bg-[var(--mint)]";
  }
  if (tone === "bad") {
    return "bg-[var(--blush)]";
  }
  return "bg-[var(--butter)]";
}
