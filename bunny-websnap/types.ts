
export interface AnalysisResult {
  summary: string;
  colors: string[];
  layoutType: string;
  uiScore: number;
  uxSuggestions: string[];
  techStackGuess: string[];
}

export interface ScreenshotData {
  url: string;
  imageUrl: string;       // local object URL for display (the bytes we analysed)
  sourceUrl: string;      // remote screenshot URL, for "open original"
  engine: string;         // which screenshot provider succeeded
  timestamp: string;
  device: DeviceType;
  analysis?: AnalysisResult;
}

export type DeviceType = 'desktop';

export interface DeviceConfig {
  width: number;
  height: number;
  isMobile: boolean;
  label: string;
  icon: string;
}

export const DEVICE_CONFIGS: Record<DeviceType, DeviceConfig> = {
  desktop: { width: 1440, height: 900, isMobile: false, label: 'Desktop', icon: 'fa-desktop' },
};

export enum AppStatus {
  IDLE = 'IDLE',
  CAPTURING = 'CAPTURING',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
