import { useEffect, useMemo, useState } from "react";
import "./styles.css";

const project = {
  "sourceNo": 5,
  "id": "hxyfront-62003",
  "port": 62003,
  "title": "法医昆虫学样本记录",
  "domain": "法医昆虫学",
  "prompt": "做一个法医昆虫学样本记录前端工具，用来记录采样地点、环境温度、尸体暴露阶段、昆虫种类、发育阶段、采样时间、保存方式和鉴定备注。页面需要有样本批次列表、发育阶段筛选、温度记录图、案件样本关联页和单个样本详情卡片。",
  "palette": [
    "#365314",
    "#a16207",
    "#dc2626"
  ],
  "metrics": [
    "样本批次",
    "平均温度",
    "发育阶段",
    "待鉴定"
  ],
  "filters": [
    "卵",
    "幼虫",
    "蛹",
    "成虫"
  ],
  "fields": [
    "采样地点",
    "环境温度",
    "暴露阶段",
    "昆虫种类",
    "发育阶段",
    "保存方式"
  ]
};

// ---------- 送检时限闭环 ----------
// 规则：乙醇保存样本自采集起 72h 内须送检；其他保存方式 24h 内须冷藏，
// 超时未送检的记录标为「待送检」并锁定鉴定结论；送检登记只解除阻断，
// 不代替人工鉴定；旧记录缺采集时间按「不可送检」处理。
const ETHANOL_LIMIT_HOURS = 72;
const OTHER_LIMIT_HOURS = 24;
const STORAGE_KEY = "hxyfront-62003:records";

const PRESERVATION_OPTIONS = ["乙醇保存", "冷藏保存", "常温保存", "干燥保存"];

type SampleRecord = {
  id: string;
  location: string;     // 采样地点
  temperature: string;  // 环境温度
  exposureStage: string; // 暴露阶段
  species: string;      // 昆虫种类
  stage: string;        // 发育阶段：卵 / 幼虫 / 蛹 / 成虫
  preservation: string; // 保存方式
  collectedAt: string;  // 采样时间 ISO，空串 = 旧记录缺采集时间
  note: string;         // 鉴定备注
  submittedAt: string | null; // 送检登记时间
  identified: boolean;  // 人工鉴定结论是否通过
};

type SubmissionState = "open" | "overdue" | "submitted" | "invalid";

const STATE_META: Record<SubmissionState, { label: string; className: string }> = {
  open: { label: "时限内", className: "state-open" },
  overdue: { label: "待送检", className: "state-overdue" },
  submitted: { label: "已送检", className: "state-submitted" },
  invalid: { label: "不可送检", className: "state-invalid" }
};

// 时限规则：乙醇 72h；冷藏保存视为已合规冷藏，不计超时；其余保存方式 24h
function limitHours(preservation: string): number | null {
  if (preservation.includes("乙醇")) return ETHANOL_LIMIT_HOURS;
  if (preservation.includes("冷藏")) return null;
  return OTHER_LIMIT_HOURS;
}

function elapsedHours(rec: SampleRecord, now: number): number {
  return (now - new Date(rec.collectedAt).getTime()) / 36e5;
}

function submissionState(rec: SampleRecord, now: number): SubmissionState {
  if (!rec.collectedAt) return "invalid"; // 缺采集时间 → 不可送检
  if (rec.submittedAt) return "submitted"; // 已登记送检 → 阻断解除
  const limit = limitHours(rec.preservation);
  if (limit !== null && elapsedHours(rec, now) > limit) return "overdue"; // 超时 → 待送检
  return "open";
}

// 鉴定结论是否被阻断（待送检 / 不可送检时禁止通过）
function isBlocked(rec: SampleRecord, now: number): boolean {
  const state = submissionState(rec, now);
  return state === "overdue" || state === "invalid";
}

function fmtTime(iso: string | null): string {
  if (!iso) return "缺失";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "缺失";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDuration(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} 分钟`;
  return `${Math.floor(hours)} 小时`;
}

function deadlineText(rec: SampleRecord, now: number): string {
  if (!rec.collectedAt) return "旧记录缺采集时间，按不可送检处理，鉴定结论已锁定。";
  if (rec.submittedAt) return `已于 ${fmtTime(rec.submittedAt)} 登记送检，阻断已解除，等待人工鉴定结论。`;
  const limit = limitHours(rec.preservation);
  const elapsed = elapsedHours(rec, now);
  if (limit === null) return `冷藏保存，已采集 ${fmtDuration(elapsed)}，暂无送检时限压力。`;
  if (elapsed > limit) {
    return `已采集 ${fmtDuration(elapsed)}，超过 ${limit}h 送检时限，记录已标为待送检并锁定鉴定结论。`;
  }
  return `已采集 ${fmtDuration(elapsed)}，距 ${limit}h 送检时限剩余 ${fmtDuration(limit - elapsed)}。`;
}

function seedRecords(): SampleRecord[] {
  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 36e5).toISOString();
  return [
    {
      id: "CASE-042-A",
      location: "室外草地",
      temperature: "28.6℃",
      exposureStage: "肿胀期",
      species: "丝光绿蝇",
      stage: "幼虫",
      preservation: "乙醇保存",
      collectedAt: hoursAgo(80), // 乙醇保存超 72h → 待送检
      note: "幼虫三龄，需复核种属",
      submittedAt: null,
      identified: false
    },
    {
      id: "CASE-042-B",
      location: "阴影区域",
      temperature: "26.1℃",
      exposureStage: "腐败期",
      species: "大头金蝇",
      stage: "蛹",
      preservation: "常温保存",
      collectedAt: hoursAgo(30), // 常温保存超 24h 未冷藏 → 待送检
      note: "蛹期样本，需复核种属",
      submittedAt: null,
      identified: false
    },
    {
      id: "CASE-051-A",
      location: "水沟边缘",
      temperature: "24.3℃",
      exposureStage: "白骨化期",
      species: "巨尾阿丽蝇",
      stage: "成虫",
      preservation: "乙醇保存",
      collectedAt: hoursAgo(10), // 时限内
      note: "成虫采集，已完成拍照",
      submittedAt: null,
      identified: false
    },
    {
      id: "CASE-036-C",
      location: "废弃仓库",
      temperature: "22.8℃",
      exposureStage: "腐败期",
      species: "未定种",
      stage: "卵",
      preservation: "干燥保存",
      collectedAt: "", // 旧记录缺采集时间 → 不可送检
      note: "早期补录记录，采集时间缺失",
      submittedAt: null,
      identified: false
    },
    {
      id: "CASE-051-B",
      location: "水沟边缘",
      temperature: "24.9℃",
      exposureStage: "白骨化期",
      species: "丝光绿蝇",
      stage: "幼虫",
      preservation: "冷藏保存",
      collectedAt: hoursAgo(50),
      note: "已送检，待人工鉴定",
      submittedAt: hoursAgo(2), // 已登记送检 → 阻断解除
      identified: false
    }
  ];
}

function loadRecords(): SampleRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((r) => r && typeof r.id === "string")) {
        return parsed as SampleRecord[];
      }
    }
  } catch {
    // 存储损坏时回退到种子数据
  }
  return seedRecords();
}

type Draft = {
  location: string;
  temperature: string;
  exposureStage: string;
  species: string;
  stage: string;
  preservation: string;
  collectedAt: string;
  note: string;
};

const emptyDraft: Draft = {
  location: "",
  temperature: "",
  exposureStage: "",
  species: "",
  stage: "幼虫",
  preservation: "乙醇保存",
  collectedAt: "",
  note: ""
};

function App() {
  const [records, setRecords] = useState<SampleRecord[]>(loadRecords);
  const [stageFilter, setStageFilter] = useState<string>("全部");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [now, setNow] = useState(() => Date.now());

  // 浏览器存储：记录变更即持久化
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }, [records]);

  // 每分钟刷新一次，让超时状态随时间自动翻转
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const visibleRecords = useMemo(
    () => records.filter((r) => stageFilter === "全部" || r.stage === stageFilter),
    [records, stageFilter]
  );

  const selected = records.find((r) => r.id === selectedId) ?? null;
  const selectedState = selected ? submissionState(selected, now) : null;

  const blockedCount = records.filter((r) => isBlocked(r, now)).length;

  const metrics = useMemo(() => {
    const temps = records
      .map((r) => parseFloat(r.temperature))
      .filter((n) => !Number.isNaN(n));
    const avgTemp = temps.length
      ? `${(temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)}℃`
      : "—";
    return [
      records.length,
      avgTemp,
      new Set(records.map((r) => r.stage)).size,
      records.filter((r) => !r.identified).length
    ];
  }, [records]);

  // 送检登记：只解除阻断，不代替人工鉴定
  function registerSubmission(id: string) {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id && r.collectedAt && !r.submittedAt
          ? { ...r, submittedAt: new Date().toISOString() }
          : r
      )
    );
  }

  // 人工鉴定结论：待送检 / 不可送检状态下禁止通过
  function approveIdentification(id: string) {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== id || r.identified) return r;
        if (isBlocked(r, Date.now())) return r; // 阻断中，禁止通过
        return { ...r, identified: true };
      })
    );
  }

  function addRecord() {
    const rec: SampleRecord = {
      id: `CASE-${String(records.length + 1).padStart(3, "0")}-N`,
      location: draft.location.trim() || "未填写",
      temperature: draft.temperature.trim() || "—",
      exposureStage: draft.exposureStage.trim() || "—",
      species: draft.species.trim() || "未定种",
      stage: draft.stage,
      preservation: draft.preservation,
      // 缺采集时间按不可送检处理
      collectedAt: draft.collectedAt ? new Date(draft.collectedAt).toISOString() : "",
      note: draft.note.trim() || "—",
      submittedAt: null,
      identified: false
    };
    setRecords((prev) => [rec, ...prev]);
    setSelectedId(rec.id);
    setDraft(emptyDraft);
  }

  const setDraftField = (key: keyof Draft) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  return (
    <main className="app">
      <section className="hero">
        <p>{project.id} · 源提示词{project.sourceNo} · Port {project.port}</p>
        <h1>{project.title}</h1>
        <span>{project.prompt}</span>
      </section>

      <section className="metrics">
        {project.metrics.map((metric: string, index: number) => (
          <article key={metric}>
            <small>{metric}</small>
            <strong>{metrics[index] ?? "—"}</strong>
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>{project.domain}筛选</h2>
          <div className="chips">
            {["全部", ...project.filters].map((item: string) => (
              <button
                key={item}
                className={stageFilter === item ? "active" : ""}
                onClick={() => setStageFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <p className="filter-hint">
            按发育阶段筛选样本批次，当前显示 {visibleRecords.length} / {records.length} 条。
          </p>
        </aside>

        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>专业字段</p>
              <h2>新增记录</h2>
            </div>
            <button className="primary" onClick={addRecord}>保存记录</button>
          </div>
          <div className="field-grid">
            <label>
              <span>采样地点</span>
              <input value={draft.location} onChange={setDraftField("location")} placeholder="填写采样地点" />
            </label>
            <label>
              <span>环境温度</span>
              <input value={draft.temperature} onChange={setDraftField("temperature")} placeholder="如 28.6℃" />
            </label>
            <label>
              <span>暴露阶段</span>
              <input value={draft.exposureStage} onChange={setDraftField("exposureStage")} placeholder="填写暴露阶段" />
            </label>
            <label>
              <span>昆虫种类</span>
              <input value={draft.species} onChange={setDraftField("species")} placeholder="填写昆虫种类" />
            </label>
            <label>
              <span>发育阶段</span>
              <select value={draft.stage} onChange={setDraftField("stage")}>
                {project.filters.map((item: string) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span>保存方式</span>
              <select value={draft.preservation} onChange={setDraftField("preservation")}>
                {PRESERVATION_OPTIONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span>采样时间</span>
              <input type="datetime-local" value={draft.collectedAt} onChange={setDraftField("collectedAt")} />
            </label>
            <label>
              <span>鉴定备注</span>
              <input value={draft.note} onChange={setDraftField("note")} placeholder="填写鉴定备注" />
            </label>
          </div>
          <p className="filter-hint">
            乙醇保存 72h 内须送检，其他保存方式 24h 内须冷藏；缺采集时间的记录按不可送检处理。
          </p>
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>历史记录</p>
            <h2>近期工作台</h2>
          </div>
          <div className="heading-side">
            {blockedCount > 0 && (
              <span className="blocked-count">{blockedCount} 条待送检阻断中</span>
            )}
            <button>导出摘要</button>
          </div>
        </div>
        <div className="records-layout">
          <div className="records">
            {visibleRecords.map((rec, index) => {
              const meta = STATE_META[submissionState(rec, now)];
              return (
                <article
                  key={rec.id}
                  className={rec.id === selectedId ? "selected" : ""}
                  onClick={() => setSelectedId(rec.id)}
                >
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <div>
                    <h3>
                      {rec.id}
                      <span className={`badge ${meta.className}`}>{meta.label}</span>
                      {rec.identified && <span className="badge state-identified">已鉴定</span>}
                    </h3>
                    <p>
                      {rec.location} · {rec.species} · {rec.stage} · {rec.preservation} · 采样 {fmtTime(rec.collectedAt)}
                    </p>
                  </div>
                </article>
              );
            })}
            {visibleRecords.length === 0 && (
              <p className="placeholder">当前发育阶段筛选下暂无样本记录。</p>
            )}
          </div>

          <aside className="detail-card">
            {selected && selectedState ? (
              <>
                <div className="detail-head">
                  <h3>{selected.id}</h3>
                  <span className={`badge ${STATE_META[selectedState].className}`}>
                    {STATE_META[selectedState].label}
                  </span>
                </div>
                <dl>
                  <div><dt>采样地点</dt><dd>{selected.location}</dd></div>
                  <div><dt>环境温度</dt><dd>{selected.temperature}</dd></div>
                  <div><dt>暴露阶段</dt><dd>{selected.exposureStage}</dd></div>
                  <div><dt>昆虫种类</dt><dd>{selected.species}</dd></div>
                  <div><dt>发育阶段</dt><dd>{selected.stage}</dd></div>
                  <div><dt>保存方式</dt><dd>{selected.preservation}</dd></div>
                  <div><dt>采样时间</dt><dd>{fmtTime(selected.collectedAt)}</dd></div>
                  {selected.submittedAt && (
                    <div><dt>送检时间</dt><dd>{fmtTime(selected.submittedAt)}</dd></div>
                  )}
                  <div><dt>鉴定备注</dt><dd>{selected.note}</dd></div>
                  <div>
                    <dt>鉴定结论</dt>
                    <dd>{selected.identified ? "已通过（人工鉴定）" : "待鉴定"}</dd>
                  </div>
                </dl>
                <p className={`deadline ${STATE_META[selectedState].className}`}>
                  {deadlineText(selected, now)}
                </p>
                <div className="actions">
                  <button
                    className="primary"
                    disabled={!selected.collectedAt || !!selected.submittedAt}
                    title={
                      !selected.collectedAt
                        ? "缺采集时间，按不可送检处理"
                        : selected.submittedAt
                          ? "已登记送检"
                          : "登记送检，解除鉴定阻断"
                    }
                    onClick={() => registerSubmission(selected.id)}
                  >
                    {selected.submittedAt ? "已送检登记" : "送检登记"}
                  </button>
                  <button
                    disabled={selected.identified || isBlocked(selected, now)}
                    title={
                      selected.identified
                        ? "鉴定结论已通过"
                        : isBlocked(selected, now)
                          ? "待送检 / 不可送检状态下禁止鉴定结论通过"
                          : "人工确认鉴定结论通过"
                    }
                    onClick={() => approveIdentification(selected.id)}
                  >
                    {selected.identified ? "鉴定已通过" : "通过鉴定"}
                  </button>
                </div>
                <small className="hint">送检登记仅解除阻断，不代替人工鉴定结论。</small>
              </>
            ) : (
              <p className="placeholder">选择左侧样本记录，查看单个样本详情卡片。</p>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}

export default App;
