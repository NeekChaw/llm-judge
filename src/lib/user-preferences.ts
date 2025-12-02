/**
 * 用户偏好设置管理
 * 使用localStorage存储用户偏好
 */

export type Currency = 'USD' | 'CNY';

export interface UserPreferences {
  currency: Currency;
}

const PREFERENCES_KEY = 'ai_benchmark_user_preferences';

const defaultPreferences: UserPreferences = {
  currency: 'CNY' // 默认使用人民币
};

/**
 * 获取用户偏好设置
 */
export function getUserPreferences(): UserPreferences {
  if (typeof window === 'undefined') {
    return defaultPreferences;
  }

  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...defaultPreferences,
        ...parsed
      };
    }
  } catch (error) {
    console.warn('读取用户偏好设置失败:', error);
  }

  return defaultPreferences;
}

/**
 * 保存用户偏好设置
 */
export function saveUserPreferences(preferences: Partial<UserPreferences>): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const current = getUserPreferences();
    const updated = {
      ...current,
      ...preferences
    };
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn('保存用户偏好设置失败:', error);
  }
}

/**
 * 获取用户偏好的货币单位
 */
export function getPreferredCurrency(): Currency {
  return getUserPreferences().currency;
}

/**
 * 设置用户偏好的货币单位
 */
export function setPreferredCurrency(currency: Currency): void {
  saveUserPreferences({ currency });
}

/**
 * React Hook: 使用用户偏好设置
 */
import { useState, useEffect } from 'react';

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);

  useEffect(() => {
    setPreferences(getUserPreferences());
  }, []);

  const updatePreferences = (newPreferences: Partial<UserPreferences>) => {
    const updated = {
      ...preferences,
      ...newPreferences
    };
    setPreferences(updated);
    saveUserPreferences(newPreferences);
  };

  return {
    preferences,
    updatePreferences,
    currency: preferences.currency,
    setCurrency: (currency: Currency) => updatePreferences({ currency })
  };
}