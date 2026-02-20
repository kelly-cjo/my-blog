import React, { useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    Handle,
    Position,
    type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Search, Play, ClipboardList, Tag, BarChart2 } from 'lucide-react';
import { fetchAndParseBlog, type BlogContent } from '../utils/blogParser';
import { analyzeBlogPosts, type AnalysisFinalResult } from '../utils/keywordAnalyzer';
import type { Config } from '../hooks/useConfig';

// ─────────────────────────────────────────────
// 노드 데이터 인터페이스
// ─────────────────────────────────────────────
interface BaseNodeData { label?: string;[key: string]: unknown; }
interface StartNodeData extends BaseNodeData {
    blog_url: string;
    onChange: (url: string) => void;
    onAnalyze: () => void;
}
interface ResultNodeData extends BaseNodeData {
    result: BlogContent | null;
    loading: boolean;
    currentIndex?: number;
    totalCount?: number;
}
interface KeywordNodeData extends BaseNodeData {
    keywords: string[];
    loading: boolean;
}
interface RankNodeData extends BaseNodeData {
    ranks: { keyword: string; rank: number | null }[];
    finalKeyword: string | null;
    bestRank: number | null;
    searchVolume: { totalVolume: number; monthlyPcQcCnt: number; monthlyMobileQcCnt: number } | null;
    otherGoodKeywords: { keyword: string; rank: number | null }[];
    loading: boolean;
}

// ─────────────────────────────────────────────
// 커스텀 노드: 시작
// ─────────────────────────────────────────────
const StartNode = ({ data }: { data: StartNodeData }) => (
    <div className="custom-node">
        <h3><Search size={16} /> 네이버 블로그 분석 시작</h3>
        <div style={{ marginTop: '10px' }}>
            <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                변수명: blog_url
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
                <input
                    type="text"
                    placeholder="https://blog.naver.com/..."
                    value={data.blog_url}
                    onChange={(e) => data.onChange(e.target.value)}
                />
                <button
                    onClick={data.onAnalyze}
                    style={{
                        background: '#38bdf8', border: 'none', borderRadius: '6px',
                        padding: '8px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    <Play size={16} color="white" />
                </button>
            </div>
        </div>
        <Handle type="source" position={Position.Right} style={{ background: '#38bdf8' }} />
    </div>
);

// ─────────────────────────────────────────────
// 커스텀 노드: 블로그 파싱 결과
// ─────────────────────────────────────────────
const ResultNode = ({ data }: { data: ResultNodeData }) => (
    <div className="custom-node" style={{ maxWidth: '400px' }}>
        <h3>
            <ClipboardList size={16} /> 분석 결과
            {data.currentIndex != null && data.totalCount != null && (
                <span style={{ fontSize: '0.7rem', color: '#60a5fa', marginLeft: '8px' }}>
                    ({data.currentIndex}/{data.totalCount})
                </span>
            )}
        </h3>
        {data.loading ? (
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', padding: '10px' }}>분석 중...</div>
        ) : data.result ? (
            <div style={{ marginTop: '10px', fontSize: '0.8rem' }}>
                <div style={{ fontWeight: 'bold', color: '#38bdf8', marginBottom: '4px' }}>{data.result.title}</div>
                <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>작성자: {data.result.author}</div>
                {data.result.hashtags.length > 0 && (
                    <div style={{ marginTop: '6px', color: '#f472b6', fontSize: '0.7rem' }}>
                        {data.result.hashtags.map((t) => `#${t}`).join('  ')}
                    </div>
                )}
                <div style={{
                    marginTop: '8px', maxHeight: '120px', overflowY: 'auto',
                    background: 'rgba(15, 23, 42, 0.5)', padding: '8px',
                    borderRadius: '4px', whiteSpace: 'pre-wrap'
                }}>
                    {data.result.content.substring(0, 400)}...
                </div>
            </div>
        ) : (
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', padding: '10px' }}>데이터가 없습니다.</div>
        )}
        <Handle type="target" position={Position.Left} style={{ background: '#38bdf8' }} />
        <Handle type="source" position={Position.Right} style={{ background: '#a78bfa' }} />
    </div>
);

// ─────────────────────────────────────────────
// 커스텀 노드: 키워드 분석
// ─────────────────────────────────────────────
const KeywordNode = ({ data }: { data: KeywordNodeData }) => (
    <div className="custom-node" style={{ maxWidth: '320px' }}>
        <h3><Tag size={16} /> 키워드 풀</h3>
        {data.loading ? (
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', padding: '10px' }}>키워드 추출 중...</div>
        ) : data.keywords.length > 0 ? (
            <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {data.keywords.map((kw, i) => (
                    <span key={i} style={{
                        background: 'rgba(167,139,250,0.15)', color: '#a78bfa',
                        border: '1px solid rgba(167,139,250,0.4)',
                        borderRadius: '12px', padding: '3px 10px', fontSize: '0.75rem'
                    }}>
                        {kw}
                    </span>
                ))}
            </div>
        ) : (
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', padding: '10px' }}>추출된 키워드 없음</div>
        )}
        <Handle type="target" position={Position.Left} style={{ background: '#a78bfa' }} />
        <Handle type="source" position={Position.Right} style={{ background: '#34d399' }} />
    </div>
);

// ─────────────────────────────────────────────
// 커스텀 노드: 순위 결과
// ─────────────────────────────────────────────
const RankNode = ({ data }: { data: RankNodeData }) => (
    <div className="custom-node" style={{ maxWidth: '360px' }}>
        <h3><BarChart2 size={16} /> 블로그 순위 &amp; 결과</h3>
        {data.loading ? (
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', padding: '10px' }}>순위 조회 중...</div>
        ) : data.ranks.length > 0 ? (
            <div style={{ marginTop: '10px' }}>
                {data.ranks.map((r, i) => (
                    <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between',
                        padding: '3px 6px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                        fontSize: '0.76rem'
                    }}>
                        <span style={{ color: r.keyword === data.finalKeyword ? '#fbbf24' : '#e2e8f0' }}>
                            {r.keyword === data.finalKeyword ? '★ ' : ''}{r.keyword}
                        </span>
                        <span style={{ color: r.rank !== null && r.rank <= 10 ? '#34d399' : '#94a3b8', fontWeight: 'bold' }}>
                            {r.rank !== null ? `${r.rank}위` : '100위 밖'}
                        </span>
                    </div>
                ))}
                {data.searchVolume && (
                    <div style={{ marginTop: '8px', padding: '6px', background: 'rgba(251,191,36,0.08)', borderRadius: '6px', fontSize: '0.76rem' }}>
                        <span style={{ color: '#fbbf24' }}>★ {data.finalKeyword}</span>
                        <span style={{ color: '#60a5fa', marginLeft: '6px', fontSize: '0.72rem' }}>
                            ({data.searchVolume.totalVolume.toLocaleString()}회)
                        </span>
                        <span style={{ color: '#94a3b8', marginLeft: '8px' }}>
                            월 PC {data.searchVolume.monthlyPcQcCnt.toLocaleString()} / 모바일 {data.searchVolume.monthlyMobileQcCnt.toLocaleString()}
                        </span>
                    </div>
                )}
                {data.otherGoodKeywords.length > 0 && (
                    <div style={{ marginTop: '6px', fontSize: '0.73rem', color: '#60a5fa' }}>
                        우수: {data.otherGoodKeywords.map((r) => `${r.keyword}(${r.rank}위)`).join(' · ')}
                    </div>
                )}
            </div>
        ) : (
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', padding: '10px' }}>순위 데이터 없음</div>
        )}
        <Handle type="target" position={Position.Left} style={{ background: '#34d399' }} />
    </div>
);

// ─────────────────────────────────────────────
// 노드 타입 등록
// ─────────────────────────────────────────────
const nodeTypes = {
    startNode: StartNode,
    resultNode: ResultNode,
    keywordNode: KeywordNode,
    rankNode: RankNode,
};

// ─────────────────────────────────────────────
// 초기 노드 / 엣지
// ─────────────────────────────────────────────
const INITIAL_URL = 'https://blog.naver.com/gabianow';

const buildInitialNodes = (
    url: string,
    onChange: (u: string) => void,
    onAnalyze: () => void,
): Node[] => [
        {
            id: '1', type: 'startNode',
            data: { blog_url: url, onChange, onAnalyze } as StartNodeData,
            position: { x: 40, y: 160 },
        },
        {
            id: '2', type: 'resultNode',
            data: { result: null, loading: false } as ResultNodeData,
            position: { x: 380, y: 60 },
        },
        {
            id: '3', type: 'keywordNode',
            data: { keywords: [], loading: false } as KeywordNodeData,
            position: { x: 820, y: 60 },
        },
        {
            id: '4', type: 'rankNode',
            data: { ranks: [], finalKeyword: null, bestRank: null, searchVolume: null, otherGoodKeywords: [], loading: false } as RankNodeData,
            position: { x: 1180, y: 60 },
        },
    ];

const INITIAL_EDGES = [
    { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#38bdf8' } },
    { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: '#a78bfa' } },
    { id: 'e3-4', source: '3', target: '4', animated: true, style: { stroke: '#34d399' } },
];

// ─────────────────────────────────────────────
// BlogFlow 외부 트리거 인터페이스
// ─────────────────────────────────────────────
export interface BlogFlowHandle {
    analyzeUrl: (url: string, idx?: number, total?: number) => Promise<void>;
}

// ─────────────────────────────────────────────
// BlogFlow 컴포넌트
// ─────────────────────────────────────────────
interface BlogFlowProps {
    config: Config | null;
    addLog: (msg: string) => void;
    onAnalysisComplete?: (title: string, blogId: string, result: AnalysisFinalResult) => void;
}

const BlogFlow = forwardRef<BlogFlowHandle, BlogFlowProps>(({ config, addLog, onAnalysisComplete }, ref) => {
    const [blogUrl, setBlogUrl] = useState(INITIAL_URL);

    const setAllLoading = (nds: Node[]) =>
        nds.map((node) => {
            if (node.id === '2') return { ...node, data: { ...(node.data as ResultNodeData), loading: true, result: null } };
            if (node.id === '3') return { ...node, data: { ...(node.data as KeywordNodeData), loading: true, keywords: [] } };
            if (node.id === '4') return { ...node, data: { ...(node.data as RankNodeData), loading: true, ranks: [] } };
            return node;
        });

    // ― 단일 URL 분석 (내부 + 외부 공용) ―
    const analyzeOneUrl = useCallback(async (url: string, currentIndex?: number, totalCount?: number) => {
        if (!config) { addLog('설정을 불러오지 못했습니다.'); return; }

        const blogIdMatch = url.match(/blog\.naver\.com\/([^/?#]+)/);
        const blogId = blogIdMatch ? blogIdMatch[1] : '';

        setNodes((nds) => setAllLoading(nds) as Node[]);

        // 진행 상태 표시
        if (currentIndex != null && totalCount != null) {
            addLog(`─── [${currentIndex}/${totalCount}] 분석 시작: ${url} ───`);
        } else {
            addLog(`블로그 분석 시작: ${url}`);
        }

        try {
            const parsedData = await fetchAndParseBlog(url, addLog);

            setNodes((nds) =>
                nds.map((node) =>
                    node.id === '2'
                        ? {
                            ...node, data: {
                                ...(node.data as ResultNodeData),
                                loading: false, result: parsedData,
                                currentIndex, totalCount,
                            }
                        }
                        : node
                )
            );

            const result: AnalysisFinalResult = await analyzeBlogPosts(
                parsedData.title,
                parsedData.content,
                blogId,
                config,
                addLog,
            );

            setNodes((nds) =>
                nds.map((node) => {
                    if (node.id === '3') {
                        return { ...node, data: { ...(node.data as KeywordNodeData), loading: false, keywords: result.pool } };
                    }
                    if (node.id === '4') {
                        return {
                            ...node, data: {
                                ...(node.data as RankNodeData),
                                loading: false,
                                ranks: result.ranks,
                                finalKeyword: result.finalKeyword,
                                bestRank: result.bestRank,
                                searchVolume: result.searchVolume,
                                otherGoodKeywords: result.otherGoodKeywords,
                            } as RankNodeData
                        };
                    }
                    return node;
                })
            );

            onAnalysisComplete?.(parsedData.title, blogId, result);
            addLog('분석 완료!');
        } catch (error) {
            addLog(`분석 오류: ${error}`);
            setNodes((nds) =>
                nds.map((node) => {
                    if (node.id === '2') return { ...node, data: { ...(node.data as ResultNodeData), loading: false, result: null } };
                    if (node.id === '3') return { ...node, data: { ...(node.data as KeywordNodeData), loading: false, keywords: [] } };
                    if (node.id === '4') return { ...node, data: { ...(node.data as RankNodeData), loading: false, ranks: [] } };
                    return node;
                })
            );
        }
    }, [config, addLog, onAnalysisComplete]);

    // 내부 시작 노드에서의 분석
    const handleAnalyze = useCallback(async () => {
        await analyzeOneUrl(blogUrl);
    }, [blogUrl, analyzeOneUrl]);

    // 외부에서 호출 가능한 핸들
    useImperativeHandle(ref, () => ({
        analyzeUrl: (url: string, idx?: number, total?: number) => analyzeOneUrl(url, idx, total),
    }), [analyzeOneUrl]);

    const onUrlChange = useCallback((newUrl: string) => {
        setBlogUrl(newUrl);
        setNodes((nds) =>
            nds.map((node) =>
                node.id === '1'
                    ? { ...node, data: { ...(node.data as StartNodeData), blog_url: newUrl } }
                    : node
            )
        );
    }, []);

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
        buildInitialNodes(INITIAL_URL, onUrlChange, handleAnalyze)
    );
    const [edges, , onEdgesChange] = useEdgesState(INITIAL_EDGES);

    React.useEffect(() => {
        setNodes((nds) =>
            nds.map((node) =>
                node.id === '1'
                    ? { ...node, data: { ...(node.data as StartNodeData), onChange: onUrlChange, onAnalyze: handleAnalyze } }
                    : node
            )
        );
    }, [handleAnalyze, onUrlChange]);

    return (
        <div className="blog-flow-container">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes as any}
                fitView
            >
                <Controls />
                <MiniMap />
                <Background color="#334155" gap={20} />
            </ReactFlow>
        </div>
    );
});

BlogFlow.displayName = 'BlogFlow';

export default BlogFlow;
