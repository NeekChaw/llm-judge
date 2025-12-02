import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

interface Context {
  params: Promise<{ id: string }>;
}

// GET /api/templates/[id] - 获取单个模板详情
export async function GET(
  request: NextRequest,
  context: Context
) {
  try {
    const supabase = createClient();
    const { id } = await context.params;

    // 获取模板基础信息
    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', id)
      .single();

    if (templateError) {
      if (templateError.code === 'PGRST116') {
        return NextResponse.json({ error: '模板不存在' }, { status: 404 });
      }
      console.error('Template fetch error:', templateError);
      return NextResponse.json({ error: '获取模板失败' }, { status: 500 });
    }

    // 根据模板类型获取不同的映射数据
    if (template.template_type === 'custom') {
      // 自定义模板：获取 custom_mappings
      const { data: customMappings, error: customError } = await supabase
        .from('template_custom_mappings')
        .select(`
          *,
          dimensions (id, name, description),
          evaluators (id, name, type, description)
        `)
        .eq('template_id', id)
        .order('created_at');

      if (customError) {
        console.error('Custom mappings query error:', customError);
        return NextResponse.json({ error: '获取自定义映射失败' }, { status: 500 });
      }

      // 计算总题目数：所有自定义映射中test_case_ids数组长度之和
      const totalTestCases = (customMappings || []).reduce((sum: number, mapping: any) => {
        return sum + (mapping.test_case_ids?.length || 0);
      }, 0);

      const formattedTemplate = {
        ...template,
        custom_mappings: customMappings || [],
        dimensions_count: new Set(customMappings?.map(m => m.dimension_id) || []).size,
        evaluators_count: new Set(customMappings?.map(m => m.evaluator_id) || []).size,
        total_test_cases: totalTestCases
      };

      return NextResponse.json({ template: formattedTemplate });
    } else {
      // 统一模板：获取 template_mappings
      const { data: unifiedMappings, error: unifiedError } = await supabase
        .from('template_mappings')
        .select(`
          *,
          dimensions (id, name, description, criteria),
          evaluators (id, name, type, description)
        `)
        .eq('template_id', id)
        .order('created_at');

      if (unifiedError) {
        console.error('Unified mappings query error:', unifiedError);
        return NextResponse.json({ error: '获取统一映射失败' }, { status: 500 });
      }

      const formattedTemplate = {
        ...template,
        mappings: unifiedMappings || [],
        dimensions_count: new Set(unifiedMappings?.map(m => m.dimension_id) || []).size,
        evaluators_count: new Set(unifiedMappings?.map(m => m.evaluator_id) || []).size
      };

      return NextResponse.json({ template: formattedTemplate });
    }

  } catch (error) {
    console.error('Template fetch error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// PUT /api/templates/[id] - 更新模板
export async function PUT(
  request: NextRequest,
  context: Context
) {
  try {
    const supabase = createClient();
    const { id } = await context.params;
    const body = await request.json();

    // 验证模板是否存在
    const { data: existingTemplate, error: fetchError } = await supabase
      .from('templates')
      .select('id, status')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: '模板不存在' }, { status: 404 });
      }
      return NextResponse.json({ error: '查询模板失败' }, { status: 500 });
    }

    // 验证必填字段
    if (!body.name || body.name.trim() === '') {
      return NextResponse.json({ error: '模板名称不能为空' }, { status: 400 });
    }

    // 如果提供了映射数据，进行验证
    if (body.mappings && Array.isArray(body.mappings)) {
      if (body.mappings.length === 0) {
        return NextResponse.json({ error: '模板必须包含至少一个维度-评分器映射' }, { status: 400 });
      }

      // 验证映射数据
      for (const mapping of body.mappings) {
        if (!mapping.dimension_id || !mapping.evaluator_id) {
          return NextResponse.json({ error: '映射必须包含维度和评分器' }, { status: 400 });
        }
        
        if (typeof mapping.weight !== 'number' || mapping.weight <= 0 || mapping.weight > 1) {
          return NextResponse.json({ error: '权重必须是0-1之间的数字' }, { status: 400 });
        }
      }

      // 验证权重总和
      const totalWeight = body.mappings.reduce((sum: number, mapping: any) => sum + mapping.weight, 0);
      if (Math.abs(totalWeight - 1.0) > 0.01) {
        return NextResponse.json({ 
          error: `权重总和必须等于1.0，当前为${totalWeight.toFixed(3)}` 
        }, { status: 400 });
      }

      // 检查重复组合
      const combinations = new Set();
      for (const mapping of body.mappings) {
        const key = `${mapping.dimension_id}-${mapping.evaluator_id}`;
        if (combinations.has(key)) {
          return NextResponse.json({ error: '不能重复添加相同的维度-评分器组合' }, { status: 400 });
        }
        combinations.add(key);
      }

      // 验证维度和评分器存在性
      const dimensionIds = body.mappings.map((m: any) => m.dimension_id);
      const evaluatorIds = body.mappings.map((m: any) => m.evaluator_id);

      const { data: dimensions } = await supabase
        .from('dimensions')
        .select('id')
        .in('id', dimensionIds);

      const { data: evaluators } = await supabase
        .from('evaluators')
        .select('id')
        .in('id', evaluatorIds);

      if (!dimensions || dimensions.length !== dimensionIds.length) {
        return NextResponse.json({ error: '部分维度不存在' }, { status: 400 });
      }

      if (!evaluators || evaluators.length !== evaluatorIds.length) {
        return NextResponse.json({ error: '部分评分器不存在' }, { status: 400 });
      }
    }

    // 更新模板基本信息（包括template_type）
    const { data: template, error: updateError } = await supabase
      .from('templates')
      .update({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        template_type: body.template_type || existingTemplate.template_type, // 🔧 支持template_type更新
        status: body.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Template update error:', updateError);
      return NextResponse.json({ error: '更新模板失败' }, { status: 500 });
    }

    // 🔧 修复：根据模板类型处理映射关系更新
    if (body.template_type && (body.mappings || body.custom_mappings)) {
      try {
        // 使用模板服务来处理映射更新
        const { templateService } = await import('@/lib/template-service');
        await templateService.updateTemplateMappings(id, {
          template_type: body.template_type,
          mappings: body.mappings,
          custom_mappings: body.custom_mappings
        });
      } catch (mappingError) {
        console.error('Template mappings update error:', mappingError);
        return NextResponse.json({ error: '更新模板映射失败' }, { status: 500 });
      }
    } else if (body.mappings && Array.isArray(body.mappings)) {
      // 🔧 兼容性处理：没有template_type时，默认处理统一模板映射
      // 删除现有映射
      const { error: deleteError } = await supabase
        .from('template_mappings')
        .delete()
        .eq('template_id', id);

      if (deleteError) {
        console.error('Template mappings delete error:', deleteError);
        return NextResponse.json({ error: '删除旧映射失败' }, { status: 500 });
      }

      // 创建新映射
      const mappings = body.mappings.map((mapping: any) => ({
        template_id: id,
        dimension_id: mapping.dimension_id,
        evaluator_id: mapping.evaluator_id,
        weight: mapping.weight,
        config: mapping.config || null
      }));

      const { error: insertError } = await supabase
        .from('template_mappings')
        .insert(mappings);

      if (insertError) {
        console.error('Template mappings insert error:', insertError);
        return NextResponse.json({ error: '创建新映射失败' }, { status: 500 });
      }
    }

    return NextResponse.json({
      template,
      message: '模板更新成功'
    });

  } catch (error) {
    console.error('Template update error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// DELETE /api/templates/[id] - 删除模板
export async function DELETE(
  request: NextRequest,
  context: Context
) {
  try {
    const supabase = createClient();
    const { id } = await context.params;

    // 检查模板是否存在
    const { data: template, error: fetchError } = await supabase
      .from('templates')
      .select('id, name, status')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: '模板不存在' }, { status: 404 });
      }
      return NextResponse.json({ error: '查询模板失败' }, { status: 500 });
    }

    // 检查是否有正在使用该模板的任务
    const { data: activeTasks, error: taskCheckError } = await supabase
      .from('evaluation_tasks')
      .select('id')
      .eq('template_id', id)
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
      .eq('id', id);

    if (deleteError) {
      console.error('Template delete error:', deleteError);
      return NextResponse.json({ error: '删除模板失败' }, { status: 500 });
    }

    return NextResponse.json({
      message: `模板 "${template.name}" 删除成功`
    });

  } catch (error) {
    console.error('Template delete error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}