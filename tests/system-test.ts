#!/usr/bin/env tsx

/**
 * 系统端到端测试脚本
 * 验证API集成和工作流程
 */

import { apiClient } from '../src/lib/api-client';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

class SystemTester {
  private results: TestResult[] = [];

  async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    console.log(`🧪 运行测试: ${name}`);
    
    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.push({ name, passed: true, duration });
      console.log(`✅ ${name} - 通过 (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.results.push({ name, passed: false, error: errorMessage, duration });
      console.log(`❌ ${name} - 失败: ${errorMessage} (${duration}ms)`);
    }
  }

  async testTaskAPI(): Promise<void> {
    // 测试获取任务列表
    const tasksResponse = await apiClient.getTasks({ limit: 10 });
    if (tasksResponse.error) {
      throw new Error(`获取任务列表失败: ${tasksResponse.error}`);
    }
    
    if (!tasksResponse.data) {
      throw new Error('任务列表响应数据为空');
    }

    console.log(`📋 获取到 ${tasksResponse.data.tasks.length} 个任务`);
  }

  async testModelAPI(): Promise<void> {
    // 测试获取模型列表
    const modelsResponse = await apiClient.getModels();
    if (modelsResponse.error) {
      throw new Error(`获取模型列表失败: ${modelsResponse.error}`);
    }

    if (!modelsResponse.data) {
      throw new Error('模型列表响应数据为空');
    }

    console.log(`🤖 获取到 ${modelsResponse.data.models.length} 个模型`);
  }

  async testTemplateAPI(): Promise<void> {
    // 测试获取模板列表
    const templatesResponse = await apiClient.getTemplates();
    if (templatesResponse.error) {
      throw new Error(`获取模板列表失败: ${templatesResponse.error}`);
    }

    if (!templatesResponse.data) {
      throw new Error('模板列表响应数据为空');
    }

    console.log(`📋 获取到 ${templatesResponse.data.templates.length} 个模板`);
  }

  async testTestCaseAPI(): Promise<void> {
    // 测试获取测试用例列表
    const testCaseSetsResponse = await apiClient.getTestCaseSets();
    if (testCaseSetsResponse.error) {
      throw new Error(`获取测试用例失败: ${testCaseSetsResponse.error}`);
    }

    if (!testCaseSetsResponse.data) {
      throw new Error('测试用例响应数据为空');
    }

    console.log(`📝 获取到 ${testCaseSetsResponse.data.test_case_sets.length} 个测试用例集`);
  }

  async testCreateTask(): Promise<string> {
    // 首先获取必要的数据
    const [modelsResponse, templatesResponse, testCaseSetsResponse] = await Promise.all([
      apiClient.getModels(),
      apiClient.getTemplates(),
      apiClient.getTestCaseSets()
    ]);

    if (modelsResponse.error || !modelsResponse.data?.models.length) {
      throw new Error('无可用模型');
    }

    if (templatesResponse.error || !templatesResponse.data?.templates.length) {
      throw new Error('无可用模板');
    }

    if (testCaseSetsResponse.error || !testCaseSetsResponse.data?.test_case_sets.length) {
      throw new Error('无可用测试用例');
    }

    // 创建测试任务
    const createTaskRequest = {
      name: `系统测试任务 - ${new Date().toISOString()}`,
      description: '由系统测试脚本自动创建的任务',
      model_ids: [modelsResponse.data.models[0].id],
      template_id: templatesResponse.data.templates[0].id,
      test_case_ids: [testCaseSetsResponse.data.test_case_sets[0].id],
      config: {
        concurrent_limit: 2,
        timeout: 60,
        retry_count: 1
      }
    };

    const createResponse = await apiClient.createTask(createTaskRequest);
    if (createResponse.error) {
      throw new Error(`创建任务失败: ${createResponse.error}`);
    }

    if (!createResponse.data?.task) {
      throw new Error('任务创建响应数据为空');
    }

    const taskId = createResponse.data.task.id;
    console.log(`📝 成功创建任务: ${taskId}`);
    
    return taskId;
  }

  async testTaskDetail(taskId: string): Promise<void> {
    // 测试获取任务详情
    const taskResponse = await apiClient.getTask(taskId);
    if (taskResponse.error) {
      throw new Error(`获取任务详情失败: ${taskResponse.error}`);
    }

    if (!taskResponse.data?.task) {
      throw new Error('任务详情响应数据为空');
    }

    console.log(`📊 获取任务详情成功: ${taskResponse.data.task.name}`);
  }

  async testTaskControl(taskId: string): Promise<void> {
    // 测试任务控制功能
    const actions = ['pause', 'resume', 'cancel'] as const;
    
    for (const action of actions) {
      const controlResponse = await apiClient.controlTask(taskId, action);
      if (controlResponse.error) {
        throw new Error(`任务${action}操作失败: ${controlResponse.error}`);
      }
      
      console.log(`🎮 任务${action}操作成功`);
      
      // 短暂延迟
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  async testSystemMetrics(): Promise<void> {
    // 测试系统指标API
    const metricsResponse = await apiClient.getSystemMetrics();
    if (metricsResponse.error) {
      throw new Error(`获取系统指标失败: ${metricsResponse.error}`);
    }

    console.log(`📈 系统指标获取成功`);
  }

  printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试结果汇总');
    console.log('='.repeat(60));
    
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`总测试数: ${this.results.length}`);
    console.log(`通过: ${passed} ✅`);
    console.log(`失败: ${failed} ❌`);
    console.log(`总耗时: ${totalDuration}ms`);
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
      console.log('🎉 所有测试通过！系统运行正常。');
      process.exit(0);
    } else {
      console.log('⚠️  存在测试失败，请检查系统状态。');
      process.exit(1);
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 开始运行系统测试...\n');

    let createdTaskId: string | null = null;

    await this.runTest('API基础连通性测试', async () => {
      await this.testTaskAPI();
    });

    await this.runTest('模型API测试', async () => {
      await this.testModelAPI();
    });

    await this.runTest('模板API测试', async () => {
      await this.testTemplateAPI();
    });

    await this.runTest('测试用例API测试', async () => {
      await this.testTestCaseAPI();
    });

    await this.runTest('任务创建测试', async () => {
      createdTaskId = await this.testCreateTask();
    });

    if (createdTaskId) {
      await this.runTest('任务详情获取测试', async () => {
        await this.testTaskDetail(createdTaskId!);
      });

      await this.runTest('任务控制测试', async () => {
        await this.testTaskControl(createdTaskId!);
      });
    }

    await this.runTest('系统指标测试', async () => {
      await this.testSystemMetrics();
    });

    this.printSummary();
  }
}

// 运行测试
async function main() {
  const tester = new SystemTester();
  
  try {
    await tester.runAllTests();
  } catch (error) {
    console.error('🔥 测试运行失败:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}