import { useState, useEffect } from 'react';

export interface Config {
    naverSearch: {
        clientId: string;
        clientSecret: string;
    };
    searchAds: {
        licenseKey: string;
        secretKey: string;
        customerId: string;
    };
    analysisDefaults: {
        blogId: string;
        count: number;
        offset: number;
    };
    googleAppsScriptUrl?: string;
}

export const useConfig = (onLog: (msg: string) => void) => {
    const [config, setConfig] = useState<Config | null>(null);

    useEffect(() => {
        const fetchConfig = async () => {
            // 1. 로컬 스토리지에서 먼저 확인 (설정 메뉴에서 저장한 값)
            const localParams = localStorage.getItem('blog_analyzer_config');
            if (localParams) {
                try {
                    setConfig(JSON.parse(localParams));
                    onLog('브라우저에 저장된 설정을 불러왔습니다.');
                    return;
                } catch (e) {
                    // JSON 파싱 실패 시 무시
                }
            }

            // 2. 설정 파일 로드
            try {
                const response = await fetch('/config_blog_analyzer.json');
                if (response.ok) {
                    const data = await response.json();
                    setConfig(data);
                    onLog('설정 파일(config)을 불러왔습니다.');
                } else {
                    onLog('기본 설정을 사용합니다.');
                }
            } catch (error) {
                onLog('설정을 불러오는 중 오류가 발생했습니다.');
            }
        };
        fetchConfig();
    }, []);

    const saveConfig = async (newConfig: Config) => {
        setConfig(newConfig);
        // 실제 서버가 있다면 여기서 POST 요청을 보냄
        // 브라우저 환경에서는 localStorage에도 동시 저장
        localStorage.setItem('blog_analyzer_config', JSON.stringify(newConfig));
        onLog('API 설정이 로컬 스토리지에 저장되었습니다.');
    };

    return { config, setConfig, saveConfig };
};
