import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 네이버 검색 API (블로그 검색, 순위 조회)
      '/naver-search': {
        target: 'https://openapi.naver.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/naver-search/, ''),
      },
      // 네이버 검색광고 API (검색량 조회)
      '/naver-ads': {
        target: 'https://api.naver.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/naver-ads/, ''),
      },
      // 네이버 블로그 페이지 프록시 (CORS 우회)
      '/naver-blog': {
        target: 'https://blog.naver.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/naver-blog/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://blog.naver.com/',
          'Origin': 'https://blog.naver.com',
        },
      },
      // 네이버 블로그 RSS 피드 프록시
      '/naver-rss': {
        target: 'https://rss.blog.naver.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/naver-rss/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
      },
      // 네이버 블로그 PostList 프록시
      '/naver-postlist': {
        target: 'https://blog.naver.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/naver-postlist/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://blog.naver.com/',
        },
      },
    },
  },
})
