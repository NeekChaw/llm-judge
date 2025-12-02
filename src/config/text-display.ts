/**
 * 全局文本显示配置管理
 * 统一管理应用中所有文本展示的截断、滚动和显示参数
 */

// 内容类型枚举
export enum ContentType {
  TEST_CASE_INPUT = 'test_case_input',
  MODEL_RESPONSE = 'model_response', 
  EVALUATION_REASONING = 'evaluation_reasoning',
  REFERENCE_ANSWER = 'reference_answer',
  ERROR_MESSAGE = 'error_message',
  TASK_DESCRIPTION = 'task_description',
  GENERAL_TEXT = 'general_text'
}

// 文本显示配置接口
export interface TextDisplayConfig {
  maxLines: number;        // 默认截断行数
  maxHeight: number;       // 展开时最大高度 (px)
  estimatedLength: number; // 估计长文本阈值
  style: 'default' | 'input' | 'response' | 'reasoning' | 'reference';
}

// 预设配置
export const TEXT_DISPLAY_PRESETS: Record<ContentType, TextDisplayConfig> = {
  [ContentType.TEST_CASE_INPUT]: {
    maxLines: 4,
    maxHeight: 300,
    estimatedLength: 400,
    style: 'input'
  },
  [ContentType.MODEL_RESPONSE]: {
    maxLines: 5,
    maxHeight: 500,
    estimatedLength: 600,
    style: 'response'
  },
  [ContentType.EVALUATION_REASONING]: {
    maxLines: 4,
    maxHeight: 350,
    estimatedLength: 500,
    style: 'reasoning'
  },
  [ContentType.REFERENCE_ANSWER]: {
    maxLines: 4,
    maxHeight: 300,
    estimatedLength: 400,
    style: 'reference'
  },
  [ContentType.ERROR_MESSAGE]: {
    maxLines: 3,
    maxHeight: 200,
    estimatedLength: 300,
    style: 'default'
  },
  [ContentType.TASK_DESCRIPTION]: {
    maxLines: 3,
    maxHeight: 250,
    estimatedLength: 350,
    style: 'default'
  },
  [ContentType.GENERAL_TEXT]: {
    maxLines: 3,
    maxHeight: 400,
    estimatedLength: 300,
    style: 'default'
  }
};

// 系统级配置选项
export interface SystemTextConfig {
  enableScrollbars: boolean;
  showCharacterCount: boolean;
  showTokenEstimate: boolean;
  enableDynamicHeight: boolean;
  maxAbsoluteHeight: number;
}

// 系统默认配置
export const DEFAULT_SYSTEM_CONFIG: SystemTextConfig = {
  enableScrollbars: true,
  showCharacterCount: true,
  showTokenEstimate: true,
  enableDynamicHeight: true,
  maxAbsoluteHeight: 800
};

/**
 * 文本显示配置管理器
 */
class TextDisplayManager {
  private customConfigs: Map<ContentType, Partial<TextDisplayConfig>> = new Map();
  private systemConfig: SystemTextConfig = { ...DEFAULT_SYSTEM_CONFIG };

  /**
   * 获取指定内容类型的配置
   */
  getConfig(contentType: ContentType): TextDisplayConfig {
    const preset = TEXT_DISPLAY_PRESETS[contentType];
    const customOverrides = this.customConfigs.get(contentType) || {};
    
    return {
      ...preset,
      ...customOverrides,
      // 应用系统级约束
      maxHeight: Math.min(
        customOverrides.maxHeight || preset.maxHeight,
        this.systemConfig.maxAbsoluteHeight
      )
    };
  }

  /**
   * 设置自定义配置
   */
  setConfig(contentType: ContentType, config: Partial<TextDisplayConfig>): void {
    this.customConfigs.set(contentType, {
      ...this.customConfigs.get(contentType),
      ...config
    });
  }

  /**
   * 批量设置配置
   */
  setBatchConfig(configs: Record<ContentType, Partial<TextDisplayConfig>>): void {
    Object.entries(configs).forEach(([type, config]) => {
      this.setConfig(type as ContentType, config);
    });
  }

  /**
   * 重置配置为默认值
   */
  resetConfig(contentType?: ContentType): void {
    if (contentType) {
      this.customConfigs.delete(contentType);
    } else {
      this.customConfigs.clear();
    }
  }

  /**
   * 获取系统配置
   */
  getSystemConfig(): SystemTextConfig {
    return { ...this.systemConfig };
  }

  /**
   * 更新系统配置
   */
  updateSystemConfig(config: Partial<SystemTextConfig>): void {
    this.systemConfig = { ...this.systemConfig, ...config };
  }

  /**
   * 获取所有配置（用于导出/备份）
   */
  exportConfigs() {
    return {
      customConfigs: Object.fromEntries(this.customConfigs),
      systemConfig: this.systemConfig,
      presets: TEXT_DISPLAY_PRESETS
    };
  }

  /**
   * 导入配置
   */
  importConfigs(configs: {
    customConfigs?: Record<string, Partial<TextDisplayConfig>>;
    systemConfig?: Partial<SystemTextConfig>;
  }): void {
    if (configs.customConfigs) {
      this.customConfigs.clear();
      Object.entries(configs.customConfigs).forEach(([type, config]) => {
        this.setConfig(type as ContentType, config);
      });
    }

    if (configs.systemConfig) {
      this.updateSystemConfig(configs.systemConfig);
    }
  }

  /**
   * 验证配置有效性
   */
  validateConfig(config: Partial<TextDisplayConfig>): string[] {
    const errors: string[] = [];

    if (config.maxLines && (config.maxLines < 1 || config.maxLines > 20)) {
      errors.push('maxLines 必须在 1-20 之间');
    }

    if (config.maxHeight && (config.maxHeight < 100 || config.maxHeight > 2000)) {
      errors.push('maxHeight 必须在 100-2000px 之间');
    }

    if (config.estimatedLength && config.estimatedLength < 0) {
      errors.push('estimatedLength 不能为负数');
    }

    return errors;
  }
}

// 创建全局实例
export const textDisplayManager = new TextDisplayManager();

// 便捷函数
export const getTextDisplayConfig = (contentType: ContentType): TextDisplayConfig => {
  return textDisplayManager.getConfig(contentType);
};

export const setTextDisplayConfig = (
  contentType: ContentType, 
  config: Partial<TextDisplayConfig>
): void => {
  textDisplayManager.setConfig(contentType, config);
};

// React Hook (用于在组件中响应式使用配置)
import { useState, useEffect } from 'react';

export const useTextDisplayConfig = (contentType: ContentType) => {
  const [config, setConfig] = useState(() => textDisplayManager.getConfig(contentType));
  const [systemConfig, setSystemConfig] = useState(() => textDisplayManager.getSystemConfig());

  // 监听配置变化的简单实现（可以用事件发射器增强）
  useEffect(() => {
    const updateConfig = () => {
      setConfig(textDisplayManager.getConfig(contentType));
      setSystemConfig(textDisplayManager.getSystemConfig());
    };

    // 定期检查配置更新（生产环境中应使用事件监听）
    const interval = setInterval(updateConfig, 1000);
    return () => clearInterval(interval);
  }, [contentType]);

  return {
    config,
    systemConfig,
    updateConfig: (newConfig: Partial<TextDisplayConfig>) => {
      textDisplayManager.setConfig(contentType, newConfig);
      setConfig(textDisplayManager.getConfig(contentType));
    },
    resetConfig: () => {
      textDisplayManager.resetConfig(contentType);
      setConfig(textDisplayManager.getConfig(contentType));
    }
  };
};

// 预设模式
export const TEXT_DISPLAY_MODES = {
  COMPACT: 'compact',    // 紧凑模式：较小的高度限制
  NORMAL: 'normal',      // 正常模式：默认设置
  SPACIOUS: 'spacious'   // 宽松模式：较大的高度限制
} as const;

export type TextDisplayMode = typeof TEXT_DISPLAY_MODES[keyof typeof TEXT_DISPLAY_MODES];

// 模式配置
export const MODE_MULTIPLIERS: Record<TextDisplayMode, { heightMultiplier: number; linesMultiplier: number }> = {
  [TEXT_DISPLAY_MODES.COMPACT]: { heightMultiplier: 0.7, linesMultiplier: 0.7 },
  [TEXT_DISPLAY_MODES.NORMAL]: { heightMultiplier: 1.0, linesMultiplier: 1.0 },
  [TEXT_DISPLAY_MODES.SPACIOUS]: { heightMultiplier: 1.5, linesMultiplier: 1.3 }
};

/**
 * 应用模式到配置
 */
export const applyModeToConfig = (
  config: TextDisplayConfig,
  mode: TextDisplayMode
): TextDisplayConfig => {
  const multipliers = MODE_MULTIPLIERS[mode];
  return {
    ...config,
    maxHeight: Math.round(config.maxHeight * multipliers.heightMultiplier),
    maxLines: Math.max(1, Math.round(config.maxLines * multipliers.linesMultiplier))
  };
};