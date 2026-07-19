"use client";

import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CircleDollarSign,
  ExternalLink,
  FileSearch,
  Loader2,
  Newspaper,
  RefreshCw,
  RotateCcw,
  Scale,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  configuredNetwork,
  connectWallet,
  defaultContractAddress,
  readContract,
  writeContract,
} from "@/lib/genlayer";

type Platform = {
  claim_count: number;
  evidence_count: number;
  contract_balance: string;
  total_escrowed: string;
  total_reserved: string;
  total_paid: string;
  total_refunded: string;
};

type Claim = {
  available: string;
  claim_id: number;
  claim_text: string;
  context: string;
  creator: string;
  escrow: string;
  evidence_id: number;
  min_quality_score: number;
  paid: string;
  refunded: string;
  reserved: string;
  status: string;
  title: string;
};

type Evidence = {
  claim_id: number;
  confidence_score: number;
  evidence_id: number;
  notes: string;
  payout: string;
  primary_url: string;
  quality_score: number;
  reason: string;
  secondary_url: string;
  status: string;
  submitter: string;
  verdict: string;
};

type Notice = { tone: "info" | "success" | "error"; text: string; hash?: string };
type Mode = "directory" | "create" | "claim" | "contract";

const emptyPlatform: Platform = {
  claim_count: 0,
  evidence_count: 0,
  contract_balance: "0",
  total_escrowed: "0",
  total_reserved: "0",
  total_paid: "0",
  total_refunded: "0",
};

const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const addressKey = "sourcecred.contractAddress";

function initialAddress() {
  const fallback = defaultContractAddress();
  if (typeof window === "undefined") return fallback;
  const saved = window.localStorage.getItem(addressKey);
  return saved && addressPattern.test(saved) ? saved : fallback;
}

function parseRecord<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

function short(value: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "Not connected";
}

function toWei(value: string) {
  if (!/^\d+(\.\d{0,18})?$/.test(value.trim())) throw new Error("Enter a valid GEN amount.");
  const [whole = "0", fraction = ""] = value.trim().split(".");
  return BigInt(`${whole}${fraction.padEnd(18, "0")}`.replace(/^0+(?=\d)/, "") || "0");
}

function fromWei(value: string | number | bigint) {
  const raw = BigInt(value || 0).toString().padStart(19, "0");
  const whole = raw.slice(0, -18);
  const fraction = raw.slice(-18).slice(0, 4).replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""} GEN`;
}

async function waitFor(read: () => Promise<boolean>, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await read()) return true;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return false;
}

export default function Home() {
  const fallbackAddress = defaultContractAddress();
  const [address, setAddress] = useState(initialAddress);
  const [addressDraft, setAddressDraft] = useState(initialAddress);
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<Mode>("directory");
  const [platform, setPlatform] = useState<Platform>(emptyPlatform);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [claimForm, setClaimForm] = useState({
    title: "",
    claimText: "",
    context: "",
    escrow: "1",
    minScore: "75",
  });
  const [evidenceForm, setEvidenceForm] = useState({ primaryUrl: "", secondaryUrl: "", notes: "" });

  const selectedClaim = useMemo(
    () => claims.find((item) => item.claim_id === selectedClaimId) || null,
    [claims, selectedClaimId],
  );
  const selectedEvidence = useMemo(
    () => evidence.find((item) => item.claim_id === selectedClaimId) || null,
    [evidence, selectedClaimId],
  );

  const readPlatform = useCallback(async () => {
    const result = await readContract(address, "get_platform_state");
    return result.success ? parseRecord<Platform>(result.data) : null;
  }, [address]);

  const readClaim = useCallback(async (id: number) => {
    const result = await readContract(address, "get_claim", [id]);
    if (!result.success) return null;
    const parsed = parseRecord<Claim & { error?: string }>(result.data);
    return parsed.error ? null : parsed;
  }, [address]);

  const readEvidence = useCallback(async (id: number) => {
    const result = await readContract(address, "get_evidence", [id]);
    if (!result.success) return null;
    const parsed = parseRecord<Evidence & { error?: string }>(result.data);
    return parsed.error ? null : parsed;
  }, [address]);

  const sync = useCallback(async (silent = false) => {
    if (!addressPattern.test(address)) {
      if (!silent) setNotice({ tone: "error", text: "Configure the deployed SourceCred V2 contract first." });
      return;
    }
    if (!silent) setBusy("sync");
    const nextPlatform = await readPlatform();
    if (!nextPlatform) {
      setNotice({ tone: "error", text: "Contract sync failed. Confirm the address belongs to this Studionet deployment." });
      setBusy("");
      return;
    }
    const nextClaims: Claim[] = [];
    const nextEvidence: Evidence[] = [];
    for (let id = nextPlatform.claim_count - 1; id >= Math.max(0, nextPlatform.claim_count - 30); id -= 1) {
      const item = await readClaim(id);
      if (item) nextClaims.push(item);
    }
    for (let id = nextPlatform.evidence_count - 1; id >= Math.max(0, nextPlatform.evidence_count - 30); id -= 1) {
      const item = await readEvidence(id);
      if (item) nextEvidence.push(item);
    }
    setPlatform(nextPlatform);
    setClaims(nextClaims);
    setEvidence(nextEvidence);
    if (!silent) setNotice({ tone: "success", text: `Live state loaded from ${configuredNetwork}.` });
    setBusy("");
  }, [address, readClaim, readEvidence, readPlatform]);

  useEffect(() => {
    if (!addressPattern.test(address)) return;
    const timer = window.setTimeout(() => void sync(true), 0);
    return () => window.clearTimeout(timer);
  }, [address, sync]);

  async function connect() {
    setBusy("wallet");
    const result = await connectWallet();
    if (result.success && typeof result.data === "string") {
      setWallet(result.data);
      setNotice({ tone: "success", text: `Wallet ${short(result.data)} connected.` });
      setBusy("");
      return true;
    }
    setNotice({ tone: "error", text: result.error || "Wallet connection failed." });
    setBusy("");
    return false;
  }

  async function runWrite(
    key: string,
    functionName: string,
    args: unknown[],
    value: bigint,
    verify: () => Promise<boolean>,
    successText: string,
  ) {
    if (!wallet) {
      const connected = await connect();
      if (connected) setNotice({ tone: "info", text: "Wallet connected. Review the action, then submit it again." });
      return false;
    }
    setBusy(key);
    setNotice({ tone: "info", text: "Confirm the transaction in your wallet. Do not submit it twice." });
    const result = await writeContract(address, functionName, args, value);
    if (!result.success) {
      setNotice({ tone: result.pending ? "info" : "error", text: result.error || "Transaction failed.", hash: result.hash });
      setBusy("");
      return false;
    }
    setNotice({ tone: "info", text: "Transaction accepted. Waiting for indexed contract state; do not resubmit.", hash: result.hash });
    const verified = await waitFor(verify);
    if (!verified) {
      setNotice({ tone: "info", text: "Studionet is still indexing this accepted transaction. Use Sync instead of resubmitting.", hash: result.hash });
      setBusy("");
      return false;
    }
    await sync(true);
    setNotice({ tone: "success", text: successText, hash: result.hash });
    setBusy("");
    return true;
  }

  async function createClaim() {
    const before = platform.claim_count;
    if (claimForm.title.trim().length < 5 || claimForm.claimText.trim().length < 30) {
      setNotice({ tone: "error", text: "Add a specific title and a public claim of at least 30 characters." });
      return;
    }
    let escrow: bigint;
    try {
      escrow = toWei(claimForm.escrow);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Invalid GEN amount." });
      return;
    }
    const ok = await runWrite(
      "create",
      "create_claim",
      [claimForm.title.trim(), claimForm.claimText.trim(), claimForm.context.trim(), Number(claimForm.minScore)],
      escrow,
      async () => (await readPlatform())?.claim_count === before + 1,
      "Funded verification claim created on-chain.",
    );
    if (ok) {
      setSelectedClaimId(before);
      setMode("claim");
    }
  }

  async function submitEvidence() {
    if (!selectedClaim) return;
    const before = platform.evidence_count;
    if (!evidenceForm.primaryUrl.startsWith("https://") || !evidenceForm.secondaryUrl.startsWith("https://")) {
      setNotice({ tone: "error", text: "Provide two HTTPS source URLs from independent publishers." });
      return;
    }
    const ok = await runWrite(
      "submit",
      "submit_evidence",
      [selectedClaim.claim_id, evidenceForm.primaryUrl.trim(), evidenceForm.secondaryUrl.trim(), evidenceForm.notes.trim()],
      BigInt(0),
      async () => (await readPlatform())?.evidence_count === before + 1,
      "Independent source packet recorded on-chain.",
    );
    if (ok) await sync(true);
  }

  async function evaluateEvidence() {
    if (!selectedEvidence) return;
    const id = selectedEvidence.evidence_id;
    await runWrite(
      "evaluate",
      "evaluate_evidence",
      [id],
      BigInt(0),
      async () => (await readEvidence(id))?.status !== "PENDING",
      "GenLayer verdict and payout band verified on-chain.",
    );
  }

  async function settleReward() {
    if (!selectedEvidence) return;
    const id = selectedEvidence.evidence_id;
    await runWrite(
      "settle",
      "settle_reward",
      [id],
      BigInt(0),
      async () => (await readEvidence(id))?.status === "PAID",
      "Escrow transferred to the authenticated source contributor.",
    );
  }

  async function closeClaim() {
    if (!selectedClaim) return;
    const id = selectedClaim.claim_id;
    await runWrite(
      "refund",
      "close_and_refund",
      [id],
      BigInt(0),
      async () => (await readClaim(id))?.status === "CLOSED",
      "Unreserved escrow returned to the authenticated claim creator.",
    );
  }

  function useAddress() {
    if (!addressPattern.test(addressDraft)) {
      setNotice({ tone: "error", text: "Contract address must be a 40-byte 0x address." });
      return;
    }
    window.localStorage.setItem(addressKey, addressDraft);
    setAddress(addressDraft);
    setNotice({ tone: "info", text: "Contract override selected. Verifying live state..." });
  }

  function restoreAddress() {
    window.localStorage.removeItem(addressKey);
    setAddress(fallbackAddress);
    setAddressDraft(fallbackAddress);
    setNotice({ tone: "info", text: fallbackAddress ? "Production contract restored." : "No production V2 contract is configured yet." });
  }

  function selectClaim(id: number) {
    setSelectedClaimId(id);
    setMode("claim");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const normalizedWallet = wallet.toLowerCase();
  const isCreator = Boolean(selectedClaim && normalizedWallet && selectedClaim.creator.toLowerCase() === normalizedWallet);
  const canSubmit = Boolean(selectedClaim && selectedClaim.status === "OPEN" && selectedClaim.evidence_id < 0 && wallet && !isCreator);
  const canEvaluate = selectedEvidence?.status === "PENDING";
  const canSettle = selectedEvidence?.status === "APPROVED";
  const canRefund = Boolean(isCreator && selectedClaim && ["OPEN", "REVIEWED"].includes(selectedClaim.status) && !canSettle && !canEvaluate);

  return (
    <main>
      <header className="nav-shell">
        <button className="brand" onClick={() => setMode("directory")}><Newspaper size={22} /> SourceCred News</button>
        <nav aria-label="Primary navigation">
          <button onClick={() => setMode("directory")}>Claims</button>
          <button onClick={() => setMode("create")}>Open claim</button>
          <a href="#how">How it works</a>
          <button onClick={() => setMode("contract")}>Contract</button>
        </nav>
        <button className="wallet-button" onClick={connect} disabled={busy === "wallet"}>
          {busy === "wallet" ? <Loader2 className="spin" size={16} /> : <Wallet size={16} />}
          {wallet ? short(wallet) : "Connect wallet"}
        </button>
      </header>

      <div className="network-strip">
        <span><i /> {configuredNetwork}</span>
        {addressPattern.test(address) ? (
          <a
            className="contract-explorer"
            href={`https://explorer-studio.genlayer.com/address/${address}`}
            target="_blank"
            rel="noreferrer"
            title="Open contract transactions in GenLayer Studio Explorer"
          >
            Contract {short(address)} <ExternalLink size={13} />
          </a>
        ) : <span>V2 contract not configured</span>}
        <button onClick={() => sync(false)} disabled={busy === "sync"}><RefreshCw className={busy === "sync" ? "spin" : ""} size={14} /> Sync</button>
      </div>

      {notice && <div className={`notice ${notice.tone}`}><span>{notice.text}</span>{notice.hash && <code>{notice.hash}</code>}<button aria-label="Dismiss notice" onClick={() => setNotice(null)}>x</button></div>}

      {mode === "directory" && <>
        <section className="hero">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
            <p className="eyebrow">Fund sources, not opinions</p>
            <h1>Public claims deserve<br /><em>public proof.</em></h1>
            <p className="hero-copy">Lock a GEN reward behind one precise claim. Independent contributors bring two sources; GenLayer reads both and decides whether the evidence deserves payment.</p>
            <div className="hero-actions"><button className="primary" onClick={() => setMode("create")}>Open a funded claim <ArrowRight size={17} /></button><a href="#directory">Browse live claims</a></div>
          </motion.div>
          <div className="hero-seal"><ShieldCheck size={40} /><strong>ON-CHAIN</strong><span>source jury</span></div>
        </section>

        <Reveal><section className="metrics" aria-label="Live SourceCred metrics">
          <Metric label="Funded claims" value={String(platform.claim_count)} />
          <Metric label="Source packets" value={String(platform.evidence_count)} />
          <Metric label="Escrow held" value={fromWei(platform.contract_balance)} />
          <Metric label="Paid to sources" value={fromWei(platform.total_paid)} />
        </section></Reveal>

        <Reveal><section id="directory" className="directory-section">
          <div className="section-heading"><div><p className="eyebrow">Live verification board</p><h2>Claims awaiting proof</h2></div><button className="secondary" onClick={() => setMode("create")}>New claim <ArrowRight size={16} /></button></div>
          <div className="claim-list">
            {claims.length === 0 && <div className="empty"><FileSearch size={26} /><strong>No V2 claims found.</strong><span>Deploy the new contract, then fund the first public claim.</span></div>}
            {claims.map((claim) => <button className="claim-row" key={claim.claim_id} onClick={() => selectClaim(claim.claim_id)}><span className="claim-index">#{claim.claim_id}</span><span><strong>{claim.title}</strong><small>{claim.status} · {fromWei(claim.available)} available</small></span><ArrowRight size={17} /></button>)}
          </div>
        </section></Reveal>

        <Reveal><section id="how" className="how-section"><p className="eyebrow">One claim. One packet. One outcome.</p><h2>How SourceCred works</h2><div className="how-grid"><How number="01" title="Fund" text="The claim creator locks real GEN and publishes one precise statement." /><How number="02" title="Source" text="A different wallet submits two independent HTTPS sources and relevance notes." /><How number="03" title="Judge" text="GenLayer validators read both pages and agree on verdict plus payout band." /><How number="04" title="Settle" text="The contract transfers escrow to the contributor or refunds the creator." /></div></section></Reveal>
      </>}

      {mode === "create" && <Workspace title="Fund a verification" subtitle="The connected wallet becomes the claim creator and the attached GEN becomes contract-held escrow." onBack={() => setMode("directory")}>
        <div className="form-grid"><Field label="Claim title" value={claimForm.title} onChange={(title) => setClaimForm({ ...claimForm, title })} placeholder="What should the public be able to verify?" /><Field label="Public claim" value={claimForm.claimText} onChange={(claimText) => setClaimForm({ ...claimForm, claimText })} placeholder="Write one factual, falsifiable statement." area /><Field label="Context" value={claimForm.context} onChange={(context) => setClaimForm({ ...claimForm, context })} placeholder="Time period, location, and why this matters." area /><div className="form-pair"><Field label="Escrow (GEN)" value={claimForm.escrow} onChange={(escrow) => setClaimForm({ ...claimForm, escrow })} /><Field label="Full payout score" value={claimForm.minScore} onChange={(minScore) => setClaimForm({ ...claimForm, minScore })} /></div></div>
        <button className="primary" onClick={createClaim} disabled={busy === "create"}>{busy === "create" ? <Loader2 className="spin" /> : <BookOpenCheck size={17} />} Fund public claim <ArrowRight size={17} /></button>
      </Workspace>}

      {mode === "claim" && selectedClaim && <Workspace title={selectedClaim.title} subtitle={`Claim #${selectedClaim.claim_id} · ${selectedClaim.status} · ${fromWei(selectedClaim.available)} available`} onBack={() => setMode("directory")}>
        <div className="claim-copy"><p>{selectedClaim.claim_text}</p>{selectedClaim.context && <small>{selectedClaim.context}</small>}</div>
        {selectedEvidence && <div className="verdict"><div><span>Verdict</span><strong>{selectedEvidence.verdict}</strong></div><div><span>Quality</span><strong>{selectedEvidence.quality_score}/100</strong></div><div><span>Payout</span><strong>{fromWei(selectedEvidence.payout)}</strong></div><p>{selectedEvidence.reason}</p><div className="sources"><a href={selectedEvidence.primary_url} target="_blank" rel="noreferrer">Primary source <ExternalLink size={13} /></a><a href={selectedEvidence.secondary_url} target="_blank" rel="noreferrer">Secondary source <ExternalLink size={13} /></a></div></div>}

        {canSubmit && <div className="focus-action"><p className="eyebrow">Your next action</p><h3>Submit two independent sources</h3><Field label="Primary source URL" value={evidenceForm.primaryUrl} onChange={(primaryUrl) => setEvidenceForm({ ...evidenceForm, primaryUrl })} placeholder="https://official-source.example/report" /><Field label="Secondary source URL" value={evidenceForm.secondaryUrl} onChange={(secondaryUrl) => setEvidenceForm({ ...evidenceForm, secondaryUrl })} placeholder="https://independent-publisher.example/investigation" /><Field label="Relevance notes" value={evidenceForm.notes} onChange={(notes) => setEvidenceForm({ ...evidenceForm, notes })} placeholder="Explain what each source proves and where they agree or conflict." area /><button className="primary" onClick={submitEvidence} disabled={busy === "submit"}>{busy === "submit" ? <Loader2 className="spin" /> : <FileSearch size={17} />} Submit source packet <ArrowRight size={17} /></button></div>}
        {!wallet && <div className="focus-action compact"><p>Connect a wallet to see the action available to this identity.</p><button className="primary" onClick={connect}><Wallet size={17} /> Connect wallet</button></div>}
        {wallet && isCreator && selectedClaim.evidence_id < 0 && <div className="focus-action compact"><p>Your claim is open for an independent contributor. You may close it and recover escrow before evidence is submitted.</p>{canRefund && <button className="secondary" onClick={closeClaim} disabled={busy === "refund"}><RotateCcw size={16} /> Close and refund</button>}</div>}
        {canEvaluate && <div className="focus-action compact"><p>The source packet is immutable. Ask GenLayer validators to read both pages and decide the substantive verdict.</p><button className="primary" onClick={evaluateEvidence} disabled={busy === "evaluate"}>{busy === "evaluate" ? <Loader2 className="spin" /> : <Scale size={17} />} Run source jury <ArrowRight size={17} /></button></div>}
        {canSettle && <div className="focus-action compact"><p>The jury approved this packet. Settlement transfers reserved GEN to the recorded contributor.</p><button className="primary" onClick={settleReward} disabled={busy === "settle"}>{busy === "settle" ? <Loader2 className="spin" /> : <CircleDollarSign size={17} />} Pay source contributor <ArrowRight size={17} /></button></div>}
        {canRefund && selectedClaim.evidence_id >= 0 && <div className="focus-action compact"><p>No payout is reserved. The authenticated creator can close the claim and recover remaining escrow.</p><button className="secondary" onClick={closeClaim} disabled={busy === "refund"}><RotateCcw size={16} /> Close and refund</button></div>}
        {selectedEvidence?.status === "PAID" && <div className="done"><BadgeCheck size={22} /> Source contributor paid from contract escrow.</div>}
      </Workspace>}

      {mode === "contract" && <Workspace title="Contract connection" subtitle="Reviewers can select a deployment at runtime and prove its live state without changing the build." onBack={() => setMode("directory")}>
        <Field label="Studionet contract address" value={addressDraft} onChange={setAddressDraft} placeholder="0x..." />
        <div className="button-row"><button className="primary" onClick={useAddress}><RefreshCw size={16} /> Use and verify</button><button className="secondary" onClick={restoreAddress}><RotateCcw size={16} /> Restore production default</button></div>
        <div className="contract-state"><strong>Active address</strong><code>{address || "Not configured"}</code><span>{platform.claim_count} claims · {platform.evidence_count} source packets · {fromWei(platform.contract_balance)} held</span></div>
      </Workspace>}
    </main>
  );
}

function Reveal({ children }: { children: React.ReactNode }) {
  return <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.5 }}>{children}</motion.div>;
}

function Workspace({ title, subtitle, onBack, children }: { title: string; subtitle: string; onBack: () => void; children: React.ReactNode }) {
  return <section className="workspace"><button className="back" onClick={onBack}><ArrowLeft size={15} /> Back</button><div className="workspace-head"><p className="eyebrow">Live contract workspace</p><h1>{title}</h1><p>{subtitle}</p></div><div className="workspace-card">{children}</div></section>;
}

function Field({ label, value, onChange, placeholder = "", area = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; area?: boolean }) {
  return <label className="field-wrap"><span>{label}</span>{area ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />}</label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function How({ number, title, text }: { number: string; title: string; text: string }) {
  return <article><span>{number}</span><h3>{title}</h3><p>{text}</p></article>;
}
