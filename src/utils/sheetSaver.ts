import type { AnalysisFinalResult } from './keywordAnalyzer';

// ─────────────────────────────────────────────
// 구글 스프레드시트 저장 유틸리티
// ─────────────────────────────────────────────

// 등급 계산: S(1위) A(2~5) B(6~10) C(11~30) 미노출(없음/31+)
export type Grade = 'S' | 'A' | 'B' | 'C' | '미노출';

export const calcGrade = (rank: number | null): Grade => {
    if (rank === null) return '미노출';
    if (rank === 1) return 'S';
    if (rank <= 5) return 'A';
    if (rank <= 10) return 'B';
    if (rank <= 30) return 'C';
    return '미노출';
};

// 분석 결과를 Row 데이터로 변환
export interface SheetRow {
    날짜: string;
    블로그제목: string;
    베스트키워드: string;
    베스트순위: string;
    등급: Grade;
}

export const resultToRow = (
    title: string,
    result: AnalysisFinalResult,
): SheetRow => {
    return {
        날짜: new Date().toISOString().slice(0, 10),
        블로그제목: title,
        베스트키워드: result.finalKeyword ?? '-',
        베스트순위: result.bestRank !== null ? `${result.bestRank}위` : '-',
        등급: calcGrade(result.bestRank),
    };
};

// ─────────────────────────────────────────────
// 방법 1: Google Apps Script Web App 연동
// ─────────────────────────────────────────────
export const saveToGoogleSheet = async (
    data: any,
    appsScriptUrl: string | undefined,
    onLog: (msg: string) => void,
    type: 'analysis' | 'log' = 'analysis'
): Promise<boolean> => {
    if (!appsScriptUrl) return false;

    try {
        const payload = {
            type, // 'analysis' 또는 'log'
            tabName: type === 'analysis' ? '분석기록' : '로그',
            data: data
        };

        await fetch(appsScriptUrl, {
            method: 'POST',
            // text/plain으로 보내야 CORS preflight(OPTIONS 메서드)를 유발하지 않음
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            mode: 'no-cors',
            body: JSON.stringify(payload),
        });

        // no-cors 모드에서는 응답 보디를 읽을 수 없으므로 성공으로 간주하고 진행
        if (type === 'analysis') onLog('구글 스프레드시트 요청 전송 완료');
        return true;
    } catch (err: any) {
        if (type === 'analysis') onLog(`구글 시트 저장 오류: ${err?.message ?? err}`);
        return false;
    }
};

// ─────────────────────────────────────────────
// 방법 2: CSV 다운로드 (fallback)
// ─────────────────────────────────────────────
export const downloadAsCsv = (rows: SheetRow[], onLog: (msg: string) => void) => {
    onLog('CSV 파일 생성 중...');
    const headers = Object.keys(rows[0] ?? {});
    const csvContent = [
        headers.join(','),
        ...rows.map((row) =>
            headers.map((h) => `"${String((row as any)[h]).replace(/"/g, '""')}"`).join(',')
        ),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blog_analysis_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onLog('CSV 파일 다운로드 완료!');
};

// ─────────────────────────────────────────────
// 로컬 스토리지 저장/불러오기
// ─────────────────────────────────────────────
const STORAGE_KEY = 'blog_analysis_results';

export interface StoredAnalysis {
    title: string;
    blogId: string;
    timestamp: string;
    result: AnalysisFinalResult;
    row: SheetRow;
}

export const saveResultToLocal = (entry: StoredAnalysis, onLog: (msg: string) => void) => {
    try {
        const existing = loadResultsFromLocal();
        existing.push(entry);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
        onLog(`분석 결과 로컬 저장 완료 (누적 ${existing.length}건)`);
    } catch (err: any) {
        onLog(`로컬 저장 오류: ${err?.message ?? err}`);
    }
};

export const loadResultsFromLocal = (): StoredAnalysis[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
};

export const clearLocalResults = () => {
    localStorage.removeItem(STORAGE_KEY);
};
