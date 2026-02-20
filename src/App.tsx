import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useConfig } from './hooks/useConfig';
import { Terminal, Trash2, Play, Search, ExternalLink, CheckCircle2, Loader2, BarChart2, Tag } from 'lucide-react';
import { analyzeBlogPosts, type AnalysisFinalResult } from './utils/keywordAnalyzer';
import { fetchRecentBlogPosts, fetchAndParseBlog } from './utils/blogParser';
import {
  type Grade, type StoredAnalysis,
  calcGrade, resultToRow, saveResultToLocal,
  loadResultsFromLocal, clearLocalResults,
  saveToGoogleSheet,
} from './utils/sheetSaver';

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────
const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1goP8ZCZ8BUd662EgtEGFlRP3mU4CHS0s9udfFwa4BR8/edit?gid=1689259642#gid=1689259642';
const DEFAULT_BLOG_ID = 'gabianow';
const DEFAULT_COUNT = 5;

const GRADE_COLORS: Record<Grade | string, string> = {
  S: '#fbbf24', A: '#34d399', B: '#60a5fa', C: '#a78bfa', '미노출': '#94a3b8',
};

// ─────────────────────────────────────────────
// 대시보드 카운트
// ─────────────────────────────────────────────
const countGrades = (entries: StoredAnalysis[]) => {
  const counts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, 미노출: 0, total: entries.length };
  for (const e of entries) {
    counts[calcGrade(e.result.bestRank)]++;
  }
  return counts;
};

// ─────────────────────────────────────────────
// App 컴포넌트
// ─────────────────────────────────────────────
const App: React.FC = () => {
  const [logs, setLogs] = useState<{ id: number; msg: string; time: string }[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // 현재 진행 중인 분석 데이터
  const [currentAnalysis, setCurrentAnalysis] = useState<{
    status: 'idle' | 'parsing' | 'analyzing' | 'complete' | 'error';
    title?: string;
    result?: AnalysisFinalResult;
    progress?: { current: number; total: number };
  }>({ status: 'idle' });

  // 설정 객체를 저장할 레퍼런스 (로그 전송 시 안전한 참조용)
  const configRef = useRef<any>(null);

  const addLog = useCallback((msg: string) => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    const logItem = { id: Date.now() + Math.random(), msg: `[LOG] ${msg}`, time: timeStr };
    setLogs((prev) => [...prev, logItem]);

    // 구글 시트 로그 탭으로 전송 (비동기)
    const appsScriptUrl = configRef.current?.googleAppsScriptUrl;
    if (appsScriptUrl) {
      saveToGoogleSheet({ time: timeStr, message: msg }, appsScriptUrl, () => { }, 'log');
    }
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const { config } = useConfig(addLog);

  useEffect(() => {
    if (config) configRef.current = config;
  }, [config]);

  // 분석 기록 저장소
  const [analysisResults, setAnalysisResults] = useState<StoredAnalysis[]>(() => loadResultsFromLocal());
  const analysisResultsRef = useRef(analysisResults);
  useEffect(() => { analysisResultsRef.current = analysisResults; }, [analysisResults]);

  // 검색창 상태
  const [searchInput, setSearchInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // ─────────────────────────────────────────────
  // 분석 핵심 로직
  // ─────────────────────────────────────────────
  const runAnalysis = async (url: string, current?: number, total?: number) => {
    if (!config) return;
    const blogIdMatch = url.match(/blog\.naver\.com\/([^/?#]+)/);
    const blogId = blogIdMatch ? blogIdMatch[1] : '';

    setCurrentAnalysis({ status: 'parsing', progress: current ? { current, total: total! } : undefined });

    try {
      const parsedData = await fetchAndParseBlog(url, addLog);
      setCurrentAnalysis(prev => ({ ...prev, status: 'analyzing', title: parsedData.title }));

      const result = await analyzeBlogPosts(parsedData.title, parsedData.content, blogId, config, addLog);

      const row = resultToRow(parsedData.title, result);
      const entry: StoredAnalysis = {
        title: parsedData.title, blogId,
        timestamp: new Date().toISOString(),
        result, row,
      };

      saveResultToLocal(entry, addLog);
      setAnalysisResults((prev) => [...prev, entry]);
      setCurrentAnalysis(prev => ({ ...prev, status: 'complete', result }));

      const appsScriptUrl = config.googleAppsScriptUrl;
      await saveToGoogleSheet(row, appsScriptUrl, addLog, 'analysis');

    } catch (err: any) {
      addLog(`분석 중 오류 발생: ${err?.message ?? err}`);
      setCurrentAnalysis(prev => ({ ...prev, status: 'error' }));
    }
  };

  const handleStart = useCallback(async () => {
    if (isAnalyzing) return;
    if (!config) { addLog('설정을 확인해주세요.'); return; }

    setIsAnalyzing(true);
    const input = searchInput.trim();

    try {
      if (input && input.includes('blog.naver.com')) {
        await runAnalysis(input);
      } else {
        const blogId = input || DEFAULT_BLOG_ID;
        const posts = await fetchRecentBlogPosts(blogId, DEFAULT_COUNT, addLog);
        if (posts.length === 0) { setIsAnalyzing(false); return; }

        for (let i = 0; i < posts.length; i++) {
          await runAnalysis(posts[i].link, i + 1, posts.length);
          if (i < posts.length - 1) await new Promise(r => setTimeout(r, 1500));
        }
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [searchInput, isAnalyzing, config, addLog]);

  const counts = countGrades(analysisResults);

  return (
    <div id="root">
      {/* ═══ 상단 대시보드 ═══ */}
      <div className="top-dashboard">
        <div className="dashboard-inner">
          <div className="dashboard-header">
            <div className="dashboard-title-row">
              <h1 className="dashboard-heading">블로그 분석</h1>
              <span className="dashboard-subtitle">스프레드시트 동기화</span>
            </div>
            <div className="grade-badges">
              {[
                { label: 'S', range: '1위' },
                { label: 'A', range: '~5위' },
                { label: 'B', range: '~10위' },
                { label: 'C', range: '~30위' },
                { label: '미노출', range: '31위~' }
              ].map((g) => (
                <div key={g.label} className="grade-badge" style={{ borderColor: `${GRADE_COLORS[g.label]}44` }}>
                  <div className="grade-label" style={{ color: GRADE_COLORS[g.label] }}>{g.label}</div>
                  <div className="grade-count" style={{ color: GRADE_COLORS[g.label] }}>{counts[g.label]}</div>
                  <div className="grade-range">{g.range}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="search-bar">
            <div className="search-input-wrapper">
              <Search size={16} color="#64748b" />
              <input
                type="text"
                className="search-input"
                placeholder="URL 입력 (비우고 시작하면 gabianow 최근 5개 콘텐츠 분석)"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                disabled={isAnalyzing}
              />
            </div>
            <button className={`start-btn ${isAnalyzing ? 'analyzing' : ''}`} onClick={handleStart} disabled={isAnalyzing}>
              {isAnalyzing ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
              {isAnalyzing ? '분석 중...' : '시작'}
            </button>
          </div>

          <div className="dashboard-actions">
            <a href={SPREADSHEET_URL} target="_blank" rel="noreferrer" className="action-btn primary">
              <ExternalLink size={13} /> 구글 시트 바로가기
            </a>
            <button onClick={() => { clearLocalResults(); setAnalysisResults([]); addLog('초기화되었습니다.'); }} className="action-btn danger">
              <Trash2 size={13} /> 기록 삭제
            </button>
          </div>
        </div>
      </div>

      {/* ═══ 메인 영역: 테이블 뷰 ═══ */}
      <div className="main-area">
        <div className="analysis-table-container">
          {/* 현재 진행 중인 분석 패널 */}
          {currentAnalysis.status !== 'idle' && (
            <div className={`active-analysis-card ${currentAnalysis.status}`}>
              <div className="card-header">
                <div className="status-badge">
                  {currentAnalysis.status === 'complete' ? <CheckCircle2 size={16} /> : <Loader2 size={16} className="spin" />}
                  {currentAnalysis.status.toUpperCase()}
                </div>
                {currentAnalysis.progress && (
                  <span className="progress-text">{currentAnalysis.progress.current} / {currentAnalysis.progress.total}</span>
                )}
              </div>
              <h2 className="analysis-title">{currentAnalysis.title || '데이터 로드 중...'}</h2>

              {currentAnalysis.result && (
                <div className="result-grid">
                  <div className="result-item">
                    <label><Tag size={14} /> 키워드 풀</label>
                    <div className="keyword-tags">
                      {currentAnalysis.result.pool.map((k, i) => (
                        <span key={i} className="k-tag">{k}</span>
                      ))}
                    </div>
                  </div>
                  <div className="result-item">
                    <label><BarChart2 size={14} /> 베스트 순위</label>
                    <div className="rank-info">
                      <span className="best-kw">{currentAnalysis.result.finalKeyword}</span>
                      <span className="best-rank" style={{ color: GRADE_COLORS[calcGrade(currentAnalysis.result.bestRank)] }}>
                        {currentAnalysis.result.bestRank ? `${currentAnalysis.result.bestRank}위` : '100위 밖'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 전체 히스토리 테이블 */}
          <div className="history-table-wrapper">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>블로그 제목</th>
                  <th>키워드</th>
                  <th>노출 순위</th>
                  <th>등급</th>
                </tr>
              </thead>
              <tbody>
                {analysisResults.length === 0 ? (
                  <tr><td colSpan={5} className="empty">상단 [시작] 버튼을 눌러 분석을 시작하세요.</td></tr>
                ) : (
                  [...analysisResults].reverse().map((entry, i) => (
                    <tr key={i}>
                      <td>{entry.timestamp.slice(5, 16).replace('T', ' ')}</td>
                      <td className="title-cell">{entry.title}</td>
                      <td>{entry.result.finalKeyword}</td>
                      <td className="rank-cell">{entry.result.bestRank ? `${entry.result.bestRank}위` : '-'}</td>
                      <td>
                        <span className="grade-pill" style={{
                          background: `${GRADE_COLORS[calcGrade(entry.result.bestRank)]}22`,
                          color: GRADE_COLORS[calcGrade(entry.result.bestRank)],
                          borderColor: `${GRADE_COLORS[calcGrade(entry.result.bestRank)]}55`
                        }}>
                          {calcGrade(entry.result.bestRank)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ═══ 하단 로그 ═══ */}
      <div className="log-area">
        <div className="log-header">
          <Terminal size={14} />
          <span>콘솔 로그 (구글 시트 "로그" 탭 동시 기록)</span>
        </div>
        <div className="log-content">
          {[...logs].reverse().map((log) => (
            <div key={log.id} className="log-line">
              <span className="timestamp">[{log.time}]</span>
              {log.msg}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
};

export default App;
