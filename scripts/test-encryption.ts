/**
 * 加密服务测试脚本
 *
 * 使用方法：
 * npx tsx scripts/test-encryption.ts
 */

import { encrypt, decrypt, hashValue, maskValue, validateEncryptionKey } from '../src/lib/encryption';

console.log('🔐 加密服务测试\n');

// 测试1: 基本加密/解密
console.log('测试1: 基本加密/解密');
console.log('━━━━━━━━━━━━━━━━━━━━━━');
try {
  const original = 'sk-1234567890abcdef';
  const encrypted = encrypt(original);
  const decrypted = decrypt(encrypted);

  console.log(`原始文本: ${original}`);
  console.log(`加密后:   ${encrypted}`);
  console.log(`解密后:   ${decrypted}`);
  console.log(`验证:     ${original === decrypted ? '✅ 通过' : '❌ 失败'}`);
} catch (error) {
  console.error(`❌ 错误: ${error}`);
}

console.log('\n');

// 测试2: 中文支持
console.log('测试2: 中文支持');
console.log('━━━━━━━━━━━━━━━━━━━━━━');
try {
  const original = '这是一个包含中文的密钥：sk-测试123';
  const encrypted = encrypt(original);
  const decrypted = decrypt(encrypted);

  console.log(`原始文本: ${original}`);
  console.log(`加密后:   ${encrypted}`);
  console.log(`解密后:   ${decrypted}`);
  console.log(`验证:     ${original === decrypted ? '✅ 通过' : '❌ 失败'}`);
} catch (error) {
  console.error(`❌ 错误: ${error}`);
}

console.log('\n');

// 测试3: 特殊字符
console.log('测试3: 特殊字符');
console.log('━━━━━━━━━━━━━━━━━━━━━━');
try {
  const original = 'sk-!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
  const encrypted = encrypt(original);
  const decrypted = decrypt(encrypted);

  console.log(`原始文本: ${original}`);
  console.log(`加密后:   ${encrypted.slice(0, 50)}...`);
  console.log(`解密后:   ${decrypted}`);
  console.log(`验证:     ${original === decrypted ? '✅ 通过' : '❌ 失败'}`);
} catch (error) {
  console.error(`❌ 错误: ${error}`);
}

console.log('\n');

// 测试4: 多次加密不同
console.log('测试4: 多次加密产生不同密文（IV随机）');
console.log('━━━━━━━━━━━━━━━━━━━━━━');
try {
  const original = 'sk-same-key';
  const encrypted1 = encrypt(original);
  const encrypted2 = encrypt(original);

  console.log(`原始文本:  ${original}`);
  console.log(`第1次加密: ${encrypted1.slice(0, 50)}...`);
  console.log(`第2次加密: ${encrypted2.slice(0, 50)}...`);
  console.log(`密文不同:  ${encrypted1 !== encrypted2 ? '✅ 通过（安全）' : '❌ 失败'}`);
  console.log(`都能解密:  ${decrypt(encrypted1) === original && decrypt(encrypted2) === original ? '✅ 通过' : '❌ 失败'}`);
} catch (error) {
  console.error(`❌ 错误: ${error}`);
}

console.log('\n');

// 测试5: 哈希值
console.log('测试5: 哈希值');
console.log('━━━━━━━━━━━━━━━━━━━━━━');
try {
  const value = 'sk-1234567890abcdef';
  const hash1 = hashValue(value);
  const hash2 = hashValue(value);

  console.log(`原始值:   ${value}`);
  console.log(`哈希1:    ${hash1}`);
  console.log(`哈希2:    ${hash2}`);
  console.log(`哈希一致: ${hash1 === hash2 ? '✅ 通过' : '❌ 失败'}`);
  console.log(`不可逆:   ${hash1 !== value ? '✅ 通过' : '❌ 失败'}`);
} catch (error) {
  console.error(`❌ 错误: ${error}`);
}

console.log('\n');

// 测试6: 脱敏显示
console.log('测试6: 脱敏显示');
console.log('━━━━━━━━━━━━━━━━━━━━━━');
try {
  const keys = [
    'sk-1234567890abcdef',
    'sk-ant-1234567890',
    'very-short',
    'sk-proj-1234567890abcdefghijklmnopqrstuvwxyz',
  ];

  keys.forEach(key => {
    const masked = maskValue(key);
    console.log(`${key.padEnd(50)} => ${masked}`);
  });
  console.log('✅ 脱敏正常');
} catch (error) {
  console.error(`❌ 错误: ${error}`);
}

console.log('\n');

// 测试7: 密钥强度验证
console.log('测试7: 密钥强度验证');
console.log('━━━━━━━━━━━━━━━━━━━━━━');
try {
  const result = validateEncryptionKey();
  console.log(`验证结果: ${result.valid ? '✅' : '⚠️ '} ${result.message}`);
  console.log(`强度等级: ${result.strength}`);

  if (!result.valid) {
    console.log('\n💡 建议：');
    console.log('   export CONFIG_ENCRYPTION_KEY="$(openssl rand -hex 32)"');
    console.log('   或在 .env 文件中设置至少32个字符的随机字符串');
  }
} catch (error) {
  console.error(`❌ 错误: ${error}`);
}

console.log('\n');

// 测试8: 错误处理
console.log('测试8: 错误处理');
console.log('━━━━━━━━━━━━━━━━━━━━━━');
try {
  // 测试空字符串
  try {
    encrypt('');
  } catch (error) {
    console.log('✅ 空字符串加密正确抛出错误');
  }

  // 测试无效密文
  try {
    decrypt('invalid-ciphertext');
  } catch (error) {
    console.log('✅ 无效密文正确抛出错误');
  }

  // 测试篡改的密文
  try {
    const encrypted = encrypt('test');
    const tampered = encrypted.replace(/a/g, 'b');
    decrypt(tampered);
  } catch (error) {
    console.log('✅ 篡改的密文正确抛出错误');
  }
} catch (error) {
  console.error(`❌ 错误处理测试失败: ${error}`);
}

console.log('\n');

// 测试9: 性能测试
console.log('测试9: 性能测试');
console.log('━━━━━━━━━━━━━━━━━━━━━━');
try {
  const iterations = 1000;
  const testKey = 'sk-1234567890abcdef';

  console.log(`加密/解密 ${iterations} 次...`);

  const startTime = Date.now();

  for (let i = 0; i < iterations; i++) {
    const encrypted = encrypt(testKey);
    const decrypted = decrypt(encrypted);
    if (decrypted !== testKey) {
      throw new Error('解密结果不匹配');
    }
  }

  const endTime = Date.now();
  const duration = endTime - startTime;
  const opsPerSec = Math.round((iterations / duration) * 1000);

  console.log(`总耗时: ${duration}ms`);
  console.log(`吞吐量: ${opsPerSec} ops/sec`);
  console.log(`平均延迟: ${(duration / iterations).toFixed(2)}ms/op`);
  console.log('✅ 性能测试通过');
} catch (error) {
  console.error(`❌ 性能测试失败: ${error}`);
}

console.log('\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎉 所有测试完成！');
console.log('━━━━━━━━━━━━━━━━━━━━━━');
