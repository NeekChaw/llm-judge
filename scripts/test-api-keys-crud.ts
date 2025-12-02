/**
 * API密钥管理 - CRUD功能测试脚本
 *
 * 测试内容：
 * 1. 创建API密钥（加密存储）
 * 2. 获取密钥列表（脱敏显示）
 * 3. 获取单个密钥详情
 * 4. 更新密钥信息
 * 5. 删除密钥
 * 6. 验证加密和哈希功能
 * 7. 测试重复密钥检测
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  message?: string;
  data?: any;
}

const results: TestResult[] = [];
let createdKeyId: string | null = null;

function log(emoji: string, ...args: any[]) {
  console.log(emoji, ...args);
}

function logResult(result: TestResult) {
  results.push(result);
  const emoji = result.status === 'PASS' ? '✅' : '❌';
  log(emoji, `${result.test}: ${result.status}`);
  if (result.message) {
    console.log('  ', result.message);
  }
  if (result.data) {
    console.log('  ', JSON.stringify(result.data, null, 2));
  }
  console.log('');
}

async function testCreateAPIKey() {
  log('🧪', '测试 1: 创建API密钥');

  try {
    const response = await fetch(`${API_BASE_URL}/api/api-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider_id: null,
        key_name: '测试密钥_' + Date.now(),
        key_value: 'sk-test-key-1234567890abcdefghijklmnopqrstuvwxyz',
        quota_limit: 1000,
        notes: '这是一个测试API密钥',
      }),
    });

    const data = await response.json();

    if (response.status === 201 && data.success && data.data.api_key) {
      createdKeyId = data.data.api_key.id;

      // 验证关键字段
      const checks = [
        { name: '返回ID', pass: !!data.data.api_key.id },
        { name: '返回明文密钥（仅一次）', pass: !!data.data.plaintext_key },
        { name: '脱敏显示正确', pass: data.data.api_key.key_value_masked?.includes('***') },
        { name: '状态默认active', pass: data.data.api_key.status === 'active' },
        { name: '配额已设置', pass: data.data.api_key.quota_limit === 1000 },
        { name: '使用次数为0', pass: data.data.api_key.usage_count === 0 },
      ];

      const allPassed = checks.every(c => c.pass);
      const failedChecks = checks.filter(c => !c.pass).map(c => c.name);

      if (allPassed) {
        logResult({
          test: '创建API密钥',
          status: 'PASS',
          message: `成功创建密钥 ID: ${createdKeyId}`,
          data: {
            id: data.data.api_key.id,
            key_name: data.data.api_key.key_name,
            key_value_masked: data.data.api_key.key_value_masked,
            plaintext_key_provided: !!data.data.plaintext_key,
          },
        });
      } else {
        logResult({
          test: '创建API密钥',
          status: 'FAIL',
          message: `验证失败: ${failedChecks.join(', ')}`,
        });
      }
    } else {
      logResult({
        test: '创建API密钥',
        status: 'FAIL',
        message: `响应错误: ${data.error || '未知错误'}`,
      });
    }
  } catch (error) {
    logResult({
      test: '创建API密钥',
      status: 'FAIL',
      message: `请求失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function testListAPIKeys() {
  log('🧪', '测试 2: 获取API密钥列表');

  try {
    const response = await fetch(`${API_BASE_URL}/api/api-keys`);
    const data = await response.json();

    if (response.ok && data.success && Array.isArray(data.data)) {
      const createdKey = data.data.find((k: any) => k.id === createdKeyId);

      if (createdKey) {
        // 验证脱敏处理
        const checks = [
          { name: '包含创建的密钥', pass: !!createdKey },
          { name: '密钥已脱敏', pass: createdKey.key_value_masked?.includes('***') },
          { name: '无加密字段泄露', pass: !createdKey.key_value_encrypted && !createdKey.key_hash },
          { name: '包含统计信息', pass: typeof createdKey.usage_count === 'number' },
        ];

        const allPassed = checks.every(c => c.pass);

        logResult({
          test: '获取API密钥列表',
          status: allPassed ? 'PASS' : 'FAIL',
          message: `找到 ${data.data.length} 个密钥，其中包含测试密钥`,
          data: {
            total: data.total,
            created_key_found: !!createdKey,
            masked_value: createdKey.key_value_masked,
          },
        });
      } else {
        logResult({
          test: '获取API密钥列表',
          status: 'FAIL',
          message: '列表中未找到刚创建的密钥',
        });
      }
    } else {
      logResult({
        test: '获取API密钥列表',
        status: 'FAIL',
        message: `响应错误: ${data.error || '未知错误'}`,
      });
    }
  } catch (error) {
    logResult({
      test: '获取API密钥列表',
      status: 'FAIL',
      message: `请求失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function testGetSingleAPIKey() {
  log('🧪', '测试 3: 获取单个API密钥详情');

  if (!createdKeyId) {
    logResult({
      test: '获取单个API密钥',
      status: 'FAIL',
      message: '没有可用的密钥ID（创建测试可能失败）',
    });
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/api-keys/${createdKeyId}`);
    const data = await response.json();

    if (response.ok && data.success && data.data) {
      const key = data.data;

      const checks = [
        { name: 'ID匹配', pass: key.id === createdKeyId },
        { name: '密钥已脱敏', pass: key.key_value_masked?.includes('***') },
        { name: '无敏感字段', pass: !key.key_value_encrypted && !key.key_hash },
        { name: '包含完整信息', pass: !!key.key_name && !!key.status },
      ];

      const allPassed = checks.every(c => c.pass);

      logResult({
        test: '获取单个API密钥',
        status: allPassed ? 'PASS' : 'FAIL',
        message: allPassed ? '成功获取密钥详情' : '字段验证失败',
        data: {
          id: key.id,
          key_name: key.key_name,
          key_value_masked: key.key_value_masked,
          status: key.status,
        },
      });
    } else {
      logResult({
        test: '获取单个API密钥',
        status: 'FAIL',
        message: `响应错误: ${data.error || '未知错误'}`,
      });
    }
  } catch (error) {
    logResult({
      test: '获取单个API密钥',
      status: 'FAIL',
      message: `请求失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function testUpdateAPIKey() {
  log('🧪', '测试 4: 更新API密钥');

  if (!createdKeyId) {
    logResult({
      test: '更新API密钥',
      status: 'FAIL',
      message: '没有可用的密钥ID（创建测试可能失败）',
    });
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/api-keys/${createdKeyId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quota_limit: 2000,
        notes: '更新后的测试备注',
        status: 'active',
      }),
    });

    const data = await response.json();

    if (response.ok && data.success && data.data) {
      const key = data.data;

      const checks = [
        { name: '配额已更新', pass: key.quota_limit === 2000 },
        { name: '备注已更新', pass: key.notes === '更新后的测试备注' },
        { name: 'ID保持不变', pass: key.id === createdKeyId },
      ];

      const allPassed = checks.every(c => c.pass);

      logResult({
        test: '更新API密钥',
        status: allPassed ? 'PASS' : 'FAIL',
        message: allPassed ? '成功更新密钥信息' : '更新验证失败',
        data: {
          quota_limit: key.quota_limit,
          notes: key.notes,
        },
      });
    } else {
      logResult({
        test: '更新API密钥',
        status: 'FAIL',
        message: `响应错误: ${data.error || '未知错误'}`,
      });
    }
  } catch (error) {
    logResult({
      test: '更新API密钥',
      status: 'FAIL',
      message: `请求失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function testDuplicateKeyDetection() {
  log('🧪', '测试 5: 重复密钥检测');

  try {
    const response = await fetch(`${API_BASE_URL}/api/api-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider_id: null,
        key_name: '重复测试密钥',
        key_value: 'sk-test-key-1234567890abcdefghijklmnopqrstuvwxyz', // 与第一个测试相同的密钥
        quota_limit: 500,
      }),
    });

    const data = await response.json();

    // 应该返回409冲突错误
    if (response.status === 409 && !data.success) {
      logResult({
        test: '重复密钥检测',
        status: 'PASS',
        message: '成功检测到重复密钥并阻止创建',
        data: {
          error_message: data.error,
        },
      });
    } else {
      logResult({
        test: '重复密钥检测',
        status: 'FAIL',
        message: '未能正确检测重复密钥（应返回409状态码）',
      });
    }
  } catch (error) {
    logResult({
      test: '重复密钥检测',
      status: 'FAIL',
      message: `请求失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function testDeleteAPIKey() {
  log('🧪', '测试 6: 删除API密钥');

  if (!createdKeyId) {
    logResult({
      test: '删除API密钥',
      status: 'FAIL',
      message: '没有可用的密钥ID（创建测试可能失败）',
    });
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/api-keys/${createdKeyId}`, {
      method: 'DELETE',
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // 验证是否真的删除了
      const verifyResponse = await fetch(`${API_BASE_URL}/api/api-keys/${createdKeyId}`);
      const verifyData = await verifyResponse.json();

      if (verifyResponse.status === 404) {
        logResult({
          test: '删除API密钥',
          status: 'PASS',
          message: '成功删除密钥并验证不存在',
          data: {
            deleted_id: createdKeyId,
          },
        });
      } else {
        logResult({
          test: '删除API密钥',
          status: 'FAIL',
          message: '删除请求成功但密钥仍然存在',
        });
      }
    } else {
      logResult({
        test: '删除API密钥',
        status: 'FAIL',
        message: `响应错误: ${data.error || '未知错误'}`,
      });
    }
  } catch (error) {
    logResult({
      test: '删除API密钥',
      status: 'FAIL',
      message: `请求失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function testFilterByStatus() {
  log('🧪', '测试 7: 按状态筛选密钥列表');

  try {
    // 先创建一个disabled状态的密钥
    const createResponse = await fetch(`${API_BASE_URL}/api/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key_name: '禁用测试密钥_' + Date.now(),
        key_value: 'sk-disabled-test-' + Math.random().toString(36).substring(7),
        quota_limit: 100,
      }),
    });
    const createData = await createResponse.json();

    if (!createData.success) {
      throw new Error('创建测试密钥失败');
    }

    const testKeyId = createData.data.api_key.id;

    // 更新为disabled状态
    await fetch(`${API_BASE_URL}/api/api-keys/${testKeyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'disabled' }),
    });

    // 测试筛选
    const filterResponse = await fetch(`${API_BASE_URL}/api/api-keys?status=disabled`);
    const filterData = await filterResponse.json();

    const foundDisabledKey = filterData.data?.find((k: any) => k.id === testKeyId);

    // 清理：删除测试密钥
    await fetch(`${API_BASE_URL}/api/api-keys/${testKeyId}`, { method: 'DELETE' });

    if (foundDisabledKey && foundDisabledKey.status === 'disabled') {
      logResult({
        test: '按状态筛选',
        status: 'PASS',
        message: '成功筛选出disabled状态的密钥',
        data: {
          filtered_count: filterData.data?.length || 0,
          test_key_found: true,
        },
      });
    } else {
      logResult({
        test: '按状态筛选',
        status: 'FAIL',
        message: '筛选功能未正确工作',
      });
    }
  } catch (error) {
    logResult({
      test: '按状态筛选',
      status: 'FAIL',
      message: `测试失败: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function runAllTests() {
  console.log('');
  log('🚀', '==========================================');
  log('🚀', '   API密钥管理系统 - CRUD功能测试');
  log('🚀', '==========================================');
  console.log('');

  // 按顺序执行测试
  await testCreateAPIKey();
  await testListAPIKeys();
  await testGetSingleAPIKey();
  await testUpdateAPIKey();
  await testDuplicateKeyDetection();
  await testDeleteAPIKey();
  await testFilterByStatus();

  // 输出测试摘要
  console.log('');
  log('📊', '==========================================');
  log('📊', '   测试摘要');
  log('📊', '==========================================');
  console.log('');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const total = results.length;

  log('📈', `总测试数: ${total}`);
  log('✅', `通过: ${passed}`);
  log('❌', `失败: ${failed}`);
  log('📊', `通过率: ${((passed / total) * 100).toFixed(1)}%`);

  console.log('');

  if (failed === 0) {
    log('🎉', '所有测试通过！API密钥管理系统功能正常。');
  } else {
    log('⚠️', '部分测试失败，请检查错误信息。');
    console.log('');
    console.log('失败的测试：');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ ${r.test}: ${r.message}`);
    });
  }

  console.log('');
  log('🏁', '测试完成');
  console.log('');

  // 如果有失败的测试，返回非0退出码
  process.exit(failed > 0 ? 1 : 0);
}

// 执行测试
runAllTests().catch(error => {
  console.error('测试执行出错:', error);
  process.exit(1);
});
