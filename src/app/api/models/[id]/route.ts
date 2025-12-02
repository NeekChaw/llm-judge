import { createClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

interface ModelFormData {
  name: string;
  provider: string;
  api_endpoint: string;
  api_key_env_var: string;
  input_cost_per_1k_tokens?: number;
  output_cost_per_1k_tokens?: number;
  cost_currency?: 'USD' | 'CNY';
  // 🆕 Phase 1: 多提供商成本管理字段
  provider_input_cost_per_1k_tokens?: number;
  provider_output_cost_per_1k_tokens?: number;
  provider_cost_currency?: 'USD' | 'CNY';
  max_context_window?: number;
  tags: string[];
  // 新增：被测评时的默认配置
  default_max_tokens?: number;
  default_temperature?: number;
  default_thinking_budget?: number;
  // 多厂商架构字段
  logical_name?: string;
  vendor_name?: string;
  api_model_name?: string;
  priority?: number;
  concurrent_limit?: number;
  success_rate?: number;
  model_group_id?: string;
}

// PATCH更新接口 - 用于部分字段更新
interface ModelPatchData {
  api_model_name?: string;
  priority?: number;
  status?: 'active' | 'inactive' | 'maintenance';
  [key: string]: any; // 允许其他字段
}

interface Context {
  params: Promise<{ id: string }>;
}

// GET /api/models/[id] - 获取单个模型
export async function GET(
  request: NextRequest,
  context: Context
) {
  try {
    const supabase = createClient();
    const { id } = await context.params;
    const { data: model, error } = await supabase
      .from('models')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '模型不存在' },
          { status: 404 }
        );
      }
      console.error('获取模型失败:', error);
      return NextResponse.json(
        { error: '获取模型失败', details: error.message },
        { status: 500 }
      );
    }

    // 处理模型数据，确保tags字段是数组
    const processedModel = {
      ...model,
      tags: model.tags || ['推理'] // 如果tags为null或undefined，默认为推理标签
    };

    return NextResponse.json({ model: processedModel });

  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

// PUT /api/models/[id] - 更新模型
export async function PUT(
  request: NextRequest,
  context: Context
) {
  try {
    const supabase = createClient();
    const { id } = await context.params;
    const body: ModelFormData = await request.json();

    // 验证必填字段
    if (!body.name || !body.provider || !body.api_endpoint || !body.api_key_env_var || !body.tags || body.tags.length === 0) {
      return NextResponse.json(
        { error: '名称、提供商、API端点、API密钥环境变量和标签为必填字段' },
        { status: 400 }
      );
    }

    // 验证标签值
    const validTags = ['非推理', '推理', '多模态'];
    const invalidTags = body.tags.filter(tag => !validTags.includes(tag));
    if (invalidTags.length > 0) {
      return NextResponse.json(
        { error: `无效的标签：${invalidTags.join(', ')}。有效标签：${validTags.join(', ')}` },
        { status: 400 }
      );
    }

    // 检查名称是否重复（排除当前记录）
    const { data: existing } = await supabase
      .from('models')
      .select('id')
      .eq('name', body.name)
      .neq('id', id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: '模型名称已存在' },
        { status: 409 }
      );
    }

    // 首先获取当前模型记录以获取原始逻辑名称
    const { data: currentModel, error: getCurrentError } = await supabase
      .from('models')
      .select('logical_name, name')
      .eq('id', id)
      .single();

    if (getCurrentError) {
      console.error('获取当前模型失败:', getCurrentError);
      return NextResponse.json(
        { error: '模型不存在' },
        { status: 404 }
      );
    }

    const oldLogicalName = currentModel.logical_name || currentModel.name;
    const newLogicalName = body.logical_name || body.name;

    // 更新主模型记录
    const { data: model, error } = await supabase
      .from('models')
      .update({
        name: body.name,
        provider: body.provider,
        api_endpoint: body.api_endpoint,
        api_key_env_var: body.api_key_env_var,
        input_cost_per_1k_tokens: body.input_cost_per_1k_tokens ?? 0,
        output_cost_per_1k_tokens: body.output_cost_per_1k_tokens ?? 0,
        cost_currency: body.cost_currency || 'USD',
        // 🆕 Phase 1: 多提供商成本管理字段
        provider_input_cost_per_1k_tokens: body.provider_input_cost_per_1k_tokens ?? null,
        provider_output_cost_per_1k_tokens: body.provider_output_cost_per_1k_tokens ?? null,
        provider_cost_currency: body.provider_cost_currency || null,
        cost_last_updated: new Date().toISOString(),
        max_context_window: body.max_context_window || null,
        tags: body.tags,
        // 新增：被测评时的默认配置
        default_max_tokens: body.default_max_tokens || null,
        default_temperature: body.default_temperature || null,
        default_thinking_budget: body.default_thinking_budget || null,
        // 多厂商架构字段
        logical_name: newLogicalName,
        vendor_name: body.vendor_name || null,
        api_model_name: body.api_model_name || null,
        priority: body.priority ?? 3,
        concurrent_limit: body.concurrent_limit ?? 50,
        success_rate: body.success_rate ?? 1.0,
        model_group_id: body.model_group_id || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('更新模型失败:', error);
      return NextResponse.json(
        { error: '更新模型失败', details: error.message },
        { status: 500 }
      );
    }

    // 🆕 如果逻辑名称发生变化，更新同一逻辑组下的所有其他提供商记录
    if (oldLogicalName !== newLogicalName) {
      console.log(`🔄 逻辑名称从 "${oldLogicalName}" 更改为 "${newLogicalName}"，更新相关提供商记录...`);
      
      // 🔍 智能查找策略：寻找所有可能属于同一逻辑组的记录
      
      // 策略1：查找具有相同logical_name的记录
      const { data: sameLogicalName, error: err1 } = await supabase
        .from('models')
        .select('id, logical_name, name, provider')
        .eq('logical_name', oldLogicalName)
        .neq('id', id);
      
      // 策略2：基于已知的deepseek模型命名模式查找
      // 从测试数据看：deepseek-chat-v3.1 和 deepseek-v3.1 应该是同一逻辑组
      const logicalVariants = [];
      
      if (oldLogicalName.includes('deepseek')) {
        logicalVariants.push(
          'deepseek-chat-v3.1',  // volcengine 和 OpenRouter 使用的逻辑名称
          'deepseek-v3.1',       // 阿里云百炼使用的逻辑名称
          newLogicalName         // 新的逻辑名称
        );
      }
      
      const { data: variantModels, error: err2 } = await supabase
        .from('models')
        .select('id, logical_name, name, provider')
        .in('logical_name', logicalVariants)
        .neq('id', id);
      
      // 策略3：基于name字段的模式匹配（处理没有logical_name的记录）
      const { data: allModels, error: err3 } = await supabase
        .from('models')
        .select('id, logical_name, name, provider')
        .neq('id', id);
      
      // 合并所有找到的记录并去重
      const foundModels = [];
      
      if (sameLogicalName && !err1) {
        foundModels.push(...sameLogicalName);
        console.log(`🔍 通过logical_name="${oldLogicalName}"找到${sameLogicalName.length}条记录`);
      }
      
      if (variantModels && !err2) {
        const newRecords = variantModels.filter(vm => !foundModels.find(fm => fm.id === vm.id));
        foundModels.push(...newRecords);
        console.log(`🔍 通过逻辑名称变体匹配找到${newRecords.length}条新记录`);
      }
      
      if (allModels && !err3) {
        // 查找name字段包含deepseek-v3.1、deepseek-chat-v3.1等模式的记录
        const namePatterns = ['deepseek-v3.1', 'deepseek-chat-v3.1', 'deepseek/deepseek-chat-v3.1', 'deepseek-v3-1'];
        const nameMatched = allModels.filter(m => 
          namePatterns.some(pattern => m.name && m.name.includes(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        ).filter(m => !foundModels.find(fm => fm.id === m.id));
        
        foundModels.push(...nameMatched);
        console.log(`🔍 通过name模式匹配找到${nameMatched.length}条新记录`);
      }
      
      console.log(`📋 详细记录列表:`);
      foundModels.forEach(model => {
        console.log(`   - ${model.provider}: logical_name="${model.logical_name}", name="${model.name}", id="${model.id}"`);
      });
      
      const updateIds = foundModels.map(m => m.id);
      console.log(`📝 总共需要更新${updateIds.length}条记录`);
      
      if (updateIds.length > 0) {
        const { error: batchUpdateError } = await supabase
          .from('models')
          .update({ 
            logical_name: newLogicalName,
            updated_at: new Date().toISOString()
          })
          .in('id', updateIds);

        if (batchUpdateError) {
          console.error('批量更新提供商记录失败:', batchUpdateError);
          console.warn('⚠️ 部分提供商记录可能未能同步更新逻辑名称');
        } else {
          console.log(`✅ 已成功更新${updateIds.length}条相关提供商记录的逻辑名称`);
        }
      } else {
        console.log('ℹ️ 没有找到需要更新的相关记录');
      }
    }

    return NextResponse.json(
      { model, message: '模型更新成功' }
    );

  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

// DELETE /api/models/[id] - 删除模型
export async function DELETE(
  request: NextRequest,
  context: Context
) {
  try {
    const supabase = createClient();
    const { id } = await context.params;
    // 检查是否有关联的评分器
    const { data: evaluators, error: evaluatorError } = await supabase
      .from('evaluators')
      .select('id')
      .or(`config->>model_id.eq.${id},config->>evaluator_model_id.eq.${id}`)
      .limit(1);

    if (evaluatorError) {
      console.error('检查关联评分器失败:', evaluatorError);
      return NextResponse.json(
        { error: '检查关联关系失败' },
        { status: 500 }
      );
    }

    if (evaluators && evaluators.length > 0) {
      return NextResponse.json(
        { error: '无法删除：此模型已被评分器使用' },
        { status: 409 }
      );
    }

    // 检查是否有关联的评测结果
    const { data: results, error: resultError } = await supabase
      .from('evaluation_results')
      .select('id')
      .eq('model_id', id)
      .limit(1);

    if (resultError) {
      console.error('检查评测结果失败:', resultError);
      return NextResponse.json(
        { error: '检查评测结果失败' },
        { status: 500 }
      );
    }

    if (results && results.length > 0) {
      return NextResponse.json(
        { error: '无法删除：此模型已有评测结果' },
        { status: 409 }
      );
    }

    // 删除模型
    const { error } = await supabase
      .from('models')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '模型不存在' },
          { status: 404 }
        );
      }
      console.error('删除模型失败:', error);
      return NextResponse.json(
        { error: '删除模型失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: '模型删除成功' }
    );

  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

// PATCH /api/models/[id] - 部分更新模型
export async function PATCH(
  request: NextRequest,
  context: Context
) {
  try {
    const supabase = createClient();
    const { id } = await context.params;
    const body: ModelPatchData = await request.json();

    // 验证请求体不为空
    if (!body || Object.keys(body).length === 0) {
      return NextResponse.json(
        { error: '请求体不能为空' },
        { status: 400 }
      );
    }

    // 构建更新对象，只包含提供的字段
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    // 添加允许的字段到更新对象中
    const allowedFields = [
      'api_model_name', 'priority', 'status', 'name', 'provider', 
      'api_endpoint', 'api_key_env_var', 'logical_name', 'vendor_name',
      'concurrent_limit', 'success_rate', 'input_cost_per_1k_tokens',
      'output_cost_per_1k_tokens', 'cost_currency', 'max_context_window',
      // 🆕 Phase 1: 多提供商成本管理字段
      'provider_input_cost_per_1k_tokens', 'provider_output_cost_per_1k_tokens', 'provider_cost_currency',
      'tags', 'default_max_tokens', 'default_temperature', 'default_thinking_budget'
    ];

    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });

    // 🆕 Phase 1: 如果更新了任何成本相关字段，自动更新cost_last_updated
    const costRelatedFields = [
      'input_cost_per_1k_tokens', 'output_cost_per_1k_tokens', 'cost_currency',
      'provider_input_cost_per_1k_tokens', 'provider_output_cost_per_1k_tokens', 'provider_cost_currency'
    ];
    const hasCostUpdate = costRelatedFields.some(field => body[field] !== undefined);
    if (hasCostUpdate) {
      updateData.cost_last_updated = new Date().toISOString();
    }

    // 🔧 如果更新了logical_name，需要同步更新所有相关提供商的逻辑名称
    if (updateData.logical_name) {
      // 首先获取当前模型的信息以获取原始逻辑名称
      const { data: currentModel, error: getCurrentError } = await supabase
        .from('models')
        .select('logical_name, name')
        .eq('id', id)
        .single();
        
      if (getCurrentError) {
        console.error('获取当前模型信息失败:', getCurrentError);
      } else if (currentModel) {
        const originalLogicalName = currentModel.logical_name || currentModel.name;
        const newLogicalName = updateData.logical_name;
        
        console.log(`🔄 检测到逻辑名称更新: "${originalLogicalName}" -> "${newLogicalName}"`);
        
        // 如果逻辑名称确实发生了变化，同步更新所有相关提供商
        if (originalLogicalName !== newLogicalName) {
          // 先查询所有需要更新的模型
          const { data: modelsToUpdate, error: findError } = await supabase
            .from('models')
            .select('id, provider, logical_name, name')
            .or(`logical_name.eq.${originalLogicalName},name.eq.${originalLogicalName}`);
            
          if (findError) {
            console.error('❌ 查询相关模型失败:', findError);
          } else if (modelsToUpdate && modelsToUpdate.length > 0) {
            console.log(`🔍 找到 ${modelsToUpdate.length} 个需要同步的模型:`, modelsToUpdate.map(m => `${m.provider}(${m.id})`));
            
            // 批量更新所有相关模型的逻辑名称
            const modelIds = modelsToUpdate.map(m => m.id);
            const { data: relatedModels, error: getRelatedError } = await supabase
              .from('models')
              .update({ logical_name: newLogicalName, updated_at: new Date().toISOString() })
              .in('id', modelIds)
              .select('id, provider, logical_name');
            
            if (getRelatedError) {
              console.error('❌ 同步更新相关提供商失败:', getRelatedError);
            } else {
              console.log(`✅ 已同步更新 ${relatedModels?.length || 0} 个相关提供商的逻辑名称`);
              console.log('已更新的模型:', relatedModels?.map(m => `${m.provider}(${m.id})`));
            }
          } else {
            console.log('📝 没有找到需要同步的相关模型');
          }
        }
      }
    }

    // 部分更新模型
    const { data: model, error } = await supabase
      .from('models')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '模型不存在' },
          { status: 404 }
        );
      }
      console.error('部分更新模型失败:', error);
      return NextResponse.json(
        { error: '部分更新模型失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { model, message: '模型部分更新成功' }
    );

  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}