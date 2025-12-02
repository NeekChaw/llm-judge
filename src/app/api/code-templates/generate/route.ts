import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { codeTemplateEngine } from '@/lib/code-template-engine';
import type { GenerateCodeRequest, GenerateCodeResponse } from '@/types/code-templates';

/**
 * POST /api/code-templates/generate - 生成最终的可执行代码
 */
export async function POST(request: NextRequest) {
  try {
    const body: GenerateCodeRequest = await request.json();
    const { template_id, user_config } = body;

    // 基本验证
    if (!template_id || !user_config) {
      return NextResponse.json(
        { error: '模板ID和用户配置是必需的' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // 获取模板详情
    const { data: template, error: templateError } = await supabase
      .from('code_evaluation_templates')
      .select('*')
      .eq('id', template_id)
      .eq('is_active', true)
      .single();

    if (templateError) {
      if (templateError.code === 'PGRST116') {
        return NextResponse.json(
          { error: '模板不存在或已被禁用' },
          { status: 404 }
        );
      }

      console.error('获取模板失败:', templateError);
      return NextResponse.json(
        { error: '获取模板失败' },
        { status: 500 }
      );
    }

    // 使用代码生成引擎生成最终代码
    const result: GenerateCodeResponse = await codeTemplateEngine.generateCode(template, user_config);

    // 记录生成日志（可选）
    console.log(`代码生成请求: 模板=${template.name}, 用户配置键数=${Object.keys(user_config).length}`);

    return NextResponse.json(result);

  } catch (error) {
    console.error('代码生成异常:', error);
    return NextResponse.json(
      { 
        generated_code: '',
        validation_errors: [`代码生成异常: ${error instanceof Error ? error.message : '未知错误'}`]
      } as GenerateCodeResponse,
      { status: 500 }
    );
  }
}

/**
 * POST /api/code-templates/validate - 验证用户配置（不生成代码）
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { template_id, user_config } = body;

    if (!template_id || !user_config) {
      return NextResponse.json(
        { error: '模板ID和用户配置是必需的' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // 获取模板详情
    const { data: template, error: templateError } = await supabase
      .from('code_evaluation_templates')
      .select('config_schema, name')
      .eq('id', template_id)
      .eq('is_active', true)
      .single();

    if (templateError) {
      return NextResponse.json(
        { error: '模板不存在' },
        { status: 404 }
      );
    }

    // 只进行配置验证，不生成代码
    const validation = codeTemplateEngine.validateConfig(template, user_config);

    return NextResponse.json({
      template_name: template.name,
      validation
    });

  } catch (error) {
    console.error('配置验证异常:', error);
    return NextResponse.json(
      { error: '配置验证失败' },
      { status: 500 }
    );
  }
}