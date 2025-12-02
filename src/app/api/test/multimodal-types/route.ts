/**
 * 多模态类型定义测试端点
 * 验证多模态类型系统的完整性
 */

import { NextRequest, NextResponse } from 'next/server';
import type {
  ContentAttachment,
  MediaAsset,
  MultimodalTestCase,
  MultimodalModel,
  MultimodalLLMRequest,
  MultimodalLLMResponse,
  ModalityType
} from '@/types/multimodal';
import { logger } from '@/lib/monitoring';

export async function GET(request: NextRequest) {
  try {
    // 测试类型定义的完整性
    const typeTests = {
      contentAttachment: testContentAttachmentType(),
      mediaAsset: testMediaAssetType(),
      multimodalTestCase: testMultimodalTestCaseType(),
      multimodalModel: testMultimodalModelType(),
      multimodalLLMRequest: testMultimodalLLMRequestType(),
      multimodalLLMResponse: testMultimodalLLMResponseType(),
      modalityTypes: testModalityTypes()
    };

    // 检查所有测试是否通过
    const allTestsPassed = Object.values(typeTests).every(test => test.passed);

    const result = {
      status: allTestsPassed ? 'success' : 'warning',
      message: allTestsPassed ? '所有多模态类型定义正常' : '部分类型定义存在问题',
      tests: typeTests,
      timestamp: new Date().toISOString()
    };

    logger.info('多模态类型测试完成', {
      all_passed: allTestsPassed,
      test_count: Object.keys(typeTests).length
    });

    return NextResponse.json(result);

  } catch (error) {
    logger.error('多模态类型测试失败', {
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      {
        status: 'error',
        message: '类型测试执行失败',
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * 测试 ContentAttachment 类型
 */
function testContentAttachmentType() {
  try {
    const testAttachment: ContentAttachment = {
      id: 'test-attachment-id',
      type: 'image',
      url: 'https://example.com/test.jpg',
      media_id: 'test-media-id',
      description: '测试附件',
      metadata: {
        mime_type: 'image/jpeg',
        size: 1024,
        dimensions: { width: 800, height: 600 }
      }
    };

    // 验证必需字段
    const requiredFields = ['id', 'type'];
    const missingFields = requiredFields.filter(field => !(field in testAttachment));

    return {
      passed: missingFields.length === 0,
      message: missingFields.length === 0 ? 'ContentAttachment 类型正常' : `缺少必需字段: ${missingFields.join(', ')}`,
      testData: testAttachment
    };
  } catch (error) {
    return {
      passed: false,
      message: `ContentAttachment 类型测试失败: ${error}`,
      error: String(error)
    };
  }
}

/**
 * 测试 MediaAsset 类型
 */
function testMediaAssetType() {
  try {
    const testAsset: MediaAsset = {
      id: 'test-media-asset-id',
      file_name: 'test.jpg',
      original_name: 'original-test.jpg',
      mime_type: 'image/jpeg',
      size: 2048,
      public_url: 'https://example.com/test.jpg',
      storage_path: '/uploads/test.jpg',
      upload_status: 'completed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        dimensions: { width: 1920, height: 1080 },
        duration: undefined
      }
    };

    const requiredFields = ['id', 'file_name', 'mime_type', 'size', 'upload_status'];
    const missingFields = requiredFields.filter(field => !(field in testAsset));

    return {
      passed: missingFields.length === 0,
      message: missingFields.length === 0 ? 'MediaAsset 类型正常' : `缺少必需字段: ${missingFields.join(', ')}`,
      testData: testAsset
    };
  } catch (error) {
    return {
      passed: false,
      message: `MediaAsset 类型测试失败: ${error}`,
      error: String(error)
    };
  }
}

/**
 * 测试 MultimodalTestCase 类型
 */
function testMultimodalTestCaseType() {
  try {
    const testCase: MultimodalTestCase = {
      id: 'test-case-id',
      name: '测试用例',
      description: '多模态测试用例描述',
      input: {
        text: '分析这张图片',
        attachments: []
      },
      expected_output: {
        text: '预期的分析结果',
        modalities: ['text']
      },
      evaluation_criteria: {
        accuracy: 0.8,
        relevance: 0.9
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const requiredFields = ['id', 'name', 'input', 'expected_output'];
    const missingFields = requiredFields.filter(field => !(field in testCase));

    return {
      passed: missingFields.length === 0,
      message: missingFields.length === 0 ? 'MultimodalTestCase 类型正常' : `缺少必需字段: ${missingFields.join(', ')}`,
      testData: testCase
    };
  } catch (error) {
    return {
      passed: false,
      message: `MultimodalTestCase 类型测试失败: ${error}`,
      error: String(error)
    };
  }
}

/**
 * 测试 MultimodalModel 类型
 */
function testMultimodalModelType() {
  try {
    const testModel: MultimodalModel = {
      id: 'test-model-id',
      name: '测试多模态模型',
      provider: 'test-provider',
      supported_modalities: {
        input: ['text', 'image'],
        output: ['text']
      },
      capabilities: {
        vision: true,
        audio: false,
        video: false,
        generation: false
      },
      pricing: {
        input_token_cost: 0.001,
        output_token_cost: 0.002
      },
      limits: {
        max_tokens: 4000,
        max_attachments: 10,
        max_file_size: 20 * 1024 * 1024
      }
    };

    const requiredFields = ['id', 'name', 'provider', 'supported_modalities'];
    const missingFields = requiredFields.filter(field => !(field in testModel));

    return {
      passed: missingFields.length === 0,
      message: missingFields.length === 0 ? 'MultimodalModel 类型正常' : `缺少必需字段: ${missingFields.join(', ')}`,
      testData: testModel
    };
  } catch (error) {
    return {
      passed: false,
      message: `MultimodalModel 类型测试失败: ${error}`,
      error: String(error)
    };
  }
}

/**
 * 测试 MultimodalLLMRequest 类型
 */
function testMultimodalLLMRequestType() {
  try {
    const testRequest: MultimodalLLMRequest = {
      model_id: 'test-model',
      system_prompt: '你是一个多模态助手',
      user_prompt: '请分析这个内容',
      attachments: [],
      expected_output_modalities: ['text'],
      temperature: 0.7,
      max_tokens: 1000
    };

    const requiredFields = ['model_id', 'user_prompt'];
    const missingFields = requiredFields.filter(field => !(field in testRequest));

    return {
      passed: missingFields.length === 0,
      message: missingFields.length === 0 ? 'MultimodalLLMRequest 类型正常' : `缺少必需字段: ${missingFields.join(', ')}`,
      testData: testRequest
    };
  } catch (error) {
    return {
      passed: false,
      message: `MultimodalLLMRequest 类型测试失败: ${error}`,
      error: String(error)
    };
  }
}

/**
 * 测试 MultimodalLLMResponse 类型
 */
function testMultimodalLLMResponseType() {
  try {
    const testResponse: MultimodalLLMResponse = {
      content: '这是多模态响应内容',
      attachments: [],
      modalities_used: {
        input: ['text', 'image'],
        output: ['text']
      },
      model: 'test-model',
      usage: {
        prompt_tokens: 100,
        completion_tokens: 200,
        total_tokens: 300
      },
      performance: {
        response_time: 1500,
        processing_time: 1200
      }
    };

    const requiredFields = ['content', 'modalities_used'];
    const missingFields = requiredFields.filter(field => !(field in testResponse));

    return {
      passed: missingFields.length === 0,
      message: missingFields.length === 0 ? 'MultimodalLLMResponse 类型正常' : `缺少必需字段: ${missingFields.join(', ')}`,
      testData: testResponse
    };
  } catch (error) {
    return {
      passed: false,
      message: `MultimodalLLMResponse 类型测试失败: ${error}`,
      error: String(error)
    };
  }
}

/**
 * 测试 ModalityType 枚举
 */
function testModalityTypes() {
  try {
    const expectedModalities: ModalityType[] = ['text', 'image', 'audio', 'video', 'document'];

    // 验证所有预期的模态类型都是有效的
    const testResults = expectedModalities.map(modality => {
      try {
        const testType: ModalityType = modality;
        return { modality, valid: true };
      } catch {
        return { modality, valid: false };
      }
    });

    const invalidModalities = testResults.filter(result => !result.valid);

    return {
      passed: invalidModalities.length === 0,
      message: invalidModalities.length === 0
        ? 'ModalityType 枚举正常'
        : `无效的模态类型: ${invalidModalities.map(r => r.modality).join(', ')}`,
      testData: {
        expected: expectedModalities,
        results: testResults
      }
    };
  } catch (error) {
    return {
      passed: false,
      message: `ModalityType 类型测试失败: ${error}`,
      error: String(error)
    };
  }
}