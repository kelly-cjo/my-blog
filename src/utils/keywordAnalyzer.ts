import axios from 'axios';
import type { Config } from '../hooks/useConfig';

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────
export interface RankEntry {
    keyword: string;
    rank: number | null;
}

export interface SearchVolumeEntry {
    keyword: string;
    monthlyPcQcCnt: number;
    monthlyMobileQcCnt: number;
    totalVolume: number;
}

export interface AnalysisFinalResult {
    hashtags: string[];
    smartKeywords: string[];
    pool: string[];
    titleRank: number | null;
    ranks: RankEntry[];
    bestKeyword: string | null;
    bestRank: number | null;
    otherGoodKeywords: RankEntry[];
    finalKeyword: string | null;
    searchVolume: { totalVolume: number; monthlyPcQcCnt: number; monthlyMobileQcCnt: number } | null;
}

// ─────────────────────────────────────────────
// 1. 해시태그 추출
// ─────────────────────────────────────────────
export const extractHashtags = (content: string): string[] => {
    const matches = content.match(/#([가-힣a-zA-Z0-9_]+)/g) ?? [];
    return [...new Set(matches.map((t) => t.replace('#', '')))];
};

// ─────────────────────────────────────────────
// 2. 한국어 명사 빈도 기반 추출 (조사 제거 로직 포함)
// ─────────────────────────────────────────────
const STOPWORDS = new Set([
    '있습니다', '합니다', '하는', '있는', '이런', '그런', '저런',
    '때문', '이후', '이전', '통해', '위해', '대한', '관련', '이번',
    '오늘', '내일', '어제', '하지만', '그리고', '또한', '따라',
    '정도', '경우', '부분', '내용', '같은', '다른', '모든',
]);

// 한국어 조사 목록 (긴 것부터 매칭하여 제거)
const PARTICLES = [
    '에서', '으로', '부터', '까지', '보다', '처럼', '하고',
    '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '만', '로', '나'
];

const stripParticles = (word: string): string => {
    let clean = word;
    for (const p of PARTICLES) {
        if (clean.endsWith(p) && clean.length > p.length) {
            // 조사를 떼어냈을 때 남은 글자가 2글자 이상인 경우만 적용 (단음절 명사 보호)
            const stripped = clean.slice(0, -p.length);
            if (stripped.length >= 2) {
                clean = stripped;
                break;
            }
        }
    }
    return clean;
};

const extractNouns = (text: string): Map<string, number> => {
    const freq = new Map<string, number>();
    const words = text.match(/[가-힣]{2,}/g) ?? [];
    for (const rawWord of words) {
        const word = stripParticles(rawWord);
        if (word.length < 2 || STOPWORDS.has(word)) continue;
        freq.set(word, (freq.get(word) ?? 0) + 1);
    }
    return freq;
};

// ─────────────────────────────────────────────
// 3. 제목 bigram / trigram (조사 제거 후 조합)
// ─────────────────────────────────────────────
const extractTitleNgrams = (title: string): string[] => {
    const tokens = title
        .replace(/[^\s가-힣a-zA-Z0-9]/g, ' ')
        .split(/\s+/)
        .map(t => stripParticles(t))
        .filter((t) => t.length >= 2);

    const ngrams: string[] = [];
    for (let i = 0; i < tokens.length - 1; i++) {
        ngrams.push(`${tokens[i]} ${tokens[i + 1]}`);
        if (i < tokens.length - 2) ngrams.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
    }
    return ngrams;
};

// ─────────────────────────────────────────────
// 4. 스마트 키워드 추출 (최대 5개)
// ─────────────────────────────────────────────
export const extractSmartKeywords = (
    title: string,
    content: string,
    hashtags: string[],
): string[] => {
    const result: string[] = [];

    // 우선순위 1: 해시태그
    for (const tag of hashtags) {
        if (result.length >= 5) break;
        if (!result.includes(tag)) result.push(tag);
    }
    if (result.length >= 5) return result;

    // 우선순위 2: 제목+본문 교차 명사
    const titleNouns = extractNouns(title);
    const contentNouns = extractNouns(content);
    const scored: [string, number][] = [];
    for (const [word, titleFreq] of titleNouns) {
        const contentFreq = contentNouns.get(word) ?? 0;
        scored.push([word, titleFreq * 3 + contentFreq]);
    }
    for (const [word, freq] of contentNouns) {
        if (!titleNouns.has(word) && freq >= 2) scored.push([word, freq]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    for (const [word] of scored) {
        if (result.length >= 5) break;
        if (!result.includes(word)) result.push(word);
    }
    if (result.length >= 5) return result;

    // 우선순위 3: 제목 n-gram
    for (const ng of extractTitleNgrams(title)) {
        if (result.length >= 5) break;
        if (!result.includes(ng)) result.push(ng);
    }
    return result;
};

// ─────────────────────────────────────────────
// 5. 후보군 통합
// ─────────────────────────────────────────────
export const mergeKeywordPool = (hashtags: string[], smartKeywords: string[]): string[] =>
    [...new Set([...hashtags, ...smartKeywords])];

const formatAxiosError = (err: any): string => {
    if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const data = err.response?.data;
        const msg = err.message;

        if (msg === 'Network Error') {
            return `네트워크 에러: API 서버에 연결할 수 없거나 CORS 차단이 발생했습니다.`;
        }

        if (status === 500) {
            return `서버 내부 오류(500): ${msg}. API키 설정이나 대상 서버 상태를 확인하세요. ${data ? JSON.stringify(data).substring(0, 100) : ''}`;
        }
        return `${msg}${status ? ` (HTTP ${status})` : ''}`;
    }
    return String(err);
};

// ─────────────────────────────────────────────
// 6. 블로그 순위 조회 (Vite proxy → 네이버 검색 API)
// ─────────────────────────────────────────────
export const getBlogRank = async (
    keyword: string,
    blogId: string,
    config: Config,
    onLog?: (msg: string) => void,
): Promise<number | null> => {
    const MAX_RESULTS = 100;
    const PAGE_SIZE = 10;
    const urlPattern = `blog.naver.com/${blogId}`;

    try {
        let rank = 0;
        for (let start = 1; start <= MAX_RESULTS; start += PAGE_SIZE) {
            const response = await axios.get('/naver-search/v1/search/blog.json', {
                params: { query: keyword, display: PAGE_SIZE, start },
                headers: {
                    'X-Naver-Client-Id': config.naverSearch.clientId,
                    'X-Naver-Client-Secret': config.naverSearch.clientSecret,
                },
                timeout: 10000,
            });

            const items: { link: string; bloggerlink?: string }[] = response.data.items ?? [];
            for (const item of items) {
                rank++;
                const link = (item.link ?? '') + (item.bloggerlink ?? '');
                if (link.toLowerCase().includes(urlPattern.toLowerCase())) return rank;
            }
            if (items.length < PAGE_SIZE) break;
        }
        return null; // 100위 내 없음
    } catch (err: any) {
        onLog?.(`[순위 조회 오류] "${keyword}": ${formatAxiosError(err)}`);
        return null;
    }
};

// ─────────────────────────────────────────────
// 7. 검색광고 API HMAC-SHA256 서명 생성 (Web Crypto API)
// ─────────────────────────────────────────────
const makeAdsSignature = async (
    timestamp: number,
    method: string,
    path: string,
    secretKey: string,
): Promise<string> => {
    const message = `${timestamp}.${method}.${path}`;
    const keyData = new TextEncoder().encode(secretKey);
    const msgData = new TextEncoder().encode(message);
    const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
};

// ─────────────────────────────────────────────
// 8. 검색광고 API 검색량 조회
// ─────────────────────────────────────────────
const parseVolume = (val: any): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string' && val.includes('<')) return 5; // "10 미만" 등 대응
    const n = Number(val);
    return isNaN(n) ? 0 : n;
};

export const getSearchVolume = async (
    keyword: string,
    config: Config,
    onLog?: (msg: string) => void,
): Promise<SearchVolumeEntry | null> => {
    const path = '/keywordstool';
    const method = 'GET';
    const timestamp = Date.now();

    if (!config.searchAds.licenseKey || !config.searchAds.secretKey || !config.searchAds.customerId) {
        onLog?.(`[검색량 조회 스킵] API 설정이 불완전합니다.`);
        return null;
    }

    try {
        const signature = await makeAdsSignature(timestamp, method, path, config.searchAds.secretKey);
        const response = await axios.get(`/naver-ads${path}`, {
            params: { hintKeywords: keyword, showDetail: 1 },
            headers: {
                'X-Timestamp': String(timestamp),
                'X-API-KEY': config.searchAds.licenseKey,
                'X-Customer': config.searchAds.customerId,
                'X-Signature': signature,
            },
            timeout: 10000,
        });

        const keywordList: any[] = response.data.keywordList ?? [];
        if (keywordList.length === 0) {
            onLog?.(`[공지] "${keyword}" 관련 검색 데이터가 광고 API에 존재하지 않습니다.`);
            return null;
        }

        // 정확히 일치하거나 공백 제거 후 일치하는 키워드 찾기
        const found = keywordList.find(
            (k) => k.relKeyword === keyword || k.relKeyword?.replace(/\s/g, '') === keyword.replace(/\s/g, ''),
        ) ?? keywordList[0];

        const pc = parseVolume(found.monthlyPcQcCnt);
        const mobile = parseVolume(found.monthlyMobileQcCnt);
        return {
            keyword: found.relKeyword ?? keyword,
            monthlyPcQcCnt: pc,
            monthlyMobileQcCnt: mobile,
            totalVolume: pc + mobile,
        };
    } catch (err: any) {
        onLog?.(`[검색량 조회 오류] "${keyword}": ${formatAxiosError(err)}`);
        return null;
    }
};

// ─────────────────────────────────────────────
// 9. 분석 전체 흐름 (5단계 순서 보장)
// ─────────────────────────────────────────────
export const analyzeBlogPosts = async (
    title: string,
    content: string,
    blogId: string,
    config: Config,
    onLog: (msg: string) => void,
): Promise<AnalysisFinalResult> => {

    // ── 전처리: 스마트 키워드 + 후보군 생성 ────────
    const hashtags = extractHashtags(content);
    onLog(`식별된 해시태그: ${hashtags.length > 0 ? hashtags.join(', ') : '없음'}`);

    const smartKeywords = extractSmartKeywords(title, content, hashtags);
    onLog(`스마트 키워드 추출 완료: ${smartKeywords.join(', ')}`);

    const pool = mergeKeywordPool(hashtags, smartKeywords);
    onLog(`통합 검색 후보군 생성 완료 (총 ${pool.length}개 키워드)`);

    // ─────────────────────────────────────────────
    // Step 1: 제목 점검
    // ─────────────────────────────────────────────
    const titleRank = await getBlogRank(title, blogId, config, onLog);
    if (titleRank === 1) {
        onLog('> [확인] 제목 전체 검색 결과 1위로 정상 노출 중입니다.');
    } else if (titleRank !== null) {
        onLog(`> [확인] 제목 전체 검색 결과 ${titleRank}위 노출 중입니다.`);
    } else {
        onLog('> [확인] 제목 전체로 검색 시 100위 이내 미노출.');
    }

    // ─────────────────────────────────────────────
    // Step 2: 전수 조사
    // ─────────────────────────────────────────────
    onLog('전수 조사를 시작합니다');
    const ranks: RankEntry[] = [];
    for (const keyword of pool) {
        onLog(`"${keyword}" 순위 조회 중...`);
        const rank = await getBlogRank(keyword, blogId, config, onLog);
        ranks.push({ keyword, rank });
        if (rank !== null) {
            onLog(`"${keyword}" 블로그 순위: ${rank}위`);
        } else {
            onLog(`"${keyword}" 100위 이내 없음`);
        }
    }

    // ─────────────────────────────────────────────
    // Step 3: 선정 (베스트 키워드)
    // ─────────────────────────────────────────────
    // 순위가 있는 것 중 가장 높은(숫자가 작은) 순서로 정렬
    const ranked = ranks.filter((r) => r.rank !== null).sort((a, b) => a.rank! - b.rank!);
    const best = ranked[0] ?? null;
    const bestKeyword = best?.keyword ?? null;
    const bestRank = best?.rank ?? null;

    if (bestKeyword) {
        onLog(`베스트 키워드 선정: "${bestKeyword}" (${bestRank}위)`);
    }

    // ─────────────────────────────────────────────
    // Step 4: 기타 우수 키워드 (10위 이내)
    // ─────────────────────────────────────────────
    const otherGoodKeywords = ranked.filter((r) => r.keyword !== bestKeyword && r.rank! <= 10);
    if (otherGoodKeywords.length > 0) {
        onLog(`기타 우수 키워드 발견: ${otherGoodKeywords.map((r) => `"${r.keyword}"(${r.rank}위)`).join(', ')}`);
    }

    // ─────────────────────────────────────────────
    // Step 5: 결과 확정
    // ─────────────────────────────────────────────
    const finalKeyword = bestKeyword;
    onLog(`최종 선정 키워드: ${finalKeyword ?? '없음'}`);

    return {
        hashtags,
        smartKeywords,
        pool,
        titleRank,
        ranks,
        bestKeyword,
        bestRank,
        otherGoodKeywords,
        finalKeyword,
        searchVolume: null,
    };
};
