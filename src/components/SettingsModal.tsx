import React, { useState, useEffect } from 'react';
import { X, Save, Key } from 'lucide-react';
import type { Config } from '../hooks/useConfig';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    config: Config | null;
    onSave: (newConfig: Config) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, config, onSave }) => {
    const [localConfig, setLocalConfig] = useState<Config | null>(null);

    useEffect(() => {
        if (isOpen && config) {
            setLocalConfig(JSON.parse(JSON.stringify(config)));
        }
    }, [isOpen, config]);

    if (!isOpen || !localConfig) return null;

    const handleChange = (section: keyof Config, key: string, value: any) => {
        setLocalConfig((prev) => {
            if (!prev) return null;
            if (section === 'googleAppsScriptUrl') {
                return { ...prev, googleAppsScriptUrl: value };
            }
            return {
                ...prev,
                [section]: {
                    ...(prev[section] as any),
                    [key]: value,
                },
            };
        });
    };

    const handleSave = () => {
        if (localConfig) {
            onSave(localConfig);
            onClose();
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h3><Key size={18} /> 설정 관리</h3>
                    <button className="close-btn" onClick={onClose}><X size={18} /></button>
                </div>

                <div className="modal-body">
                    <div className="setting-section">
                        <h4>구글 스프레드시트 연동</h4>
                        <div className="input-group">
                            <label>Google Apps Script URL (Web App)</label>
                            <input
                                type="text"
                                placeholder="https://script.google.com/macros/s/..."
                                value={localConfig.googleAppsScriptUrl || ''}
                                onChange={(e) => handleChange('googleAppsScriptUrl', '', e.target.value)}
                            />
                            <p className="help-text">
                                * 배포 시 'Anyone' 권한으로 'Web App'을 생성한 후 URL을 입력하세요.
                            </p>
                        </div>
                    </div>

                    <div className="setting-section">
                        <h4>네이버 검색 API (검색 및 순위)</h4>
                        <div className="input-group">
                            <label>Client ID</label>
                            <input
                                type="text"
                                value={localConfig.naverSearch.clientId}
                                onChange={(e) => handleChange('naverSearch', 'clientId', e.target.value)}
                            />
                        </div>
                        <div className="input-group">
                            <label>Client Secret</label>
                            <input
                                type="password"
                                value={localConfig.naverSearch.clientSecret}
                                onChange={(e) => handleChange('naverSearch', 'clientSecret', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="setting-section">
                        <h4>네이버 검색광고 API (검색량)</h4>
                        <div className="input-group">
                            <label>License Key</label>
                            <input
                                type="text"
                                value={localConfig.searchAds.licenseKey}
                                onChange={(e) => handleChange('searchAds', 'licenseKey', e.target.value)}
                            />
                        </div>
                        <div className="input-group">
                            <label>Secret Key</label>
                            <input
                                type="password"
                                value={localConfig.searchAds.secretKey}
                                onChange={(e) => handleChange('searchAds', 'secretKey', e.target.value)}
                            />
                        </div>
                        <div className="input-group">
                            <label>Customer ID</label>
                            <input
                                type="text"
                                value={localConfig.searchAds.customerId}
                                onChange={(e) => handleChange('searchAds', 'customerId', e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="save-btn" onClick={handleSave}>
                        <Save size={16} /> 저장하기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
