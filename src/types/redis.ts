/**
 * Redis连接类型定义
 * 统一Redis和MockRedis的接口，解决BullMQ类型兼容问题
 */

import { Redis } from 'ioredis';

// BullMQ需要的Redis连接接口
export interface BullMQCompatibleConnection {
  ping(): Promise<string>;
  set(key: string, value: any): Promise<'OK'>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<number>;
  disconnect(): Promise<void>;
  quit(): Promise<void>;
  on(event: string, handler: Function): void;
  // BullMQ需要的其他方法
  duplicate?(): BullMQCompatibleConnection;
  status?: string;
  options?: any;
}

// Redis连接联合类型
export type RedisConnection = Redis | BullMQCompatibleConnection;

// 类型守卫函数
export function isRedisInstance(connection: RedisConnection): connection is Redis {
  return connection.constructor.name === 'Redis';
}

// MockRedis实现BullMQCompatibleConnection接口
export class MockRedis implements BullMQCompatibleConnection {
  private store = new Map<string, any>();
  
  async ping(): Promise<string> {
    return 'PONG';
  }

  async set(key: string, value: any): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    this.store.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }

  async disconnect(): Promise<void> {
    this.store.clear();
  }

  async quit(): Promise<void> {
    this.store.clear();
  }

  on(event: string, handler: Function): void {
    // Mock事件监听器
    if (event === 'connect') {
      setTimeout(() => handler(), 100);
    }
  }

  duplicate(): BullMQCompatibleConnection {
    return new MockRedis();
  }

  get status(): string {
    return 'ready';
  }

  get options(): any {
    return {};
  }
}