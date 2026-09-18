import { useEffect, useMemo, useState } from "react";
import "./styles.css";

const project = {
  sourceNo: 5,
  id: "hxyfront-62003",
  port: 62003,
  title: "法医昆虫学样本记录",
  domain: "法医昆虫学",
  prompt:
    "做一个法医昆虫学样本记录前端工具，用来记录采样地点、环境温度、尸体暴露阶段、昆虫种类、发育阶段、采样时间、保存方式和鉴定备注。页面需要有样本批次列表、发育阶段筛选、温度记录图、案件样本关联页和单个样本详情卡片。",
};

const HOUR = 36e5;
const ETHANOL_LIMIT_HOURS = 72;
const UNREFRIGERATED_LIMIT_HOURS = 24;
const STORAGE_KEY = "hxyfront-62003:samples";

const stages = ["卵", "幼虫", "蛹", "成虫"] as const;
type Stage = (typeof stages)[number];
type Conclusion = "未鉴定" | "通过" | "不通过";

interface Sample {
  id: string;
  location: string;
  temperature: number | null;
  exposureStage: string;
  species: string;
  stage: Stage;
  collectedAt: string | null; // ISO 时间；旧记录可能缺失
  preservation: string;
  refrigerated: boolean;
  note: string;
  submittedAt: string | null; // 送检登记时间
  conclusion: Conclusion;
}

type SubmissionState = "ok" | "overdue" | "missing" | "submitted";

const stateMeta: Record<SubmissionState, { label: string; tone: string }> = {
  ok: { label: "时限内", tone: "ok" },
  overdue: { label: "待送检 · 结论锁定", tone: "warn" },
  missing: { label: "不可送检 · 缺采集时间", tone: "bad" },
  submitted: { label: "已送检 · 待人工鉴定", tone: "done" },
};

function submissionState(sample: Sample, now: number): SubmissionState {
  if (sample.submittedAt) return "submitted";
  if (!sample.collectedAt) return "missing";
  const hours = (now - new Date(sample.collectedAt).getTime()) / HOUR;
  const ethanol = sample.preservation.includes("乙醇");
  const limit = ethanol
    ? ETHANOL_LIMIT_HOURS
    : sample.refrigerated
      ? Infinity
      : UNREFRIGERATED_LIMIT_HOURS;
  return hours > limit ? "overdue" : "ok";
}

function isBlocked(state: SubmissionState) {
  return state === "overdue" || state === "missing";
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * HOUR).toISOString();
}

const seedSamples: Sample[] = [
  {
    id: "CASE-042-A",
    location: "室外草地",
    temperature: 28.6,
    exposureStage: "肿胀期",
    species: "丝光绿蝇",
    stage: "幼虫",
    collectedAt: hoursAgo(80),
    preservation: "乙醇保存",
    refrigerated: false,
    note: "幼虫三龄，28.6℃",
    submittedAt: null,
    conclusion: "未鉴定",
  },
  {
    id: "CASE-042-B",
    location: "阴影区域",
    temperature: 24.1,
    exposureStage: "腐败期",
    species: "大头金蝇",
    stage: "蛹",
    collectedAt: hoursAgo(30),
    preservation: "低温冷藏",
    refrigerated: true,
    note: "蛹期样本，需复核种属",
    submittedAt: null,
    conclusion: "未鉴定",
  },
  {
    id: "CASE-051-A",
    location: "水沟边缘",
    temperature: 26.9,
    exposureStage: "干化期",
    species: "麻蝇属",
    stage: "成虫",
    collectedAt: hoursAgo(30),
    preservation: "干燥保存",
    refrigerated: false,
    note: "成虫采集，已完成拍照",
    submittedAt: null,
    conclusion: "未鉴定",
  },
  {
    id: "CASE-038-C",
    location: "废弃仓库",
    temperature: null,
    exposureStage: "未知",
    species: "待鉴定",
    stage: "卵",
    collectedAt: null,
    preservation: "乙醇保存",
    refrigerated: false,
    note: "历史档案补录，缺采集时间",
    submittedAt: null,
    conclusion: "未鉴定",
  },
];

function loadSamples(): Sample[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // 存储不可用时回退到内置样例
  }
  return seedSamples;
}

function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ruleText(sample: Sample) {
  if (!sample.collectedAt) return "缺采集时间：按不可送检处理";
  if (sample.preservation.includes("乙醇"))
    return `乙醇保存：采集后 ${ETHANOL_LIMIT_HOURS} 小时内送检`;
  if (sample.refrigerated) return "已冷藏保存：不限送检时限";
  return `非乙醇且未冷藏：采集后 ${UNREFRIGERATED_LIMIT_HOURS} 小时内送检`;
}

const preservationOptions = ["乙醇保存", "低温冷藏", "干燥保存", "其他方式"];

const emptyForm = {
  location: "",
  temperature: "",
  exposureStage: "",
  species: "",
  stage: "幼虫" as Stage,
  preservation: "乙醇保存",
  collectedAt: toLocalInputValue(new Date()),
  refrigerated: false,
  note: "",
};

function App() {
  const [samples, setSamples] = useState<Sample[]>(loadSamples);
  const [stageFilter, setStageFilter] = useState<Stage | "全部">("全部");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
    } catch {
      // 存储写入失败时保持内存态
    }
  }, [samples]);

  const filtered = useMemo(
    () =>
      stageFilter === "全部"
        ? samples
        : samples.filter((s) => s.stage === stageFilter),
    [samples, stageFilter],
  );

  const selected = samples.find((s) => s.id === selectedId) ?? null;
  const selectedState = selected ? submissionState(selected, now) : null;
  const selectedBlocked = selectedState !== null && isBlocked(selectedState);

  const overdueCount = samples.filter(
    (s) => submissionState(s, now) === "overdue",
  ).length;
  const missingCount = samples.filter(
    (s) => submissionState(s, now) === "missing",
  ).length;

  const avgTemperature = useMemo(() => {
    const temps = samples
      .map((s) => s.temperature)
      .filter((t): t is number => t !== null);
    if (temps.length === 0) return "—";
    return `${(temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)}℃`;
  }, [samples]);

  const metrics: Array<[string, string | number]> = [
    ["样本批次", samples.length],
    ["平均温度", avgTemperature],
    ["发育阶段", new Set(samples.map((s) => s.stage)).size],
    ["待鉴定", samples.filter((s) => s.conclusion === "未鉴定").length],
  ];

  function updateSample(id: string, patch: Partial<Sample>) {
    setSamples((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  // 送检登记只解除阻断，不代替人工鉴定结论
  function registerSubmission(id: string) {
    const target = samples.find((s) => s.id === id);
    if (!target || !target.collectedAt || target.submittedAt) return;
    updateSample(id, { submittedAt: new Date().toISOString() });
  }

  function setConclusion(id: string, value: Conclusion) {
    const target = samples.find((s) => s.id === id);
    if (!target) return;
    // 待送检 / 不可送检的记录禁止鉴定结论通过
    if (value === "通过" && isBlocked(submissionState(target, now))) return;
    updateSample(id, { conclusion: value });
  }

  function addSample() {
    if (!form.location.trim() || !form.collectedAt) return;
    const sample: Sample = {
      id: `BATCH-${Date.now().toString(36).toUpperCase()}`,
      location: form.location.trim(),
      temperature: form.temperature === "" ? null : Number(form.temperature),
      exposureStage: form.exposureStage.trim() || "未记录",
      species: form.species.trim() || "待鉴定",
      stage: form.stage,
      collectedAt: new Date(form.collectedAt).toISOString(),
      preservation: form.preservation,
      refrigerated: form.refrigerated,
      note: form.note.trim(),
      submittedAt: null,
      conclusion: "未鉴定",
    };
    setSamples((prev) => [sample, ...prev]);
    setForm({ ...emptyForm, collectedAt: toLocalInputValue(new Date()) });
    setSelectedId(sample.id);
  }

  function exportSummary() {
    const lines = filtered.map((s) => {
      const state = submissionState(s, now);
      return [
        s.id,
        s.stage,
        s.preservation,
        `采集:${formatTime(s.collectedAt)}`,
        `送检:${formatTime(s.submittedAt)}`,
        `状态:${stateMeta[state].label}`,
        `结论:${s.conclusion}`,
      ].join(" | ");
    });
    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "样本送检摘要.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app">
      <section className="hero">
        <p>
          {project.id} · 源提示词{project.sourceNo} · Port {project.port}
        </p>
        <h1>{project.title}</h1>
        <span>{project.prompt}</span>
      </section>

      <section className="metrics">
        {metrics.map(([label, value]) => (
          <article key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>{project.domain}筛选</h2>
          <div className="chips">
            {(["全部", ...stages] as const).map((item) => (
              <button
                key={item}
                className={stageFilter === item ? "active" : ""}
                onClick={() => setStageFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="stat-list">
            <p>
              待送检（超时未送检）<b className="warn-text">{overdueCount}</b>
            </p>
            <p>
              不可送检（缺采集时间）<b className="bad-text">{missingCount}</b>
            </p>
            <p className="hint">
              乙醇保存超过 {ETHANOL_LIMIT_HOURS} 小时未送检，或其他保存方式超过{" "}
              {UNREFRIGERATED_LIMIT_HOURS} 小时未冷藏，记录标为待送检并禁止鉴定结论通过。
            </p>
          </div>
        </aside>

        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>专业字段</p>
              <h2>新增记录</h2>
            </div>
            <button className="primary" onClick={addSample}>
              保存草稿
            </button>
          </div>
          <div className="field-grid">
            <label>
              <span>采样地点</span>
              <input
                placeholder="填写采样地点"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </label>
            <label>
              <span>环境温度（℃）</span>
              <input
                type="number"
                placeholder="填写环境温度"
                value={form.temperature}
                onChange={(e) =>
                  setForm({ ...form, temperature: e.target.value })
                }
              />
            </label>
            <label>
              <span>暴露阶段</span>
              <input
                placeholder="填写暴露阶段"
                value={form.exposureStage}
                onChange={(e) =>
                  setForm({ ...form, exposureStage: e.target.value })
                }
              />
            </label>
            <label>
              <span>昆虫种类</span>
              <input
                placeholder="填写昆虫种类"
                value={form.species}
                onChange={(e) => setForm({ ...form, species: e.target.value })}
              />
            </label>
            <label>
              <span>发育阶段</span>
              <select
                value={form.stage}
                onChange={(e) =>
                  setForm({ ...form, stage: e.target.value as Stage })
                }
              >
                {stages.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              <span>保存方式</span>
              <select
                value={form.preservation}
                onChange={(e) =>
                  setForm({ ...form, preservation: e.target.value })
                }
              >
                {preservationOptions.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              <span>采样时间</span>
              <input
                type="datetime-local"
                value={form.collectedAt}
                onChange={(e) =>
                  setForm({ ...form, collectedAt: e.target.value })
                }
              />
            </label>
            <label>
              <span>鉴定备注</span>
              <input
                placeholder="填写鉴定备注"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.refrigerated}
                onChange={(e) =>
                  setForm({ ...form, refrigerated: e.target.checked })
                }
              />
              <span>已冷藏保存</span>
            </label>
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>历史记录</p>
            <h2>
              样本批次列表{" "}
              {overdueCount + missingCount > 0 && (
                <span className="badge warn">
                  待送检 {overdueCount} · 不可送检 {missingCount}
                </span>
              )}
            </h2>
          </div>
          <button onClick={exportSummary}>导出摘要</button>
        </div>
        <div className="records">
          {filtered.length === 0 && <p className="hint">当前筛选下暂无记录。</p>}
          {filtered.map((sample, index) => {
            const state = submissionState(sample, now);
            const meta = stateMeta[state];
            return (
              <button
                key={sample.id}
                className={`record${selectedId === sample.id ? " selected" : ""}`}
                onClick={() => setSelectedId(sample.id)}
              >
                <b>{String(index + 1).padStart(2, "0")}</b>
                <div>
                  <h3>
                    {sample.id} <span className={`badge ${meta.tone}`}>{meta.label}</span>
                  </h3>
                  <p>
                    {sample.location} · {sample.species} · {sample.stage} ·{" "}
                    {sample.preservation}
                    {sample.refrigerated ? "（已冷藏）" : ""} · 结论：
                    {sample.conclusion}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>单个样本</p>
            <h2>详情卡片</h2>
          </div>
          {selected && selectedState && (
            <span className={`badge ${stateMeta[selectedState].tone}`}>
              {stateMeta[selectedState].label}
            </span>
          )}
        </div>
        {!selected && <p className="hint">在样本批次列表中选择一条记录查看详情。</p>}
        {selected && selectedState && (
          <>
            <div className="detail-grid">
              <div>
                <small>批次编号</small>
                <p>{selected.id}</p>
              </div>
              <div>
                <small>采样地点</small>
                <p>{selected.location}</p>
              </div>
              <div>
                <small>环境温度</small>
                <p>{selected.temperature === null ? "—" : `${selected.temperature}℃`}</p>
              </div>
              <div>
                <small>暴露阶段</small>
                <p>{selected.exposureStage}</p>
              </div>
              <div>
                <small>昆虫种类</small>
                <p>{selected.species}</p>
              </div>
              <div>
                <small>发育阶段</small>
                <p>{selected.stage}</p>
              </div>
              <div>
                <small>保存方式</small>
                <p>
                  {selected.preservation}
                  {selected.refrigerated ? "（已冷藏）" : "（未冷藏）"}
                </p>
              </div>
              <div>
                <small>采集时间</small>
                <p>{formatTime(selected.collectedAt)}</p>
              </div>
              <div>
                <small>已保存时长</small>
                <p>
                  {selected.collectedAt
                    ? `${Math.floor((now - new Date(selected.collectedAt).getTime()) / HOUR)} 小时`
                    : "—"}
                </p>
              </div>
              <div>
                <small>送检时限规则</small>
                <p>{ruleText(selected)}</p>
              </div>
              <div>
                <small>送检登记时间</small>
                <p>{formatTime(selected.submittedAt)}</p>
              </div>
              <div>
                <small>鉴定备注</small>
                <p>{selected.note || "—"}</p>
              </div>
            </div>

            {selectedBlocked && (
              <p className="hint block-hint">
                {selectedState === "missing"
                  ? "该记录缺采集时间，按不可送检处理，鉴定结论不得通过。"
                  : "该记录已超送检时限，标为待送检；完成送检登记前，鉴定结论不得通过。"}
              </p>
            )}

            <div className="actions">
              <button
                className="primary"
                disabled={!selected.collectedAt || !!selected.submittedAt}
                title={
                  !selected.collectedAt
                    ? "缺采集时间，按不可送检处理"
                    : selected.submittedAt
                      ? "已完成送检登记"
                      : "登记送检，仅解除结论阻断"
                }
                onClick={() => registerSubmission(selected.id)}
              >
                送检登记
              </button>
              <button
                disabled={selectedBlocked}
                title={
                  selectedBlocked
                    ? "记录处于待送检/不可送检状态，禁止结论通过"
                    : "人工鉴定结论：通过"
                }
                onClick={() => setConclusion(selected.id, "通过")}
              >
                结论通过
              </button>
              <button onClick={() => setConclusion(selected.id, "不通过")}>
                结论不通过
              </button>
              <button onClick={() => setConclusion(selected.id, "未鉴定")}>
                重置结论
              </button>
              <span className="hint">
                当前鉴定结论：{selected.conclusion} ·
                送检登记只解除阻断，不代替人工鉴定。
              </span>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default App;
