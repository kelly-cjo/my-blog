import * as cheerio from 'cheerio';
import { extractHashtags } from './keywordAnalyzer';
import axios from 'axios';

export interface BlogContent {
    title: string;
    author: string;
    date: string;
    content: string;
    images: string[];
    hashtags: string[];
    url: string;
}

/**
 * 네이버 블로그 HTML을 파싱하여 제목, 작성자, 본문, 해시태그 등을 추출
 */
export const parseNaverBlog = (html: string, url?: string): BlogContent => {
    const $ = cheerio.load(html);

    const title = $('.se-title-text').text() || $('title').text();
    const author = $('.nick').text() || 'Unknown';
    const date = $('.se_publishDate').text() || 'Unknown';

    const content: string[] = [];
    $('.se-main-container .se-text-paragraph').each((_, el) => {
        content.push($(el).text().trim());
    });

    const images: string[] = [];
    $('.se-main-container img').each((_, el) => {
        const src = $(el).attr('src');
        if (src) images.push(src);
    });

    const fullContent = content.join('\n');

    const htmlHashtags: string[] = [];
    $('.se-hash-tag, .tag_item, a[class*="tag"]').each((_, el) => {
        const text = $(el).text().replace('#', '').trim();
        if (text) htmlHashtags.push(text);
    });
    const contentHashtags = extractHashtags(fullContent);
    const hashtags = [...new Set([...htmlHashtags, ...contentHashtags])];

    return {
        title,
        author,
        date,
        content: fullContent,
        images,
        hashtags,
        url: url ?? '',
    };
};

const formatAxiosError = (err: any): string => {
    if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const data = err.response?.data;
        const msg = err.message;

        if (msg === 'Network Error') {
            return `네트워크 에러: 서버에 연결할 수 없거나 CORS/리다이렉트 차단이 발생했습니다. Vite dev 서버가 실행 중인지 확인하세요.`;
        }

        if (status === 500) {
            return `서버 내부 오류(500): ${msg}. 프록시 설정이나 대상 서버 상태를 확인하세요. ${data ? JSON.stringify(data).substring(0, 100) : ''}`;
        }
        return `${msg}${status ? ` (HTTP ${status})` : ''}`;
    }
    return String(err);
};

/**
 * 네이버 블로그 URL에서 HTML을 가져와 파싱
 * 직접적인 PostView.naver 호출로 리다이렉트 방지 및 파싱 안정성 확보
 */
export const fetchAndParseBlog = async (
    blogUrl: string,
    onLog: (msg: string) => void,
): Promise<BlogContent> => {
    // 1. URL에서 블로그 ID와 글 번호 추출
    const blogIdMatch = blogUrl.match(/blog\.naver\.com\/([^/?#]+)\/(\d+)/) ||
        blogUrl.match(/([^/?#.]+)\.blog\.naver\.com\/(\d+)/);

    let proxyUrl = '';
    if (blogIdMatch) {
        const [, id, no] = blogIdMatch;
        // 직접적인 PostView 호출 (가장 안정적)
        proxyUrl = `/naver-blog/PostView.naver?blogId=${id}&logNo=${no}&redirect=Dlog&widgetTypeCall=true&directAccess=false`;
    } else {
        const path = blogUrl.replace(/^https?:\/\/blog\.naver\.com/, '');
        proxyUrl = `/naver-blog${path}`;
    }

    onLog(`블로그 데이터 로드 중...`);
    try {
        const response = await axios.get(proxyUrl, {
            timeout: 20000,
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        });

        // 데이터 유효성 체크
        if (!response.data || (typeof response.data === 'string' && response.data.length < 200)) {
            throw new Error('데이터를 가져오지 못했습니다. URL을 확인하거나 잠시 후 다시 시도해 주세요.');
        }

        const parsed = parseNaverBlog(response.data, blogUrl);

        // 파싱 보완
        if (!parsed.title || parsed.title === 'Unknown') {
            const $ = cheerio.load(response.data);
            parsed.title = $('.se-title-text').text() || $('.item_title').text() || $('title').text() || '제목 없음';
        }

        onLog(`블로그 파싱 완료: "${parsed.title}"`);
        return parsed;
    } catch (err: any) {
        throw new Error(formatAxiosError(err));
    }
};

// ─────────────────────────────────────────────
// 블로그 최근 글 목록 가져오기
// ─────────────────────────────────────────────
export interface BlogPostSummary {
    title: string;
    link: string;
    postNo: string;
}

/**
 * RSS 피드를 통해 최근 글 목록을 가져옴
 */
export const fetchRecentBlogPosts = async (
    blogId: string,
    count: number,
    onLog: (msg: string) => void,
): Promise<BlogPostSummary[]> => {
    onLog(`블로그 "${blogId}"의 최근 글 목록을 조회합니다...`);

    // ── 방법 1: RSS 피드 ──
    try {
        const rssProxyUrl = `/naver-rss/${blogId}.xml`;
        const response = await axios.get(rssProxyUrl, { timeout: 15000 });
        const $ = cheerio.load(response.data, { xmlMode: true });

        const posts: BlogPostSummary[] = [];
        $('item').each((i, el) => {
            if (i >= count) return false;
            const title = $(el).find('title').text().trim();
            let link = $(el).find('link').text().trim();

            if (!link) {
                const guid = $(el).find('guid').text().trim();
                if (guid) link = guid;
            }

            const postNoMatch = link.match(/\/(\d+)(\?|$)/) || link.match(/logNo=(\d+)/);
            const postNo = postNoMatch ? postNoMatch[1] : '';
            if (title && link) {
                posts.push({ title, link, postNo });
            }
        });

        if (posts.length > 0) {
            onLog(`RSS에서 ${posts.length}개의 글 목록을 확인했습니다.`);
            return posts;
        }
    } catch (err: any) {
        onLog(`RSS 조회 실패, 대체 방식 시도...`);
    }

    // ── 방법 2: PostList API ──
    return await fetchRecentPostsFallback(blogId, count, onLog);
};

/**
 * PostList API를 통한 대체 방법
 */
const fetchRecentPostsFallback = async (
    blogId: string,
    count: number,
    onLog: (msg: string) => void,
): Promise<BlogPostSummary[]> => {
    try {
        // 네이버 블로그 PostTitleListAsync (JSON API)
        const apiUrl = `/naver-postlist/PostTitleListAsync.naver?blogId=${blogId}&viewdate=&currentPage=1&categoryNo=0&parentCategoryNo=0&countPerPage=${count}`;
        const response = await axios.get(apiUrl, { timeout: 15000 });

        const posts: BlogPostSummary[] = [];

        // 응답이 JSON인 경우
        if (typeof response.data === 'object' && response.data.postList) {
            for (const item of response.data.postList.slice(0, count)) {
                posts.push({
                    title: item.title || `글 ${item.logNo}`,
                    link: `https://blog.naver.com/${blogId}/${item.logNo}`,
                    postNo: String(item.logNo),
                });
            }
        } else {
            // HTML 응답 파싱
            const html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            const $ = cheerio.load(html);

            // 다양한 셀렉터 시도
            $('a[href*="logNo="], a[href*="PostView"], .post-title a').each((_, el) => {
                if (posts.length >= count) return false;
                const href = $(el).attr('href') ?? '';
                const title = $(el).text().trim();
                const logNoMatch = href.match(/logNo=(\d+)/);
                if (logNoMatch && title && title.length > 2) {
                    const postNo = logNoMatch[1];
                    const link = `https://blog.naver.com/${blogId}/${postNo}`;
                    if (!posts.find(p => p.postNo === postNo)) {
                        posts.push({ title, link, postNo });
                    }
                }
            });
        }

        if (posts.length > 0) {
            onLog(`PostList에서 ${posts.length}개의 글을 찾았습니다.`);
        } else {
            onLog('글 목록을 가져올 수 없습니다. 블로그 ID를 확인해주세요.');
        }

        return posts;
    } catch (err: any) {
        onLog(`PostList 조회 실패: ${formatAxiosError(err)}`);
        return [];
    }
};
