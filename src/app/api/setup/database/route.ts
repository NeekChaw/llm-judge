import { supabase } from '@/lib/db';
import { NextResponse } from 'next/server';

// 由于Supabase不直接支持执行原始SQL，我们需要逐个创建表
export async function POST() {
  try {
    console.log('开始初始化Supabase数据库...');
    
    // 1. 创建dimensions表
    console.log('创建dimensions表...');
    const { error: dimensionsError } = await supabase.rpc('exec', {
      query: `
        CREATE TABLE IF NOT EXISTS dimensions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name varchar(255) NOT NULL,
          description text,
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        );
      `
    });
    
    if (dimensionsError && !dimensionsError.message?.includes('already exists')) {
      console.log('Dimensions表可能已存在，继续...');
    }
    
    // 2. 插入测试维度数据
    console.log('插入测试维度数据...');
    const { error: insertDimensionsError } = await supabase
      .from('dimensions')
      .upsert([
        { name: '代码质量', description: '评估代码的可读性、可维护性和最佳实践' },
        { name: '功能正确性', description: '评估代码是否正确实现了预期功能' },
        { name: '安全性', description: '评估代码的安全性和潜在漏洞' }
      ], { 
        onConflict: 'name',
        ignoreDuplicates: true 
      });
    
    if (insertDimensionsError) {
      console.log('维度数据插入:', insertDimensionsError);
    }
    
    // 3. 创建models表
    console.log('创建models表...');
    const { error: modelsError } = await supabase.rpc('exec', {
      query: `
        CREATE TABLE IF NOT EXISTS models (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name varchar(255) NOT NULL,
          provider varchar(100),
          api_endpoint varchar(255),
          api_key_env_var varchar(100),
          input_cost_per_1k_tokens numeric(10, 6),
          output_cost_per_1k_tokens numeric(10, 6),
          max_context_window integer,
          tags text[] DEFAULT '{"推理"}',
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        );
      `
    });
    
    if (modelsError && !modelsError.message?.includes('already exists')) {
      console.log('Models表可能已存在，继续...');
    }
    
    // 4. 插入测试模型数据
    console.log('插入测试模型数据...');
    const { error: insertModelsError } = await supabase
      .from('models')
      .upsert([
        { 
          name: '硅基流动-GPT3.5', 
          provider: '硅基流动', 
          api_endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
          api_key_env_var: 'SILICONFLOW_API_KEY',
          tags: ['推理']
        },
        { 
          name: '硅基流动-Claude', 
          provider: '硅基流动', 
          api_endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
          api_key_env_var: 'SILICONFLOW_API_KEY',
          tags: ['推理']
        },
        { 
          name: '硅基流动-Qwen', 
          provider: '硅基流动', 
          api_endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
          api_key_env_var: 'SILICONFLOW_API_KEY',
          tags: ['推理']
        }
      ], { 
        onConflict: 'name',
        ignoreDuplicates: true 
      });
    
    if (insertModelsError) {
      console.log('模型数据插入:', insertModelsError);
    }
    
    // 5. 创建code_evaluation_templates表
    console.log('创建code_evaluation_templates表...');
    const { error: templatesError } = await supabase.rpc('exec', {
      query: `
        CREATE TABLE IF NOT EXISTS code_evaluation_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          category TEXT NOT NULL,
          language TEXT NOT NULL,
          tags TEXT[],
          template_code TEXT NOT NULL,
          config_schema JSONB NOT NULL,
          example_config JSONB,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_code_templates_language ON code_evaluation_templates(language);
        CREATE INDEX IF NOT EXISTS idx_code_templates_category ON code_evaluation_templates(category);
        CREATE INDEX IF NOT EXISTS idx_code_templates_active ON code_evaluation_templates(is_active);
      `
    });
    
    if (templatesError && !templatesError.message?.includes('already exists')) {
      console.log('Code templates表创建错误:', templatesError);
    }
    
    // 6. 插入预置代码模板数据
    console.log('插入预置代码模板数据...');
    const { error: insertTemplatesError } = await supabase
      .from('code_evaluation_templates')
      .upsert([
        {
          id: 'algorithm-correctness-python',
          name: '算法正确性测试',
          description: '测试算法实现的输入输出正确性，支持多个测试用例和性能评估',
          category: 'algorithm',
          language: 'python',
          tags: ['algorithm', 'correctness', 'testing'],
          template_code: `import json
import time

# 用户配置参数
test_cases = {{TEST_CASES}}
timeout_per_test = {{TIMEOUT_PER_TEST}}

def run_test():
    total_score = 0
    for i, case in enumerate(test_cases):
        try:
            result = solution(case['input'])
            if result == case['expected']:
                total_score += 100 / len(test_cases)
                print(f"测试用例 {i+1}: 通过")
            else:
                print(f"测试用例 {i+1}: 失败")
        except Exception as e:
            print(f"测试用例 {i+1}: 异常 - {e}")
    
    print(f"SCORE: {total_score}")
    return total_score

run_test()`,
          config_schema: {
            type: 'object',
            properties: {
              test_cases: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    input: { type: 'array' },
                    expected: { type: 'array' }
                  },
                  required: ['input', 'expected']
                },
                minItems: 1
              },
              timeout_per_test: {
                type: 'integer',
                default: 1000,
                minimum: 100,
                maximum: 30000
              }
            },
            required: ['test_cases']
          },
          example_config: {
            test_cases: [
              {
                input: [3, 1, 4, 1, 5],
                expected: [1, 1, 3, 4, 5]
              }
            ],
            timeout_per_test: 2000
          },
          is_active: true
        },
        {
          id: 'json-format-validator-python',
          name: 'JSON格式验证器',
          description: '验证输出是否符合指定的JSON Schema格式',
          category: 'format',
          language: 'python',
          tags: ['json', 'format', 'validation'],
          template_code: `import json
import jsonschema

# 用户配置参数  
expected_schema = {{EXPECTED_SCHEMA}}

def validate_format():
    try:
        parsed = json.loads(model_output)
        jsonschema.validate(instance=parsed, schema=expected_schema)
        print("格式验证通过")
        print("SCORE: 100")
        return 100
    except Exception as e:
        print(f"格式验证失败: {e}")
        print("SCORE: 0")
        return 0

validate_format()`,
          config_schema: {
            type: 'object',
            properties: {
              expected_schema: {
                type: 'object',
                description: 'JSON Schema定义'
              }
            },
            required: ['expected_schema']
          },
          example_config: {
            expected_schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'integer' }
              },
              required: ['name']
            }
          },
          is_active: true
        }
      ], { 
        onConflict: 'id',
        ignoreDuplicates: true 
      });
    
    if (insertTemplatesError) {
      console.log('代码模板数据插入:', insertTemplatesError);
    }

    // 验证表是否创建成功
    console.log('验证数据库表...');
    const { data: dimensionsData, error: verifyDimensionsError } = await supabase
      .from('dimensions')
      .select('*')
      .limit(5);
    
    const { data: modelsData, error: verifyModelsError } = await supabase
      .from('models')
      .select('*')
      .limit(5);
      
    const { data: templatesData, error: verifyTemplatesError } = await supabase
      .from('code_evaluation_templates')
      .select('*')
      .limit(5);
    
    return NextResponse.json({
      success: true,
      message: '数据库初始化成功!',
      data: {
        dimensions: dimensionsData?.length || 0,
        models: modelsData?.length || 0,
        code_templates: templatesData?.length || 0,
        tables_created: ['dimensions', 'models', 'code_evaluation_templates'],
        errors: {
          dimensions: verifyDimensionsError?.message || null,
          models: verifyModelsError?.message || null,
          code_templates: verifyTemplatesError?.message || null
        }
      }
    });
    
  } catch (error) {
    console.error('数据库初始化失败:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '数据库初始化失败',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // 检查数据库状态
    const { data: dimensionsData, error: dimensionsError } = await supabase
      .from('dimensions')
      .select('count', { count: 'exact' });
    
    const { data: modelsData, error: modelsError } = await supabase
      .from('models')
      .select('count', { count: 'exact' });
    
    return NextResponse.json({
      database_status: 'connected',
      tables: {
        dimensions: {
          exists: !dimensionsError,
          count: dimensionsData?.[0]?.count || 0,
          error: dimensionsError?.message || null
        },
        models: {
          exists: !modelsError,
          count: modelsData?.[0]?.count || 0,
          error: modelsError?.message || null
        }
      }
    });
    
  } catch (error) {
    console.error('数据库状态检查失败:', error);
    return NextResponse.json(
      { 
        error: '数据库连接失败',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}