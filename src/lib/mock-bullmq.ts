/**
 * Mock BullMQ Implementation for Development
 * 用于开发环境的BullMQ模拟实现
 */

export interface MockJobData {
  id: string;
  data: any;
  opts?: any;
  name?: string;
}

export interface MockJobResult {
  id: string;
  returnvalue?: any;
  failed?: boolean;
  error?: any;
}

// Mock Queue
export class MockQueue {
  private name: string;
  private jobs = new Map<string, MockJobData>();
  private processors = new Map<string, Function>();
  private jobIdCounter = 1;
  private eventHandlers = new Map<string, Function[]>();

  constructor(name: string, connection: any) {
    this.name = name;
  }

  async add(name: string, data: any, opts?: any): Promise<MockJobData> {
    const job: MockJobData = {
      id: `${this.jobIdCounter++}`,
      data,
      opts,
      name
    };
    
    this.jobs.set(job.id, job);
    
    // 模拟异步执行
    if (this.processors.has(name)) {
      const processor = this.processors.get(name)!;
      setTimeout(async () => {
        try {
          await processor(job);
        } catch (error) {
          console.error(`Mock job ${job.id} failed:`, error);
        }
      }, 100);
    }

    return job;
  }

  process(name: string, processor: Function): void {
    this.processors.set(name, processor);
  }

  // 添加事件监听方法
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  emit(event: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(...args);
      } catch (error) {
        console.error(`Mock queue event handler error:`, error);
      }
    });
  }

  async getWaiting(): Promise<MockJobData[]> {
    return Array.from(this.jobs.values());
  }

  async getActive(): Promise<MockJobData[]> {
    return [];
  }

  async getCompleted(): Promise<MockJobData[]> {
    return [];
  }

  async getFailed(): Promise<MockJobData[]> {
    return [];
  }

  async getRepeatableJobs(): Promise<any[]> {
    return [];
  }

  async close(): Promise<void> {
    this.jobs.clear();
    this.processors.clear();
    this.eventHandlers.clear();
  }

  async pause(): Promise<void> {
    // Mock pause
  }

  async resume(): Promise<void> {
    // Mock resume
  }

  async empty(): Promise<void> {
    this.jobs.clear();
  }

  async clean(grace: number, status: string): Promise<string[]> {
    return [];
  }
}

// Mock Worker
export class MockWorker {
  private name: string;
  private processor: Function;
  private isRunning = true;

  constructor(queueName: string, processor: Function, connection: any) {
    this.name = queueName;
    this.processor = processor;
  }

  async run(): Promise<void> {
    // Mock worker run
  }

  async close(): Promise<void> {
    this.isRunning = false;
  }

  on(event: string, handler: Function): void {
    // Mock event handlers
    if (event === 'ready') {
      setTimeout(() => handler(), 100);
    }
  }
}

// Mock QueueScheduler
export class MockQueueScheduler {
  constructor(queueName: string, connection: any) {
    // Mock implementation
  }

  async close(): Promise<void> {
    // Mock close
  }
}

export const isDevelopmentMode = process.env.NODE_ENV !== 'production' && process.env.FORCE_REDIS !== 'true';

// 导出适配器函数
export function createQueue(name: string, connection: any) {
  if (isDevelopmentMode) {
    console.log(`🧪 Creating Mock Queue: ${name}`);
    return new MockQueue(name, connection);
  } else {
    const { Queue } = require('bullmq');
    return new Queue(name, { connection });
  }
}

export function createWorker(queueName: string, processor: Function, connection: any) {
  if (isDevelopmentMode) {
    console.log(`🧪 Creating Mock Worker: ${queueName}`);
    return new MockWorker(queueName, processor, connection);
  } else {
    const { Worker } = require('bullmq');
    return new Worker(queueName, processor, { connection });
  }
}

export function createQueueScheduler(queueName: string, connection: any) {
  if (isDevelopmentMode) {
    console.log(`🧪 Creating Mock QueueScheduler: ${queueName}`);
    return new MockQueueScheduler(queueName, connection);
  } else {
    const { QueueScheduler } = require('bullmq');
    return new QueueScheduler(queueName, { connection });
  }
}