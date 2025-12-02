#!/usr/bin/env tsx

/**
 * API单元测试
 * 测试各个API端点的功能
 */

import fetch from 'node-fetch';

interface TestCase {
  name: string;
  method: string;
  path: string;
  body?: any;
  expectedStatus?: number;
  expectedFields?: string[];
}

class APITester {
  private baseUrl: string;
  private results: Array<{ name: string; passed: boolean; error?: string }> = [];

  constructor(baseUrl = 'http://localhost:3002') {
    this.baseUrl = baseUrl;
  }

  async request(method: string, path: string, body?: any): Promise<{ status: number; data: any }> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options as any); // Type assertion for node-fetch compatibility
      const data = await response.json();
      return { status: response.status, data };
    } catch (error) {
      throw new Error(`请求失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async runTest(testCase: TestCase): Promise<void> {
    console.log(`🧪 测试: ${testCase.name}`);
    
    try {
      const { status, data } = await this.request(testCase.method, testCase.path, testCase.body);
      
      // 检查状态码
      if (testCase.expectedStatus && status !== testCase.expectedStatus) {
        throw new Error(`期望状态码 ${testCase.expectedStatus}，实际 ${status}`);
      }

      // 检查必需字段
      if (testCase.expectedFields) {
        for (const field of testCase.expectedFields) {
          if (!(field in data)) {
            throw new Error(`响应缺少必需字段: ${field}`);
          }
        }
      }

      // 检查错误响应
      if (status >= 400 && !data.error) {
        throw new Error(`错误响应缺少 error 字段`);
      }

      this.results.push({ name: testCase.name, passed: true });
      console.log(`✅ ${testCase.name} - 通过`);
      
      // 显示部分响应数据
      if (status < 400) {
        const preview = JSON.stringify(data, null, 2).substring(0, 200);
        console.log(`   响应预览: ${preview}${preview.length >= 200 ? '...' : ''}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.results.push({ name: testCase.name, passed: false, error: errorMessage });
      console.log(`❌ ${testCase.name} - 失败: ${errorMessage}`);
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 开始运行API测试...\n');

    const testCases: TestCase[] = [
      // 任务相关API
      {
        name: '获取任务列表',
        method: 'GET',
        path: '/api/tasks',
        expectedStatus: 200,
        expectedFields: ['tasks', 'pagination']
      },
      {
        name: '获取任务列表 - 带分页参数',
        method: 'GET',
        path: '/api/tasks?page=1&limit=5',
        expectedStatus: 200,
        expectedFields: ['tasks', 'pagination']
      },
      {
        name: '获取任务列表 - 带状态筛选',
        method: 'GET',
        path: '/api/tasks?status=running',
        expectedStatus: 200,
        expectedFields: ['tasks', 'pagination']
      },
      {
        name: '创建任务 - 缺少必填字段',
        method: 'POST',
        path: '/api/tasks',
        body: {
          name: ''
        },
        expectedStatus: 400,
        expectedFields: ['error']
      },
      {
        name: '创建任务 - 有效数据',
        method: 'POST',
        path: '/api/tasks',
        body: {
          name: 'API测试任务',
          template_id: 'template-1',
          test_case_ids: ['tc-1'],
          model_ids: ['model-1'],
          config: {
            concurrent_limit: 3,
            timeout: 300,
            retry_count: 2
          }
        },
        expectedStatus: 201,
        expectedFields: ['task', 'message']
      },
      {
        name: '获取任务详情 - 存在的任务',
        method: 'GET',
        path: '/api/tasks/task-1',
        expectedStatus: 200,
        expectedFields: ['task']
      },
      {
        name: '任务控制 - 暂停',
        method: 'POST',
        path: '/api/tasks/task-1/control',
        body: { action: 'pause' },
        expectedStatus: 200,
        expectedFields: ['message']
      },
      {
        name: '任务控制 - 无效操作',
        method: 'POST',
        path: '/api/tasks/task-1/control',
        body: { action: 'invalid' },
        expectedStatus: 400,
        expectedFields: ['error']
      },

      // 模型相关API
      {
        name: '获取模型列表',
        method: 'GET',
        path: '/api/models',
        expectedStatus: 200,
        expectedFields: ['models']
      },

      // 模板相关API
      {
        name: '获取模板列表',
        method: 'GET',
        path: '/api/templates',
        expectedStatus: 200,
        expectedFields: ['templates']
      },

      // 测试用例相关API
      {
        name: '获取测试用例列表',
        method: 'GET',
        path: '/api/test-cases',
        expectedStatus: 200,
        expectedFields: ['test_cases']
      },

      // 系统指标API
      {
        name: '获取系统指标',
        method: 'GET',
        path: '/api/tasks/metrics',
        expectedStatus: 200,
        expectedFields: ['metrics']
      },

      // 实时进度API
      {
        name: '获取任务进度',
        method: 'GET',
        path: '/api/tasks/realtime/progress',
        expectedStatus: 200,
        expectedFields: ['active_tasks']
      },
      {
        name: '获取特定任务进度',
        method: 'GET',
        path: '/api/tasks/realtime/progress?task_id=task-1',
        expectedStatus: 200,
        expectedFields: ['task_progress']
      }
    ];

    for (const testCase of testCases) {
      await this.runTest(testCase);
      // 短暂延迟避免请求过快
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.printSummary();
  }

  printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 API测试结果汇总');
    console.log('='.repeat(60));
    
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;

    console.log(`总测试数: ${this.results.length}`);
    console.log(`通过: ${passed} ✅`);
    console.log(`失败: ${failed} ❌`);
    console.log(`成功率: ${((passed / this.results.length) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log('\n❌ 失败的测试:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - ${r.name}: ${r.error}`);
        });
    }

    console.log('\n' + '='.repeat(60));
    
    if (failed === 0) {
      console.log('🎉 所有API测试通过！');
    } else {
      console.log('⚠️  存在API测试失败，请检查服务器状态。');
    }
  }
}

// 运行测试
async function main() {
  const tester = new APITester();
  
  try {
    await tester.runAllTests();
  } catch (error) {
    console.error('🔥 API测试运行失败:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}