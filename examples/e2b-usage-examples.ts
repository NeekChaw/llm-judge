/**
 * E2B代码沙盒使用示例
 * 展示如何使用E2B集成功能进行代码评测
 */

import { sandboxManager, codeExecutor, codeEvaluationIntegrator } from '@/lib/e2b';
import { logger } from '@/lib/monitoring';

/**
 * 示例1：基本代码执行
 */
export async function basicCodeExecutionExample() {
  console.log('🚀 示例1：基本代码执行');
  
  try {
    // 创建沙盒会话
    const sessionId = await sandboxManager.createSession({
      timeoutMs: 60000, // 1分钟超时
      metadata: { example: 'basic_execution' }
    });

    console.log(`✅ 沙盒会话创建成功: ${sessionId}`);

    // 执行Python代码
    const pythonCode = `
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

# 计算前10个斐波那契数
result = [fibonacci(i) for i in range(10)]
print("斐波那契数列:", result)
`;

    const result = await sandboxManager.executeCode(sessionId, {
      code: pythonCode,
      language: 'python'
    });

    console.log('📊 执行结果:');
    console.log(`  成功: ${result.success}`);
    console.log(`  执行时间: ${result.executionTime}ms`);
    console.log(`  输出: ${result.stdout}`);
    if (result.stderr) {
      console.log(`  错误: ${result.stderr}`);
    }

    // 销毁会话
    await sandboxManager.destroySession(sessionId);
    console.log('🗑️ 沙盒会话已销毁');

  } catch (error) {
    console.error('❌ 基本代码执行示例失败:', error);
  }
}

/**
 * 示例2：带测试用例的代码评估
 */
export async function codeEvaluationWithTestsExample() {
  console.log('\n🧪 示例2：带测试用例的代码评估');
  
  try {
    const codeToEvaluate = `
def add_numbers(a, b):
    """计算两个数的和"""
    return a + b

def multiply_numbers(a, b):
    """计算两个数的乘积"""
    return a * b
`;

    const evaluationRequest = {
      code: codeToEvaluate,
      language: 'python' as const,
      testCases: [
        {
          name: '加法测试1',
          input: { a: 5, b: 3 },
          expectedOutput: 8
        },
        {
          name: '加法测试2',
          input: { a: 0, b: 0 },
          expectedOutput: 0
        },
        {
          name: '乘法测试',
          input: { a: 4, b: 6 },
          expectedOutput: 24
        }
      ],
      setupCode: `
# 测试辅助函数
def test_function(func_name, a, b, expected):
    if func_name == 'add':
        result = add_numbers(a, b)
    elif func_name == 'multiply':
        result = multiply_numbers(a, b)
    else:
        return False
    return result == expected
`,
      context: {
        taskId: 'example_task_1',
        metadata: { example: 'code_evaluation' }
      }
    };

    const result = await codeExecutor.executeAndEvaluate(evaluationRequest);

    console.log('📊 评估结果:');
    console.log(`  成功: ${result.success}`);
    console.log(`  评分: ${result.score}/100`);
    console.log(`  总执行时间: ${result.metrics.totalExecutionTime}ms`);
    console.log(`  测试通过: ${result.metrics.testsPassed}/${result.metrics.testsTotal}`);
    console.log(`  反馈: ${result.feedback}`);

    if (result.testResults) {
      console.log('🧪 测试用例详情:');
      result.testResults.forEach((test, index) => {
        console.log(`  ${index + 1}. ${test.testCase.name}: ${test.passed ? '✅ 通过' : '❌ 失败'}`);
        if (!test.passed && test.error) {
          console.log(`     错误: ${test.error}`);
        }
      });
    }

  } catch (error) {
    console.error('❌ 代码评估示例失败:', error);
  }
}

/**
 * 示例3：完整的评测任务
 */
export async function fullEvaluationTaskExample() {
  console.log('\n🎯 示例3：完整的评测任务');
  
  try {
    // 模拟LLM生成的代码响应
    const llmResponse = `
这是一个计算阶乘的Python函数：

\`\`\`python
def factorial(n):
    """计算n的阶乘"""
    if n < 0:
        raise ValueError("阶乘不能计算负数")
    if n == 0 or n == 1:
        return 1
    
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result

# 测试函数
print("5的阶乘:", factorial(5))
print("0的阶乘:", factorial(0))
\`\`\`

这个函数使用迭代方法计算阶乘，比递归方法更高效。
`;

    const evaluationTask = {
      taskId: 'example_task_2',
      subtaskId: 'example_subtask_1',
      modelResponse: llmResponse,
      dimensions: [
        {
          id: 'correctness',
          name: '代码正确性',
          description: '测试代码是否能正确计算阶乘',
          language: 'python' as const,
          testCases: [
            {
              name: '基本测试',
              input: 5,
              expectedOutput: 120
            },
            {
              name: '边界测试1',
              input: 0,
              expectedOutput: 1
            },
            {
              name: '边界测试2',
              input: 1,
              expectedOutput: 1
            },
            {
              name: '较大数测试',
              input: 6,
              expectedOutput: 720
            }
          ],
          weight: 0.6
        },
        {
          id: 'performance',
          name: '代码性能',
          description: '测试代码的执行效率',
          language: 'python' as const,
          testCases: [
            {
              name: '性能测试',
              input: 10,
              timeout: 1000 // 1秒超时
            }
          ],
          weight: 0.4
        }
      ],
      context: {
        metadata: { example: 'full_evaluation' }
      }
    };

    const result = await codeEvaluationIntegrator.evaluateCodeTask(evaluationTask);

    console.log('📊 完整评测结果:');
    console.log(`  任务ID: ${result.taskId}`);
    console.log(`  子任务ID: ${result.subtaskId}`);
    console.log(`  总体成功: ${result.success}`);
    console.log(`  总体评分: ${result.overallScore}/100`);
    console.log(`  总执行时间: ${result.totalExecutionTime}ms`);
    console.log(`  评估维度数: ${result.dimensionResults.length}`);

    console.log('\n📋 维度评估详情:');
    result.dimensionResults.forEach((dimResult, index) => {
      console.log(`  ${index + 1}. ${dimResult.dimension.name}:`);
      console.log(`     评分: ${dimResult.score}/100 (权重: ${dimResult.weight})`);
      console.log(`     成功: ${dimResult.result.success}`);
      console.log(`     执行时间: ${dimResult.result.metrics.totalExecutionTime}ms`);
      if (dimResult.result.metrics.testsTotal > 0) {
        console.log(`     测试通过: ${dimResult.result.metrics.testsPassed}/${dimResult.result.metrics.testsTotal}`);
      }
    });

    console.log('\n💬 综合反馈:');
    console.log(result.feedback);

  } catch (error) {
    console.error('❌ 完整评测任务示例失败:', error);
  }
}

/**
 * 示例4：错误处理和边界情况
 */
export async function errorHandlingExample() {
  console.log('\n⚠️ 示例4：错误处理和边界情况');
  
  try {
    // 测试语法错误的代码
    const buggyCode = `
def broken_function():
    print("这是一个有语法错误的函数"
    # 缺少右括号
    return "broken"

result = broken_function()
`;

    const result = await codeExecutor.executeAndEvaluate({
      code: buggyCode,
      language: 'python',
      testCases: [
        {
          name: '基本测试',
          expectedOutput: 'broken'
        }
      ],
      context: {
        taskId: 'error_test',
        metadata: { example: 'error_handling' }
      }
    });

    console.log('📊 错误代码执行结果:');
    console.log(`  成功: ${result.success}`);
    console.log(`  评分: ${result.score}/100`);
    console.log(`  错误信息: ${result.executionResult.stderr}`);
    console.log(`  反馈: ${result.feedback}`);

    // 测试超时情况
    const infiniteLoopCode = `
while True:
    pass  # 无限循环
`;

    console.log('\n⏰ 测试超时处理...');
    const timeoutResult = await sandboxManager.executeCode(
      await sandboxManager.createSession({ timeoutMs: 5000 }),
      {
        code: infiniteLoopCode,
        language: 'python',
        timeout: 2000 // 2秒超时
      }
    );

    console.log('📊 超时测试结果:');
    console.log(`  成功: ${timeoutResult.success}`);
    console.log(`  执行时间: ${timeoutResult.executionTime}ms`);
    console.log(`  错误: ${timeoutResult.error}`);

  } catch (error) {
    console.error('❌ 错误处理示例失败:', error);
  }
}

/**
 * 示例5：多语言支持
 */
export async function multiLanguageExample() {
  console.log('\n🌐 示例5：多语言支持');
  
  try {
    // JavaScript示例
    const jsCode = `
function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log("JavaScript斐波那契数列:");
for (let i = 0; i < 10; i++) {
    console.log(\`F(\${i}) = \${fibonacci(i)}\`);
}
`;

    const sessionId = await sandboxManager.createSession();
    
    const jsResult = await sandboxManager.executeCode(sessionId, {
      code: jsCode,
      language: 'javascript'
    });

    console.log('📊 JavaScript执行结果:');
    console.log(`  成功: ${jsResult.success}`);
    console.log(`  执行时间: ${jsResult.executionTime}ms`);
    console.log(`  输出长度: ${jsResult.stdout.length} 字符`);

    await sandboxManager.destroySession(sessionId);

  } catch (error) {
    console.error('❌ 多语言示例失败:', error);
  }
}

/**
 * 运行所有示例
 */
export async function runAllExamples() {
  console.log('🎬 开始运行E2B使用示例...\n');
  
  try {
    await basicCodeExecutionExample();
    await codeEvaluationWithTestsExample();
    await fullEvaluationTaskExample();
    await errorHandlingExample();
    await multiLanguageExample();
    
    console.log('\n🎉 所有示例运行完成！');
    
    // 显示统计信息
    const stats = sandboxManager.getStats();
    console.log('\n📊 沙盒管理器统计:');
    console.log(`  活跃会话: ${stats.totalSessions}`);
    console.log(`  总执行次数: ${stats.totalExecutions}`);
    
  } catch (error) {
    console.error('❌ 运行示例时出错:', error);
  } finally {
    // 清理所有会话
    await sandboxManager.destroyAll();
    console.log('🧹 已清理所有沙盒会话');
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runAllExamples().catch(console.error);
}
