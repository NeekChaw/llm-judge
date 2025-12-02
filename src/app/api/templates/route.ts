import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { templateService } from '@/lib/template-service';

// GET /api/templates - 获取模板列表
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    
    // 解析查询参数
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';

    // 构建查询
    let query = supabase
      .from('templates')
      .select(`
        *,
        template_mappings (
          id,
          dimension_id,
          evaluator_id,
          weight,
          config,
          dimensions (id, name, description, criteria),
          evaluators (id, name, type, description)
        )
      `)
      .order('updated_at', { ascending: false });

    // 添加搜索条件
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    // 获取总数
    const { count } = await supabase
      .from('templates')
      .select('*', { count: 'exact', head: true });

    // 获取分页数据
    const { data: templates, error } = await query
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Templates query error:', error);
      return NextResponse.json({ error: '获取模板列表失败' }, { status: 500 });
    }

    // 格式化数据并计算统计信息
    const formattedTemplates = [];

    for (const template of templates || []) {
      let formattedTemplate;

      if (template.template_type === 'custom') {
        // 自定义模板：获取custom_mappings
        const { data: customMappings } = await supabase
          .from('template_custom_mappings')
          .select(`
            *,
            dimensions (id, name, description),
            evaluators (id, name, type, description)
          `)
          .eq('template_id', template.id);

        const uniqueDimensions = new Set(customMappings?.map((m: any) => m.dimension_id) || []);
        const uniqueEvaluators = new Set(customMappings?.map((m: any) => m.evaluator_id) || []);
        
        // 计算总题目数：所有自定义映射中test_case_ids数组长度之和
        const totalTestCases = (customMappings || []).reduce((sum: number, mapping: any) => {
          return sum + (mapping.test_case_ids?.length || 0);
        }, 0);

        formattedTemplate = {
          ...template,
          custom_mappings: customMappings || [],
          dimensions_count: uniqueDimensions.size,
          evaluators_count: uniqueEvaluators.size,
          total_test_cases: totalTestCases
        };
      } else {
        // 统一模板：使用template_mappings
        const mappings = template.template_mappings || [];
        const uniqueDimensions = new Set(mappings.map((m: any) => m.dimension_id));
        const uniqueEvaluators = new Set(mappings.map((m: any) => m.evaluator_id));

        formattedTemplate = {
          ...template,
          mappings,
          dimensions_count: uniqueDimensions.size,
          evaluators_count: uniqueEvaluators.size
        };
      }

      formattedTemplates.push(formattedTemplate);
    }

    return NextResponse.json({
      templates: formattedTemplates,
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit
      }
    });

  } catch (error) {
    console.error('Templates API error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// POST /api/templates - 创建模板
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const body = await request.json();
    
    console.log('接收到的模板创建数据:', JSON.stringify(body, null, 2));

    // 🔧 修复：使用模板服务处理双模板架构
    
    try {
      const templateId = await templateService.createTemplate(body);
      
      // 获取创建的模板数据
      const { data: template, error: fetchError } = await supabase
        .from('templates')
        .select('*')
        .eq('id', templateId)
        .single();
        
      if (fetchError) {
        console.error('获取创建的模板失败:', fetchError);
        return NextResponse.json({ error: '获取模板数据失败' }, { status: 500 });
      }

      return NextResponse.json({
        template,
        message: '模板创建成功'
      }, { status: 201 });

    } catch (serviceError) {
      console.error('模板服务创建失败:', serviceError);
      return NextResponse.json({ 
        error: serviceError instanceof Error ? serviceError.message : '创建模板失败' 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Template creation error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// PUT /api/templates - 更新模板
export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient();
    const body = await request.json();
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('id');

    if (!templateId) {
      return NextResponse.json({ error: '模板ID不能为空' }, { status: 400 });
    }

    // 验证必填字段
    if (!body.name || body.name.trim() === '') {
      return NextResponse.json({ error: '模板名称不能为空' }, { status: 400 });
    }

    // 检查模板是否存在
    const { data: existingTemplate, error: checkError } = await supabase
      .from('templates')
      .select('id, template_type')
      .eq('id', templateId)
      .single();

    if (checkError || !existingTemplate) {
      return NextResponse.json({ error: '模板不存在' }, { status: 404 });
    }

    // 🔧 修复：更新基础模板信息，包括template_type
    const { data: updatedTemplate, error: updateError } = await supabase
      .from('templates')
      .update({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        template_type: body.template_type || existingTemplate.template_type, // 🔧 支持template_type更新
        status: body.status || 'draft',
        updated_at: new Date().toISOString()
      })
      .eq('id', templateId)
      .select()
      .single();

    if (updateError) {
      console.error('Template update error:', updateError);
      return NextResponse.json({ error: '更新模板失败' }, { status: 500 });
    }

    // 🔧 修复：处理映射关系的更新
    if (body.template_type && (body.mappings || body.custom_mappings)) {
      try {
        // 使用模板服务来处理映射更新
        await templateService.updateTemplateMappings(templateId, {
          template_type: body.template_type,
          mappings: body.mappings,
          custom_mappings: body.custom_mappings
        });
      } catch (mappingError) {
        console.error('Template mappings update error:', mappingError);
        return NextResponse.json({ error: '更新模板映射失败' }, { status: 500 });
      }
    }

    return NextResponse.json({
      template: updatedTemplate,
      message: '模板更新成功'
    });

  } catch (error) {
    console.error('Template update error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// DELETE /api/templates - 删除模板
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('id');

    if (!templateId) {
      return NextResponse.json({ error: '模板ID不能为空' }, { status: 400 });
    }

    // 检查模板是否存在
    const { data: existingTemplate, error: checkError } = await supabase
      .from('templates')
      .select('id, name')
      .eq('id', templateId)
      .single();

    if (checkError || !existingTemplate) {
      return NextResponse.json({ error: '模板不存在' }, { status: 404 });
    }

    // 检查是否有正在使用该模板的任务
    const { data: activeTasks, error: taskCheckError } = await supabase
      .from('evaluation_tasks')
      .select('id')
      .eq('template_id', templateId)
      .in('status', ['pending', 'running'])
      .limit(1);

    if (taskCheckError) {
      console.error('Task check error:', taskCheckError);
      return NextResponse.json({ error: '检查模板使用状态失败' }, { status: 500 });
    }

    if (activeTasks && activeTasks.length > 0) {
      return NextResponse.json({ 
        error: '该模板正在被任务使用，无法删除。请先停止或删除相关任务。' 
      }, { status: 409 });
    }

    // 删除模板（级联删除会自动清理相关的映射关系）
    const { error: deleteError } = await supabase
      .from('templates')
      .delete()
      .eq('id', templateId);

    if (deleteError) {
      console.error('Template delete error:', deleteError);
      return NextResponse.json({ error: '删除模板失败' }, { status: 500 });
    }

    return NextResponse.json({
      message: `模板 "${existingTemplate.name}" 删除成功`
    });

  } catch (error) {
    console.error('Template delete error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}