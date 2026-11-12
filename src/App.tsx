// MatchRoot frontend — the garden.
// Round dashboard -> project beds -> donor binding -> distribution
// results -> how it works -> FAQ -> my transactions.
// Gate 11: every value on this page comes from a latest-final readback.
// Before the first FINALIZED readback, values are dashes and the page
// says UNCONFIRMED; export is disabled. On-chain values (status,
// phase, amounts) are always shown in English; the translated text
// next to them is only a gloss.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadDeployment, readAll, readMyCredit, readMyDonor,
  savePendingTx, clearPendingTx, saveMyTx, loadMyTxs,
  TxUnknownError, waitFinalized, txGood, leaderPayload,
  connectInjected, temporaryAccount, restoreTemporaryAccount,
  destroyTemporaryAccount, tempPrivateKey, isTempKeyAcked, ackTempKey,
  sendWrite, walletKind, shortAddr, sleep, fmtReadbackTime,
  reader, contractAddress, explorerTx, explorerAddress, GEN_WEI,
  type RoundRec, type ProjectRec, type DonorRec, type Counts, type Wallet,
} from './chain';
import { t, STRINGS, DEFAULT_LANG, LANG_KEY, type Lang, type StrKey } from './i18n';

const WEI = 10n ** 18n;
function isqrtBig(n: bigint): bigint {
  if (n <= 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x;
}
// Exact GEN formatting from wei (BigInt — JS numbers lose precision
// above 2^53, and wei values here reach 1e20).
function genBig(wei: number | bigint): string {
  const w = BigInt(wei);
  const whole = w / WEI;
  const frac = w % WEI;
  if (frac === 0n) return whole.toString();
  let f = frac.toString().padStart(18, '0').replace(/0+$/, '').slice(0, 4);
  return whole.toString() + '.' + f;
}
function genNum(wei: number | bigint): number {
  return Number(BigInt(wei)) / 1e18;
}

interface Estimate { direct: bigint; raw: bigint; scaled: bigint; donors: number }
function computeEstimates(
  projects: ProjectRec[],
  contribs: Map<string, bigint>,
  poolWei: bigint,
): Map<number, Estimate> {
  const raws = new Map<number, bigint>();
  let totalRaw = 0n;
  for (const p of projects) {
    if (p.status !== 'ELIGIBLE') { raws.set(p.project_id, 0n); continue; }
    let s = 0n;
    let direct = 0n;
    let n = 0;
    for (const [key, total] of contribs) {
      const [pid] = key.split('|');
      if (Number(pid) !== p.project_id) continue;
      s += isqrtBig(total);
      direct += total;
      n++;
    }
    let m = s * s - direct;
    if (m < 0n) m = 0n;
    raws.set(p.project_id, m);
    totalRaw += m;
  }
  const out = new Map<number, Estimate>();
  for (const p of projects) {
    const raw = raws.get(p.project_id) || 0n;
    const scaled = totalRaw > poolWei && totalRaw > 0n ? (raw * poolWei) / totalRaw : raw;
    let donors = 0;
    for (const key of contribs.keys()) if (Number(key.split('|')[0]) === p.project_id) donors++;
    out.set(p.project_id, { direct: BigInt(p.direct_wei), raw, scaled, donors });
  }
  return out;
}

type TxState = { hash: string; label: string; status: 'pending' | 'finalized' | 'unknown' | 'failed'; detail: string; receipt?: any } | null;

export default function App() {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const v = localStorage.getItem(LANG_KEY);
      return v === 'zh' ? 'zh' : DEFAULT_LANG;
    } catch { return DEFAULT_LANG; }
  });
  const tr = useCallback((k: StrKey, vars?: Record<string, string | number>) => t(lang, k, vars), [lang]);
  const setLangPersist = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  };
  const staticMode = useMemo(() => {
    try { return new URLSearchParams(window.location.search).has('static'); } catch { return false; }
  }, []);

  const [deployment, setDeployment] = useState<any>(null);
  const [round, setRound] = useState<RoundRec | null>(null);
  const [projects, setProjects] = useState<ProjectRec[]>([]);
  const [donors, setDonors] = useState<DonorRec[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [finalized, setFinalized] = useState(false);
  const [readbackAt, setReadbackAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [estimates, setEstimates] = useState<Map<number, Estimate>>(new Map());
  const [contribs, setContribs] = useState<Map<string, bigint>>(new Map());
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [myCredit, setMyCredit] = useState<bigint>(0n);
  const [myDonor, setMyDonor] = useState<DonorRec | null>(null);
  const [myTotals, setMyTotals] = useState<Map<number, bigint>>(new Map());
  const [tx, setTx] = useState<TxState>(null);
  const [myTxs, setMyTxs] = useState(loadMyTxs());
  const [notice, setNotice] = useState('');
  const [showWallet, setShowWallet] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [backupKey, setBackupKey] = useState('');
  const [backupCopied, setBackupCopied] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<(() => void) | null>(null);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [restoreKey, setRestoreKey] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [confirm, setConfirm] = useState<{ title: string; desc: string; action: () => void } | null>(null);
  const [donatePid, setDonatePid] = useState<number | null>(null);
  const [donateAmount, setDonateAmount] = useState('');
  const [showApply, setShowApply] = useState(false);
  const [applyForm, setApplyForm] = useState({ name: '', repo: '', homepage: '', purpose: '', claim: '', payout: '' });
  const [applyError, setApplyError] = useState('');
  const [bindForm, setBindForm] = useState({ login: '', gist: '' });
  const [bindError, setBindError] = useState('');
  const [bindBusy, setBindBusy] = useState(false);
  const [rejudgePid, setRejudgePid] = useState<number | null>(null);
  const [rejudgeClaim, setRejudgeClaim] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      if (!deployment) setDeployment(await loadDeployment());
      const d = await readAll();
      setRound(d.round);
      setProjects(d.projects);
      setDonors(d.donors);
      setCounts(d.counts);
      setFinalized(d.is_finalized_readback);
      setReadbackAt(d.at);
      // Live match estimates: per-donor totals drive the square-root rule.
      const c = new Map<string, bigint>();
      for (const p of d.projects) {
        try {
          const raw = await reader.readContract({ address: contractAddress() as `0x${string}`, functionName: 'get_project_donors', args: [p.project_id], transactionHashVariant: 'latest-final' as any });
          const addrs: string[] = JSON.parse(raw as unknown as string);
          for (const a of addrs) {
            const rawC = await reader.readContract({ address: contractAddress() as `0x${string}`, functionName: 'get_contribution', args: [p.project_id, a], transactionHashVariant: 'latest-final' as any });
            const rec = JSON.parse(rawC as unknown as string);
            c.set(p.project_id + '|' + a.toLowerCase(), BigInt(rec.total_wei));
          }
        } catch { /* estimate is best-effort; on-chain values are authoritative */ }
      }
      setContribs(c);
      setEstimates(computeEstimates(d.projects, c, BigInt(d.counts?.pool_wei ?? 100000000000000000000)));
    } catch (e: any) {
      setLoadError(e?.message || 'load failed');
    } finally {
      setLoading(false);
    }
  }, [deployment]);

  useEffect(() => { load(); }, [load]);

  const refreshMy = useCallback(async (w: Wallet | null) => {
    if (!w) { setMyCredit(0n); setMyDonor(null); setMyTotals(new Map()); return; }
    try { setMyCredit(BigInt(await readMyCredit(w.address))); } catch { /* ignore */ }
    try { setMyDonor(await readMyDonor(w.address)); } catch { /* ignore */ }
    try {
      const m = new Map<number, bigint>();
      for (const p of projects) {
        const raw = await reader.readContract({ address: contractAddress() as `0x${string}`, functionName: 'get_contribution', args: [p.project_id, w.address], transactionHashVariant: 'latest-final' as any });
        const rec = JSON.parse(raw as unknown as string);
        if (rec.total_wei > 0) m.set(p.project_id, BigInt(rec.total_wei));
      }
      setMyTotals(m);
    } catch { /* ignore */ }
  }, [projects]);

  useEffect(() => { refreshMy(wallet); }, [wallet, refreshMy]);

  // ---- tx flow: hash saved immediately, timeout is "unknown" ----
  async function doWrite(label: string, fnName: string, args: any[], value: bigint = 0n) {
    if (!wallet) { setShowWallet(true); return; }
    const run = async () => {
      setBusy(fnName);
      setTx({ hash: '', label, status: 'pending', detail: tr('tx.pending') });
      try {
        const { hash, receipt } = await sendWrite(wallet, fnName, args, value);
        savePendingTx(hash, label);
        const good = txGood(receipt);
        setTx({ hash, label, status: 'finalized', detail: good ? tr('tx.success') : tr('tx.failed'), receipt });
        saveMyTx(hash, label, good ? 'ok' : 'failed');
        setMyTxs(loadMyTxs());
        clearPendingTx(hash);
        await load();
        await refreshMy(wallet);
      } catch (e: any) {
        if (e instanceof TxUnknownError) {
          savePendingTx(e.hash, label);
          setTx({ hash: e.hash, label, status: 'unknown', detail: tr('tx.unknown') });
        } else {
          setTx({ hash: '', label, status: 'failed', detail: (e?.message || tr('error.unknown')) });
        }
      } finally {
        setBusy('');
      }
    };
    // Payable writes with a temporary account need the key-backup
    // acknowledgement first: without the key, escrowed funds are lost.
    if (value > 0n && wallet.mode === 'temporary' && !isTempKeyAcked()) {
      setBackupKey(tempPrivateKey() || '');
      setPendingBackup(() => run);
      setShowBackup(true);
      return;
    }
    await run();
  }

  async function recheckTx() {
    if (!tx?.hash) return;
    setTx({ ...tx, status: 'pending', detail: tr('tx.pending') });
    try {
      const receipt = await waitFinalized(tx.hash);
      const good = txGood(receipt);
      setTx({ ...tx, status: 'finalized', detail: good ? tr('tx.success') : tr('tx.failed'), receipt });
      if (good) { saveMyTx(tx.hash, tx.label); setMyTxs(loadMyTxs()); }
      clearPendingTx(tx.hash);
      await load();
      if (wallet) await refreshMy(wallet);
    } catch (e: any) {
      if (e instanceof TxUnknownError) setTx({ ...tx, status: 'unknown', detail: tr('tx.unknown') });
      else setTx({ ...tx, status: 'failed', detail: e?.message || tr('error.unknown') });
    }
  }

  const phase = round?.phase || '';
  const isCreator = !!(wallet && round && wallet.address === round.creator.toLowerCase());
  const poolWei = BigInt(counts?.pool_wei ?? 100000000000000000000);
  const totalMatch = BigInt(counts?.total_match_wei ?? 0);
  const totalDirect = BigInt(counts?.total_direct_wei ?? 0);
  const poolUsedPct = poolWei > 0n ? Number((totalMatch * 100n) / poolWei) : 0;

  function exportEvidence() {
    if (!finalized) return;
    const blob = new Blob([JSON.stringify({
      project: 'MatchRoot', protocol: 'matchroot-1.1', network: 'GenLayer Studionet', chain_id: 61999,
      contract: contractAddress(), exported_at: new Date().toISOString(), readback_at: readbackAt,
      readback: 'latest-final', round, projects, donors, counts,
      estimates: [...estimates.entries()].map(([pid, e]) => ({ project_id: pid, direct_wei: e.direct.toString(), match_estimate_wei: e.scaled.toString(), donors: e.donors })),
    }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'matchroot-round-evidence.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---- wallet actions ----
  async function onConnectInjected() {
    try {
      const w = await connectInjected();
      setWallet(w);
      setShowWallet(false);
      setNotice(tr('wallet.connected') + ': ' + shortAddr(w.address));
    } catch (e: any) {
      setNotice(e?.message === 'NO_INJECTED_WALLET' ? tr('wallet.noWallet') : (e?.message || tr('error.unknown')));
    }
  }
  async function onUseTemp() {
    const w = await temporaryAccount();
    setWallet(w);
    setShowWallet(false);
    setBackupKey(tempPrivateKey() || '');
    setShowBackup(true);
  }
  async function onRestore() {
    setRestoreError('');
    try {
      const w = await restoreTemporaryAccount(restoreKey);
      setWallet(w);
      setRestoreKey('');
      setShowWallet(false);
      setNotice(tr('wallet.connected') + ': ' + shortAddr(w.address));
    } catch {
      setRestoreError(tr('wallet.badKey'));
    }
  }
  function onDisconnect() {
    if (wallet?.mode === 'temporary') {
      setBackupKey(tempPrivateKey() || '');
      setShowDisconnect(true);
    } else {
      setWallet(null);
      setShowWallet(false);
    }
  }
  function confirmDisconnect() {
    destroyTemporaryAccount();
    setWallet(null);
    setShowDisconnect(false);
    setShowWallet(false);
  }

  // ---- forms ----
  function submitApply() {
    setApplyError('');
    const f = applyForm;
    if (!f.name.trim()) return setApplyError(tr('apply.invalidName'));
    if (!/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+$/.test(f.repo.trim())) return setApplyError(tr('apply.invalidRepo'));
    if (!/^https?:\/\/.+/.test(f.homepage.trim())) return setApplyError(tr('apply.invalidHomepage'));
    if (!f.purpose.trim()) return setApplyError(tr('apply.invalidPurpose'));
    if (f.claim.trim().length < 10) return setApplyError(tr('apply.invalidClaim'));
    if (!/^0x[0-9a-fA-F]{40}$/.test(f.payout.trim())) return setApplyError(tr('apply.invalidPayout'));
    setConfirm({
      title: tr('modal.confirmApply'),
      desc: tr('modal.confirmApplyDesc'),
      action: async () => {
        setShowApply(false);
        await doWrite('apply_project:' + f.name, 'apply_project', [f.name.trim(), f.repo.trim(), f.homepage.trim(), f.purpose.trim(), f.claim.trim(), f.payout.trim().toLowerCase()]);
      },
    });
  }
  function submitBind() {
    setBindError('');
    if (!wallet) return setShowWallet(true);
    if (!bindForm.login.trim() || bindForm.login.trim().length > 39) return setBindError(tr('error.notFound'));
    if (!bindForm.gist.trim() || bindForm.gist.trim().length > 64) return setBindError(tr('error.gistNotFound'));
    setConfirm({
      title: tr('modal.confirmBind'),
      desc: tr('modal.confirmBindDesc'),
      action: async () => {
        setBindBusy(true);
        try {
          await doWrite('bind_donor:' + bindForm.login.trim(), 'bind_donor', [wallet.address, bindForm.login.trim(), bindForm.gist.trim()]);
        } finally { setBindBusy(false); }
      },
    });
  }
  function submitDonate(pid: number) {
    const p = projects.find((x) => x.project_id === pid);
    if (!p) return;
    const n = Number(donateAmount);
    if (!Number.isInteger(n) || n < 1) return setNotice(tr('donate.invalidAmount'));
    setConfirm({
      title: tr('modal.confirmDonate'),
      desc: tr('modal.confirmDonateDesc', { amount: String(n), name: p.name }),
      action: async () => {
        setDonatePid(null);
        await doWrite('contribute:' + p.name + ':' + n + 'GEN', 'contribute', [pid], BigInt(n) * WEI);
      },
    });
  }

  const phaseSteps = ['APPLICATION', 'FUNDING', 'CLOSED', 'DISTRIBUTED'];
  const phaseIdx = phaseSteps.indexOf(phase);
  const dash = (v: string) => (finalized ? v : '—');
  const faqItems = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ q: tr(('faq.q' + i) as StrKey), a: tr(('faq.a' + i) as StrKey) }));

  return (
    <div className={staticMode ? 'mr static' : 'mr'}>
      <header className="mr-topbar">
        <a className="mr-brand" href="#top">
          <span className="mr-rootmark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="30" height="30"><path d="M16 3v10M16 13c-4 1-7 4-8 9M16 13c4 1 7 4 8 9M16 13v6M16 19c-2 2-3 5-3 8M16 19c2 2 3 5 3 8" stroke="#C9A227" strokeWidth="2.4" strokeLinecap="round" fill="none" /><circle cx="16" cy="6" r="3" fill="#C05B2E" /></svg>
          </span>
          <span className="mr-brand-name">MatchRoot</span>
          <span className="mr-brand-tag">quadratic funding</span>
        </a>
        <nav className="mr-nav">
          <a href="#round">{tr('nav.round')}</a>
          <a href="#projects">{tr('nav.projects')}</a>
          <a href="#donors">{tr('nav.donors')}</a>
          <a href="#how">{tr('nav.how')}</a>
          <a href="#faq">{tr('nav.faq')}</a>
        </nav>
        <div className="mr-top-actions">
          <div className="mr-lang" role="group" aria-label="Language">
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLangPersist('en')}>EN</button>
            <button className={lang === 'zh' ? 'on' : ''} onClick={() => setLangPersist('zh')}>中文</button>
          </div>
          {wallet ? (
            <button className="mr-btn mr-btn-ghost" onClick={() => setShowWallet(true)}>
              {wallet.mode === 'temporary' ? '🌱 ' : '👛 '}{shortAddr(wallet.address)}
            </button>
          ) : (
            <button className="mr-btn mr-btn-primary" onClick={() => setShowWallet(true)}>{tr('wallet.connect')}</button>
          )}
        </div>
      </header>

      <main id="top">
        <section className="mr-hero">
          <div className="mr-hero-copy">
            <p className="mr-eyebrow">{tr('hero.badge')}</p>
            <h1>{tr('hero.title')}</h1>
            <p className="mr-hero-sub">{tr('hero.sub')}</p>
            <div className="mr-hero-cta">
              <button className="mr-btn mr-btn-primary" onClick={() => setShowApply(true)}>{tr('hero.cta.apply')}</button>
              <a className="mr-btn mr-btn-outline" href="#projects">{tr('hero.cta.donate')}</a>
            </div>
            <div className="mr-hero-stats">
              <div><strong>{dash(String(counts?.project_count ?? 0))}</strong><span>{tr('hero.stat.projects')}</span></div>
              <div><strong>{dash(String(counts?.donor_count ?? 0))}</strong><span>{tr('hero.stat.donors')}</span></div>
              <div><strong>{dash(genBig(totalDirect))} GEN</strong><span>{tr('hero.stat.direct')}</span></div>
              <div><strong>{dash(genBig(totalMatch))} GEN</strong><span>{tr('hero.stat.match')}</span></div>
            </div>
            <p className="mr-readback-note">
              {finalized ? <>● {tr('common.readback')} · {fmtReadbackTime(readbackAt)}</> : <>○ {tr('common.unconfirmed')} — {tr('pool.unconfirmed')}</>}
            </p>
          </div>
          <div className="mr-hero-plot" aria-label={tr('pool.label')}>
            <div className="mr-plot-head">
              <span>{tr('pool.label')}</span>
              <strong>{dash(genBig(poolWei))} GEN</strong>
            </div>
            <div className="mr-soil">
              <div className="mr-soil-fill" style={{ width: (finalized ? poolUsedPct : 0) + '%' }} />
              <span className="mr-sprout" aria-hidden="true">🌱</span>
            </div>
            <div className="mr-plot-row">
              <span>{tr('pool.used')}: {dash(genBig(totalMatch))} GEN</span>
              <span>{tr('pool.left')}: {dash(genBig(poolWei - totalMatch))} GEN</span>
            </div>
            <p className="mr-plot-foot">{tr('pool.creator')}</p>
            <ol className="mr-phase-steps">
              {phaseSteps.map((s, i) => (
                <li key={s} className={i < phaseIdx ? 'done' : i === phaseIdx ? 'now' : ''}>
                  <span className="mr-step-dot">{i < phaseIdx ? '✓' : i + 1}</span>
                  <span>{tr(('round.phase.' + s) as StrKey)}</span>
                </li>
              ))}
            </ol>
            <p className="mr-phase-desc">
              {phase === 'APPLICATION' ? tr('phase.application') : phase === 'FUNDING' ? tr('phase.funding') : phase === 'CLOSED' ? tr('phase.closed') : phase === 'DISTRIBUTED' ? tr('phase.distributed') : '—'}
            </p>
          </div>
        </section>

        {loadError && (
          <section className="mr-alert">
            <strong>{tr('common.error')}</strong> {tr('error.loadFailed')}
            <button className="mr-btn mr-btn-outline" onClick={load}>{tr('common.retryLoad')}</button>
          </section>
        )}
        {notice && <section className="mr-notice" role="status">{notice} <button onClick={() => setNotice('')}>×</button></section>}

        <section id="round" className="mr-section">
          <div className="mr-section-head">
            <h2>{tr('nav.round')}</h2>
            <div className="mr-section-actions">
              <button className="mr-btn mr-btn-outline" onClick={load} disabled={loading}>{loading ? tr('common.loading') : tr('common.refresh')}</button>
              <button className="mr-btn mr-btn-outline" onClick={exportEvidence} disabled={!finalized} title={finalized ? '' : tr('common.unconfirmed')}>↓ JSON</button>
            </div>
          </div>
          <div className="mr-ledger">
            <div><span>{tr('pool.total')}</span><strong>{dash(genBig(BigInt(counts?.total_received_wei ?? 0)))} GEN</strong></div>
            <div><span>{tr('pool.direct')}</span><strong>{dash(genBig(totalDirect))} GEN</strong></div>
            <div><span>{tr('pool.match')}</span><strong>{dash(genBig(totalMatch))} GEN</strong></div>
            <div><span>{tr('pool.withdrawn')}</span><strong>{dash(genBig(BigInt(counts?.total_withdrawn_wei ?? 0)))} GEN</strong></div>
            <div><span>{tr('pool.balance')}</span><strong>{dash(genBig(BigInt(counts?.contract_balance_wei ?? 0)))} GEN</strong></div>
            <div><span>{tr('common.contract')}</span><strong className="mr-mono">{deployment ? shortAddr(deployment.contract_address) : '—'}</strong></div>
          </div>
          <p className="mr-fine">{tr('pool.readback')} · {tr('common.network')}: {tr('common.chain')} · {tr('common.testnet')}</p>

          <div className="mr-round-actions">
            {isCreator && phase === 'APPLICATION' && (
              <button className="mr-btn mr-btn-primary" disabled={!!busy} onClick={() => setConfirm({ title: tr('modal.confirmOpen'), desc: tr('modal.confirmOpenDesc'), action: () => doWrite('open_funding', 'open_funding', []) })}>{tr('open.submit')}</button>
            )}
            {isCreator && phase === 'FUNDING' && (
              <button className="mr-btn mr-btn-primary" disabled={!!busy} onClick={() => setConfirm({ title: tr('modal.confirmClose'), desc: tr('modal.confirmCloseDesc'), action: () => doWrite('close_round', 'close_round', []) })}>{tr('close.submit')}</button>
            )}
            {phase === 'CLOSED' && (
              <button className="mr-btn mr-btn-primary" disabled={!!busy} onClick={() => setConfirm({ title: tr('modal.confirmDistribute'), desc: tr('modal.confirmDistributeDesc'), action: () => doWrite('distribute', 'distribute', []) })}>{tr('distribute.submit')}</button>
            )}
            {phase === 'DISTRIBUTED' && <span className="mr-badge mr-badge-done">{tr('round.distributed')}</span>}
            {wallet && myCredit > 0n && (
              <button className="mr-btn mr-btn-accent" disabled={!!busy} onClick={() => setConfirm({ title: tr('modal.confirmWithdraw'), desc: tr('modal.confirmWithdrawDesc', { amount: genBig(myCredit) }), action: () => doWrite('withdraw:' + genBig(myCredit) + 'GEN', 'withdraw', []) })}>
                {tr('withdraw.submit', { amount: genBig(myCredit) })}
              </button>
            )}
            {wallet && <span className="mr-mycredit">{tr('wallet.myCredit')}: <strong>{dash(genBig(myCredit))} GEN</strong></span>}
          </div>
          {phase === 'DISTRIBUTED' && (
            <div className="mr-dist-results">
              <h3>{tr('distribute.title')}</h3>
              <table className="mr-table">
                <thead><tr><th>{tr('nav.projects')}</th><th>{tr('proj.direct')}</th><th>{tr('proj.match')}</th><th>{tr('proj.total')}</th></tr></thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.project_id}>
                      <td>{p.name}</td>
                      <td>{genBig(p.direct_wei)} GEN</td>
                      <td>{genBig(p.match_wei)} GEN</td>
                      <td><strong>{genBig(BigInt(p.direct_wei) + BigInt(p.match_wei))} GEN</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section id="projects" className="mr-section">
          <div className="mr-section-head">
            <h2>{tr('nav.projects')}</h2>
            <button className="mr-btn mr-btn-primary" onClick={() => setShowApply(true)} disabled={phase !== 'APPLICATION'} title={phase !== 'APPLICATION' ? tr('apply.notApplication') : ''}>{tr('proj.apply')}</button>
          </div>
          {projects.length === 0 && <p className="mr-empty">{loading ? tr('common.loading') : tr('common.noData')}</p>}
          <div className="mr-beds">
            {projects.map((p) => {
              const est = estimates.get(p.project_id);
              const maxBar = Math.max(1, ...projects.map((x) => genNum(x.direct_wei) + genNum(estimates.get(x.project_id)?.scaled ?? 0n)));
              const directGen = genNum(p.direct_wei);
              const matchGen = phase === 'DISTRIBUTED' ? genNum(p.match_wei) : genNum(est?.scaled ?? 0n);
              const myTotal = myTotals.get(p.project_id);
              const canDonate = phase === 'FUNDING' && p.status === 'ELIGIBLE';
              const isApplicant = !!(wallet && wallet.address === p.applicant.toLowerCase());
              return (
                <article key={p.project_id} className="mr-bed">
                  <div className="mr-bed-top">
                    <span className={'mr-badge ' + (p.status === 'ELIGIBLE' ? 'mr-badge-ok' : p.status === 'INELIGIBLE' ? 'mr-badge-no' : 'mr-badge-pending')}>{p.status}</span>
                    <span className="mr-bed-donors">{est?.donors ?? 0} {tr('proj.donors')}</span>
                  </div>
                  <h3>{p.name}</h3>
                  <p className="mr-bed-purpose">{p.purpose}</p>
                  <div className="mr-bed-links">
                    <a href={p.repo_url} target="_blank" rel="noreferrer">{tr('proj.openRepo')} ↗</a>
                    <a href={p.homepage_url} target="_blank" rel="noreferrer">{tr('proj.openHomepage')} ↗</a>
                  </div>
                  <div className="mr-bars">
                    <div className="mr-bar-row">
                      <span>{tr('proj.directLabel')}</span>
                      <div className="mr-bar"><div className="mr-bar-direct" style={{ width: (finalized ? (directGen / maxBar) * 100 : 0) + '%' }} /></div>
                      <strong>{dash(genBig(p.direct_wei))} GEN</strong>
                    </div>
                    <div className="mr-bar-row">
                      <span>{tr('proj.matchLabel')}{phase !== 'DISTRIBUTED' ? ' *' : ''}</span>
                      <div className="mr-bar"><div className="mr-bar-match" style={{ width: (finalized ? (matchGen / maxBar) * 100 : 0) + '%' }} /></div>
                      <strong>{dash(genBig(phase === 'DISTRIBUTED' ? p.match_wei : (est?.scaled ?? 0n)))} GEN</strong>
                    </div>
                  </div>
                  <p className="mr-bed-total">{tr('proj.totalLabel')}: <strong>{dash(genBig(BigInt(p.direct_wei) + BigInt(phase === 'DISTRIBUTED' ? p.match_wei : (est?.scaled ?? 0n))))} GEN</strong></p>
                  {p.status === 'ELIGIBLE' && <p className="mr-bed-note">{tr('proj.eligibleNote')}</p>}
                  {p.status === 'INELIGIBLE' && <p className="mr-bed-note">{tr('proj.ineligibleNote')}</p>}
                  {myTotal !== undefined && <p className="mr-bed-note">{tr('donate.myTotal')}: <strong>{genBig(myTotal)} GEN</strong></p>}
                  <p className="mr-bed-meta">{tr('proj.payout')}: <span className="mr-mono">{shortAddr(p.payout_address)}</span> · {tr('proj.applicant')}: <span className="mr-mono">{shortAddr(p.applicant)}</span></p>
                  <div className="mr-bed-actions">
                    {canDonate && <button className="mr-btn mr-btn-accent" onClick={() => { setDonatePid(p.project_id); setDonateAmount(''); }}>{tr('proj.donate')}</button>}
                    {p.status === 'APPLIED' && (phase === 'APPLICATION' || phase === 'FUNDING') && (
                      <button className="mr-btn mr-btn-outline" disabled={!!busy} onClick={() => setConfirm({ title: tr('modal.confirmJudge'), desc: tr('modal.confirmJudgeDesc'), action: () => doWrite('judge_eligibility:' + p.name, 'judge_eligibility', [p.project_id]) })}>{tr('proj.judge')}</button>
                    )}
                    {p.status === 'INELIGIBLE' && isApplicant && (phase === 'APPLICATION' || phase === 'FUNDING') && (
                      <button className="mr-btn mr-btn-outline" onClick={() => { setRejudgePid(p.project_id); setRejudgeClaim(p.readme_claim); }}>{tr('proj.rejudge')}</button>
                    )}
                  </div>
                  {donatePid === p.project_id && (
                    <div className="mr-donate-box">
                      <label>{tr('donate.amount')}
                        <input type="number" min="1" step="1" value={donateAmount} onChange={(e) => setDonateAmount(e.target.value)} placeholder="10" />
                      </label>
                      <p className="mr-fine">{tr('donate.amountHint')}</p>
                      {!myDonor && <p className="mr-warn">{tr('donate.notBound')}</p>}
                      {myDonor && !myDonor.established && <p className="mr-warn">{tr('donate.notEstablished')}</p>}
                      <div className="mr-row">
                        <button className="mr-btn mr-btn-accent" disabled={!!busy || !myDonor?.established} onClick={() => submitDonate(p.project_id)}>{tr('donate.submit', { amount: donateAmount || '?' })}</button>
                        <button className="mr-btn mr-btn-ghost" onClick={() => setDonatePid(null)}>{tr('common.cancel')}</button>
                      </div>
                    </div>
                  )}
                  {rejudgePid === p.project_id && (
                    <div className="mr-donate-box">
                      <label>{tr('rejudge.claim')}
                        <input type="text" value={rejudgeClaim} onChange={(e) => setRejudgeClaim(e.target.value)} />
                      </label>
                      <p className="mr-fine">{tr('rejudge.desc')}</p>
                      <div className="mr-row">
                        <button className="mr-btn mr-btn-primary" disabled={!!busy || rejudgeClaim.trim().length < 10} onClick={() => { const c = rejudgeClaim; setRejudgePid(null); setConfirm({ title: tr('modal.confirmRejudge'), desc: tr('modal.confirmRejudgeDesc'), action: () => doWrite('rejudge_eligibility:' + p.name, 'rejudge_eligibility', [p.project_id, c.trim()]) }); }}>{tr('rejudge.submit')}</button>
                        <button className="mr-btn mr-btn-ghost" onClick={() => setRejudgePid(null)}>{tr('common.cancel')}</button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          <p className="mr-fine">* {tr('proj.matchNote')}</p>
        </section>

        <section id="donors" className="mr-section">
          <div className="mr-section-head"><h2>{tr('nav.donors')}</h2></div>
          <div className="mr-donor-grid">
            <div className="mr-card">
              <h3>{tr('donor.bind')}</h3>
              <p>{tr('donor.bindDesc')}</p>
              <label>{tr('donor.login')}
                <input type="text" value={bindForm.login} onChange={(e) => setBindForm({ ...bindForm, login: e.target.value })} placeholder="halihalibt" autoComplete="off" />
              </label>
              <label>{tr('donor.gist')}
                <input type="text" value={bindForm.gist} onChange={(e) => setBindForm({ ...bindForm, gist: e.target.value })} placeholder="32-hex gist id" autoComplete="off" />
              </label>
              <p className="mr-fine">{tr('donor.gistHint')}</p>
              {bindError && <p className="mr-warn">{bindError}</p>}
              {myDonor && <p className="mr-ok">{tr('donor.bound')}: @{myDonor.github_login} · {myDonor.established ? tr('donor.established') : tr('donor.notEstablished')}</p>}
              <button className="mr-btn mr-btn-primary" disabled={bindBusy || !!busy || !wallet || !!myDonor} onClick={submitBind}>{bindBusy ? tr('donor.binding') : tr('donor.bindShort')}</button>
              {!wallet && <p className="mr-fine">{tr('wallet.notConnected')} — {tr('wallet.connect')}</p>}
              <p className="mr-fine">{tr('donor.establishedNote')}</p>
            </div>
            <div className="mr-card">
              <h3>{tr('donor.listTitle')}</h3>
              {donors.length === 0 && <p className="mr-empty">{tr('donor.listEmpty')}</p>}
              <ul className="mr-donor-list">
                {donors.map((d) => (
                  <li key={d.address}>
                    <span className="mr-mono">@{d.github_login}</span>
                    <span className="mr-badge mr-badge-ok">{tr('donor.established')}</span>
                    <span className="mr-fine">{tr('donor.created')}: {d.created_at.slice(0, 10)} · {d.public_repos} {tr('donor.repos')}</span>
                    <span className="mr-mono mr-fine">{shortAddr(d.address)}</span>
                    {wallet && wallet.address === d.address.toLowerCase() && <span className="mr-badge">{tr('donor.you')}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="how" className="mr-section">
          <div className="mr-section-head"><h2>{tr('how.title')}</h2></div>
          <div className="mr-steps">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="mr-step">
                <h3>{tr(('how.step' + i + '.title') as StrKey)}</h3>
                <p>{tr(('how.step' + i + '.desc') as StrKey)}</p>
              </div>
            ))}
          </div>
          <div className="mr-formula">
            <h3>{tr('how.formula.title')}</h3>
            <p className="mr-formula-eq">match = ( Σ √ donor total )² − Σ totals</p>
            <p>{tr('how.formula.desc')}</p>
            <p className="mr-formula-ex">{tr('how.formula.example')}</p>
            <h3>{tr('how.eligibility.title')}</h3>
            <p>{tr('how.eligibility.desc')}</p>
          </div>
        </section>

        <section id="faq" className="mr-section">
          <div className="mr-section-head"><h2>{tr('faq.title')}</h2></div>
          <div className="mr-faq">
            {faqItems.map((f, i) => (
              <div key={i} className="mr-faq-item">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}>{f.q}<span>{openFaq === i ? '−' : '+'}</span></button>
                {openFaq === i && <p>{f.a}</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="mr-section">
          <div className="mr-section-head"><h2>{tr('tx.myTxs')}</h2></div>
          {myTxs.length === 0 ? <p className="mr-empty">{tr('tx.myTxsEmpty')}</p> : (
            <table className="mr-table">
              <thead><tr><th>{tr('tx.label')}</th><th>{tr('tx.hash')}</th><th>{tr('tx.time')}</th><th>{tr('tx.result')}</th></tr></thead>
              <tbody>
                {myTxs.slice().reverse().map((m) => (
                  <tr key={m.hash}>
                    <td>{m.label}</td>
                    <td><a className="mr-mono" href={explorerTx(m.hash)} target="_blank" rel="noreferrer">{shortAddr(m.hash)}</a></td>
                    <td>{fmtReadbackTime(m.savedAt)}</td>
                    <td>{m.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>

      <footer className="mr-footer">
        <div>
          <strong>MatchRoot</strong>
          <p>{tr('footer.about')}</p>
          <p className="mr-fine">{tr('footer.disclaimer')}</p>
        </div>
        <div>
          <strong>{tr('footer.links')}</strong>
          <p><a href={deployment ? explorerAddress(deployment.contract_address) : '#'} target="_blank" rel="noreferrer">{tr('footer.contract')}</a></p>
          <p><a href="https://github.com/chuanqili77/matchroot-genlayer" target="_blank" rel="noreferrer">{tr('footer.github')}</a></p>
          <p><a href="https://github.com/chuanqili77/matchroot-genlayer/blob/main/README.md" target="_blank" rel="noreferrer">{tr('footer.docs')}</a></p>
        </div>
        <div>
          <strong>{tr('common.network')}</strong>
          <p>{tr('common.chain')}</p>
          <p className="mr-fine">{tr('footer.built')}</p>
        </div>
      </footer>

      {showWallet && (
        <div className="mr-modal-backdrop" onClick={() => setShowWallet(false)}>
          <div className="mr-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{tr('wallet.connect')}</h3>
            {wallet ? (
              <>
                <p>{tr('wallet.connected')}: <span className="mr-mono">{wallet.address}</span></p>
                <p className="mr-fine">{wallet.mode === 'temporary' ? tr('wallet.temp') : walletKind()} · {wallet.signer_mode}</p>
                <p>{tr('wallet.myCredit')}: <strong>{genBig(myCredit)} GEN</strong></p>
                {myDonor && <p>{tr('wallet.myDonor')}: @{myDonor.github_login}</p>}
                <div className="mr-row">
                  <button className="mr-btn mr-btn-outline" onClick={onDisconnect}>{tr('wallet.disconnect')}</button>
                  <button className="mr-btn mr-btn-ghost" onClick={() => setShowWallet(false)}>{tr('common.close')}</button>
                </div>
              </>
            ) : (
              <>
                <button className="mr-btn mr-btn-primary" onClick={onConnectInjected}>{tr('wallet.injected')} ({walletKind()})</button>
                <div className="mr-divider" />
                <h4>{tr('wallet.temp')}</h4>
                <p className="mr-fine">{tr('wallet.tempDesc')}</p>
                <button className="mr-btn mr-btn-outline" onClick={onUseTemp}>{tr('wallet.tempUse')}</button>
                <div className="mr-divider" />
                <h4>{tr('wallet.restore')}</h4>
                <p className="mr-fine">{tr('wallet.restoreHint')}</p>
                <input type="password" value={restoreKey} onChange={(e) => setRestoreKey(e.target.value)} placeholder="0x…" autoComplete="off" />
                {restoreError && <p className="mr-warn">{restoreError}</p>}
                <div className="mr-row">
                  <button className="mr-btn mr-btn-primary" onClick={onRestore}>{tr('wallet.restoreSubmit')}</button>
                  <button className="mr-btn mr-btn-ghost" onClick={() => setShowWallet(false)}>{tr('common.close')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showBackup && (
        <div className="mr-modal-backdrop">
          <div className="mr-modal">
            <h3>{tr('wallet.backupTitle')}</h3>
            <p>{tr('wallet.backupDesc')}</p>
            <p className="mr-mono mr-keybox">{backupKey}</p>
            <div className="mr-row">
              <button className="mr-btn mr-btn-outline" onClick={async () => { try { await navigator.clipboard.writeText(backupKey); setBackupCopied(true); } catch { /* ignore */ } }}>{backupCopied ? tr('wallet.backupCopied') : tr('wallet.backupCopy')}</button>
            </div>
            <div className="mr-row">
              <button className="mr-btn mr-btn-primary" onClick={() => { ackTempKey(); setShowBackup(false); if (pendingBackup) { const f = pendingBackup; setPendingBackup(null); f(); } }}>{tr('wallet.backupAck')}</button>
              <button className="mr-btn mr-btn-ghost" onClick={() => { setShowBackup(false); if (pendingBackup) { const f = pendingBackup; setPendingBackup(null); f(); } }}>{tr('wallet.backupSkip')}</button>
            </div>
          </div>
        </div>
      )}

      {showDisconnect && (
        <div className="mr-modal-backdrop">
          <div className="mr-modal">
            <h3>{tr('wallet.disconnectTitle')}</h3>
            <p>{tr('wallet.disconnectDesc')}</p>
            <p className="mr-mono mr-keybox">{backupKey}</p>
            <div className="mr-row">
              <button className="mr-btn mr-btn-outline" onClick={async () => { try { await navigator.clipboard.writeText(backupKey); setBackupCopied(true); } catch { /* ignore */ } }}>{backupCopied ? tr('wallet.backupCopied') : tr('wallet.backupCopy')}</button>
            </div>
            <div className="mr-row">
              <button className="mr-btn mr-btn-primary" onClick={confirmDisconnect}>{tr('wallet.disconnectConfirm')}</button>
              <button className="mr-btn mr-btn-ghost" onClick={() => setShowDisconnect(false)}>{tr('wallet.disconnectCancel')}</button>
            </div>
          </div>
        </div>
      )}

      {showApply && (
        <div className="mr-modal-backdrop" onClick={() => setShowApply(false)}>
          <div className="mr-modal mr-modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>{tr('apply.title')}</h3>
            <label>{tr('apply.name')}<input type="text" value={applyForm.name} onChange={(e) => setApplyForm({ ...applyForm, name: e.target.value })} /></label>
            <label>{tr('apply.repo')}<input type="text" value={applyForm.repo} onChange={(e) => setApplyForm({ ...applyForm, repo: e.target.value })} placeholder="https://github.com/curl/curl" /></label>
            <label>{tr('apply.homepage')}<input type="text" value={applyForm.homepage} onChange={(e) => setApplyForm({ ...applyForm, homepage: e.target.value })} placeholder="https://curl.se/" /></label>
            <label>{tr('apply.purpose')}<input type="text" value={applyForm.purpose} onChange={(e) => setApplyForm({ ...applyForm, purpose: e.target.value })} placeholder={tr('apply.purposeHint')} /></label>
            <label>{tr('apply.readmeClaim')}<input type="text" value={applyForm.readmeClaim} onChange={(e) => setApplyForm({ ...applyForm, claim: e.target.value })} placeholder={tr('apply.readmeClaimHint')} /></label>
            <label>{tr('apply.payout')}<input type="text" value={applyForm.payout} onChange={(e) => setApplyForm({ ...applyForm, payout: e.target.value })} placeholder="0x…" /></label>
            {applyError && <p className="mr-warn">{applyError}</p>}
            {phase !== 'APPLICATION' && <p className="mr-warn">{tr('apply.notApplication')}</p>}
            <div className="mr-row">
              <button className="mr-btn mr-btn-primary" disabled={phase !== 'APPLICATION' || !!busy} onClick={submitApply}>{tr('apply.submit')}</button>
              <button className="mr-btn mr-btn-ghost" onClick={() => setShowApply(false)}>{tr('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="mr-modal-backdrop">
          <div className="mr-modal">
            <h3>{confirm.title}</h3>
            <p>{confirm.desc}</p>
            <div className="mr-row">
              <button className="mr-btn mr-btn-primary" onClick={() => { const a = confirm.action; setConfirm(null); a(); }}>{tr('common.confirm')}</button>
              <button className="mr-btn mr-btn-ghost" onClick={() => setConfirm(null)}>{tr('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {tx && (
        <div className="mr-modal-backdrop">
          <div className="mr-modal">
            <h3>{tx.label}</h3>
            {tx.status === 'pending' && <p>{tr('tx.pending')}</p>}
            {tx.hash && (
              <p>{tr('tx.hash')}: <a className="mr-mono" href={explorerTx(tx.hash)} target="_blank" rel="noreferrer">{shortAddr(tx.hash)}</a> <a href={explorerTx(tx.hash)} target="_blank" rel="noreferrer">{tr('tx.view')} ↗</a></p>
            )}
            <p className={tx.status === 'finalized' ? 'mr-ok' : tx.status === 'failed' ? 'mr-warn' : ''}>{tx.detail}</p>
            {tx.status === 'finalized' && tx.receipt && (
              <p className="mr-fine">status: {String(tx.receipt.status)} · result: {String(tx.receipt.result)} · {leaderPayload(tx.receipt) ? leaderPayload(tx.receipt).slice(0, 200) : ''}</p>
            )}
            <div className="mr-row">
              {tx.status === 'unknown' && <button className="mr-btn mr-btn-primary" onClick={recheckTx}>{tr('tx.retry')}</button>}
              {tx.status !== 'pending' && <button className="mr-btn mr-btn-ghost" onClick={() => setTx(null)}>{tr('tx.close')}</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
