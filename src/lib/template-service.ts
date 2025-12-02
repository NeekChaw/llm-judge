/**
 * 双模板系统服务层
 * 提供模板相关的业务逻辑和数据访问兼容性
 */

import { createClient } from '@/lib/supabase';
import type {
  Template,
  UnifiedTemplate,
  CustomTemplate,
  TemplateType,
  CreateTemplateRequest,
  TemplateDetail,
  TemplateExecutionPlan,
  ExecutionMapping,
  UnifiedTemplateMapping,
  CustomTemplateMapping
} from './template-types';

export class TemplateService {
  // 懒加载 Supabase 客户端，避免构建时初始化
  private get supabase() {
    return createClient();
  }

  /**
   * 获取模板列表（兼容新旧结构）
   */
  async getTemplates(): Promise<Template[]> {
    // 查询基础模板信息，如果没有template_type字段则默认为unified
    const { data: templates, error } = await this.supabase
      .from('templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`获取模板列表失败: ${error.message}`);
    }

    const results: Template[] = [];

    for (const template of templates || []) {
      // 兼容性处理：如果没有template_type字段，默认为unified
      const templateType: TemplateType = template.template_type || 'unified';
      
      if (templateType === 'unified') {
        const unifiedTemplate = await this.buildUnifiedTemplate(template);
        results.push(unifiedTemplate);
      } else if (templateType === 'custom') {
        const customTemplate = await this.buildCustomTemplate(template);
        results.push(customTemplate);
      }
    }

    return results;
  }

  /**
   * 获取模板详情
   */
  async getTemplateDetail(templateId: string): Promise<TemplateDetail | null> {
    const { data: template, error } = await this.supabase
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (error || !template) {
      return null;
    }

    const templateType: TemplateType = template.template_type || 'unified';
    
    if (templateType === 'unified') {
      return await this.buildUnifiedTemplateDetail(template);
    } else {
      return await this.buildCustomTemplateDetail(template);
    }
  }

  /**
   * 创建模板（支持两种类型）
   */
  async createTemplate(request: CreateTemplateRequest): Promise<string> {
    // 创建基础模板记录
    const { data: template, error: templateError } = await this.supabase
      .from('templates')
      .insert({
        name: request.name,
        description: request.description,
        template_type: request.template_type,
        status: request.status || 'draft' // 使用请求中的状态或默认为草稿
      })
      .select()
      .single();

    if (templateError || !template) {
      throw new Error(`创建模板失败: ${templateError?.message}`);
    }

    // 根据类型创建对应的映射关系
    try {
      if (request.template_type === 'unified') {
        await this.createUnifiedMappings(template.id, request.mappings);
      } else {
        await this.createCustomMappings(template.id, request.custom_mappings);
      }
    } catch (mappingError) {
      // 映射创建失败，回滚已创建的模板
      console.error('🚨 映射创建失败，正在回滚模板:', template.id);
      
      const { error: deleteError } = await this.supabase
        .from('templates')
        .delete()
        .eq('id', template.id);
        
      if (deleteError) {
        console.error('回滚模板失败:', deleteError);
        throw new Error(`模板创建失败且回滚失败: ${mappingError.message}。请手动清理模板ID: ${template.id}`);
      }
      
      // 重新抛出原始错误
      throw mappingError;
    }

    return template.id;
  }

  /**
   * 生成模板执行计划
   */
  async generateExecutionPlan(templateId: string, testCaseIds: string[]): Promise<TemplateExecutionPlan> {
    const template = await this.getTemplateDetail(templateId);
    if (!template) {
      throw new Error('模板不存在');
    }

    const mappings: ExecutionMapping[] = [];
    let totalEvaluations = 0;

    if (template.template_type === 'unified') {
      // 统一模板：所有题目 × 所有维度
      for (const mapping of template.mappings || []) {
        mappings.push({
          dimension_id: mapping.dimension_id,
          evaluator_id: mapping.evaluator_id,
          test_case_ids: testCaseIds, // 所有题目
          system_prompt: undefined // 统一模板不在维度级别设置角色
        });
        totalEvaluations += testCaseIds.length;
      }
    } else {
      // 自定义模板：支持用户选择的测试用例
      for (const mapping of template.custom_mappings || []) {
        // 决策：如果用户提供了测试用例，则与模板配置的测试用例取交集
        // 这样既尊重用户选择，又保持模板的专业配置
        let finalTestCaseIds = mapping.test_case_ids;
        
        if (testCaseIds.length > 0) {
          // 取用户选择与模板配置的交集
          const templateTestCaseSet = new Set(mapping.test_case_ids);
          finalTestCaseIds = testCaseIds.filter(id => templateTestCaseSet.has(id));
          
          // 如果交集为空，说明用户选择的测试用例与该维度的配置不匹配
          // 此时回退到模板配置的测试用例，并记录警告
          if (finalTestCaseIds.length === 0) {
            console.warn(`维度 ${mapping.dimension_id} 配置的测试用例与用户选择无交集，使用模板配置`);
            finalTestCaseIds = mapping.test_case_ids;
          }
        }
        
        mappings.push({
          dimension_id: mapping.dimension_id,
          evaluator_id: mapping.evaluator_id,
          test_case_ids: finalTestCaseIds,
          system_prompt: mapping.system_prompt
        });
        totalEvaluations += finalTestCaseIds.length;
      }
    }

    return {
      template_id: templateId,
      template_type: template.template_type,
      mappings,
      totalEvaluations
    };
  }

  /**
   * 获取自定义映射（用于执行引擎）
   */
  async getCustomMapping(
    templateId: string, 
    dimensionId: string
  ): Promise<CustomTemplateMapping | null> {
    // 如果custom_mappings表不存在，返回null（向后兼容）
    try {
      const { data, error } = await this.supabase
        .from('template_custom_mappings')
        .select('*')
        .eq('template_id', templateId)
        .eq('dimension_id', dimensionId)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        id: data.id,
        template_id: data.template_id,
        dimension_id: data.dimension_id,
        evaluator_id: data.evaluator_id,
        test_case_ids: data.test_case_ids || [],
        system_prompt: data.system_prompt,
        created_at: data.created_at
      };
    } catch (error) {
      // 表不存在或其他错误，返回null
      return null;
    }
  }

  // 私有方法：构建统一模板
  private async buildUnifiedTemplate(template: any): Promise<UnifiedTemplate> {
    const { data: mappings } = await this.supabase
      .from('template_mappings')
      .select('*')
      .eq('template_id', template.id);

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      status: template.status,
      template_type: 'unified',
      created_at: template.created_at,
      updated_at: template.updated_at,
      mappings: mappings || [],
      dimensions_count: new Set(mappings?.map(m => m.dimension_id)).size,
      evaluators_count: new Set(mappings?.map(m => m.evaluator_id)).size
    };
  }

  // 私有方法：构建自定义模板
  private async buildCustomTemplate(template: any): Promise<CustomTemplate> {
    try {
      const { data: customMappings } = await this.supabase
        .from('template_custom_mappings')
        .select('*')
        .eq('template_id', template.id);

      const mappings = customMappings || [];
      const totalTestCases = mappings.reduce((sum, m) => sum + (m.test_case_ids?.length || 0), 0);

      return {
        id: template.id,
        name: template.name,
        description: template.description,
        status: template.status,
        template_type: 'custom',
        created_at: template.created_at,
        updated_at: template.updated_at,
        custom_mappings: mappings,
        dimensions_count: new Set(mappings.map(m => m.dimension_id)).size,
        evaluators_count: new Set(mappings.map(m => m.evaluator_id)).size,
        total_test_cases: totalTestCases
      };
    } catch (error) {
      // 如果custom_mappings表不存在，返回空的自定义模板
      return {
        id: template.id,
        name: template.name,
        description: template.description,
        status: template.status,
        template_type: 'custom',
        created_at: template.created_at,
        updated_at: template.updated_at,
        custom_mappings: [],
        dimensions_count: 0,
        evaluators_count: 0,
        total_test_cases: 0
      };
    }
  }

  // 私有方法：构建统一模板详情
  private async buildUnifiedTemplateDetail(template: any): Promise<TemplateDetail> {
    const unifiedTemplate = await this.buildUnifiedTemplate(template);
    
    // 获取关联的维度和评分器信息
    const dimensionIds = [...new Set(unifiedTemplate.mappings.map(m => m.dimension_id))];
    const evaluatorIds = [...new Set(unifiedTemplate.mappings.map(m => m.evaluator_id))];

    const [dimensions, evaluators] = await Promise.all([
      this.getDimensions(dimensionIds),
      this.getEvaluators(evaluatorIds)
    ]);

    return {
      ...unifiedTemplate,
      dimensions,
      evaluators
    };
  }

  // 私有方法：构建自定义模板详情
  private async buildCustomTemplateDetail(template: any): Promise<TemplateDetail> {
    const customTemplate = await this.buildCustomTemplate(template);
    
    const dimensionIds = [...new Set(customTemplate.custom_mappings.map(m => m.dimension_id))];
    const evaluatorIds = [...new Set(customTemplate.custom_mappings.map(m => m.evaluator_id))];
    const testCaseIds = [...new Set(customTemplate.custom_mappings.flatMap(m => m.test_case_ids))];

    const [dimensions, evaluators, testCases] = await Promise.all([
      this.getDimensions(dimensionIds),
      this.getEvaluators(evaluatorIds),
      this.getTestCases(testCaseIds)
    ]);

    return {
      ...customTemplate,
      dimensions,
      evaluators,
      test_cases: testCases
    };
  }

  // 工具方法
  private async getDimensions(ids: string[]) {
    if (ids.length === 0) return [];
    const { data } = await this.supabase
      .from('dimensions')
      .select('id, name, description')
      .in('id', ids);
    return data || [];
  }

  private async getEvaluators(ids: string[]) {
    if (ids.length === 0) return [];
    const { data } = await this.supabase
      .from('evaluators')
      .select('id, name, type')
      .in('id', ids);
    return data || [];
  }

  private async getTestCases(ids: string[]) {
    if (ids.length === 0) return [];
    const { data } = await this.supabase
      .from('test_cases')
      .select('id, input, reference_answer')
      .in('id', ids);
    return data || [];
  }

  private async createUnifiedMappings(templateId: string, mappings: any[]) {
    const records = mappings.map(m => ({
      template_id: templateId,
      dimension_id: m.dimension_id,
      evaluator_id: m.evaluator_id
      // 移除权重字段 - 系统现在使用算术平均分
    }));

    const { error } = await this.supabase
      .from('template_mappings')
      .insert(records);

    if (error) {
      throw new Error(`创建统一模板映射失败: ${error.message}`);
    }
  }

  private async createCustomMappings(templateId: string, mappings: any[]) {
    // 验证测试用例ID的存在性
    const allTestCaseIds = [...new Set(mappings.flatMap(m => m.test_case_ids))];
    if (allTestCaseIds.length > 0) {
      const { data: existingTestCases, error: validationError } = await this.supabase
        .from('test_cases')
        .select('id')
        .in('id', allTestCaseIds);

      if (validationError) {
        throw new Error(`验证测试用例失败: ${validationError.message}`);
      }

      const existingIds = new Set(existingTestCases?.map(tc => tc.id) || []);
      const invalidIds = allTestCaseIds.filter(id => !existingIds.has(id));
      
      if (invalidIds.length > 0) {
        throw new Error(`以下测试用例ID不存在: ${invalidIds.join(', ')}`);
      }
    }

    const records = mappings.map(m => ({
      template_id: templateId,
      dimension_id: m.dimension_id,
      evaluator_id: m.evaluator_id,
      test_case_ids: m.test_case_ids,
      system_prompt: m.system_prompt
      // 移除权重字段 - 系统现在使用算术平均分
    }));

    console.log('🔧 插入自定义映射记录:', JSON.stringify(records, null, 2));

    const { error } = await this.supabase
      .from('template_custom_mappings')
      .insert(records);

    if (error) {
      console.error('🚨 数据库插入错误详情:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        records: records
      });
      
      // 根据错误类型提供更具体的错误信息
      if (error.code === '42P01') { // 表不存在
        throw new Error('自定义模板功能需要先执行数据库迁移。请联系管理员运行迁移脚本。');
      } else if (error.code === '23503') { // 外键约束错误
        throw new Error('引用的维度、评分器或测试用例不存在，请检查数据完整性。');
      } else if (error.code === '23505') { // 唯一约束错误
        throw new Error('模板中存在重复的维度-评分器组合，请检查配置。');
      } else {
        throw new Error(`创建自定义模板映射失败: ${error.message} (错误代码: ${error.code || 'unknown'})`);
      }
    }
  }

  /**
   * 更新模板映射关系（用于编辑模板）
   */
  async updateTemplateMappings(
    templateId: string,
    data: {
      template_type: 'unified' | 'custom';
      mappings?: any[];
      custom_mappings?: any[];
    }
  ): Promise<void> {
    if (data.template_type === 'unified' && data.mappings) {
      // 删除旧的统一映射
      await this.supabase
        .from('template_mappings')
        .delete()
        .eq('template_id', templateId);

      // 创建新的统一映射
      await this.createUnifiedMappings(templateId, data.mappings);
    } else if (data.template_type === 'custom' && data.custom_mappings) {
      // 删除旧的自定义映射
      await this.supabase
        .from('template_custom_mappings')
        .delete()
        .eq('template_id', templateId);

      // 创建新的自定义映射
      await this.createCustomMappings(templateId, data.custom_mappings);
    }
  }

  /**
   * 🆕 Bug #5修复: 验证多模态兼容性
   * 检查评分器模型是否支持测试用例所需的多模态能力
   */
  async validateMultimodalCompatibility(
    evaluatorId: string,
    testCaseIds: string[]
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 1. 获取评分器及其模型信息
      const { data: evaluator, error: evalError } = await this.supabase
        .from('evaluators')
        .select(`
          id,
          name,
          model_id,
          models (
            id,
            name,
            input_modalities,
            vision_enabled
          )
        `)
        .eq('id', evaluatorId)
        .single();

      if (evalError || !evaluator) {
        errors.push(`无法获取评分器信息: ${evalError?.message || '评分器不存在'}`);
        return { valid: false, errors, warnings };
      }

      const model = evaluator.models as any;
      if (!model) {
        errors.push(`评分器 "${evaluator.name}" 未关联有效的模型`);
        return { valid: false, errors, warnings };
      }

      // 2. 获取所有测试用例的多模态信息
      const { data: testCases, error: tcError } = await this.supabase
        .from('test_cases')
        .select('id, input, input_type, modalities, attachments')
        .in('id', testCaseIds);

      if (tcError) {
        errors.push(`获取测试用例信息失败: ${tcError.message}`);
        return { valid: false, errors, warnings };
      }

      if (!testCases || testCases.length === 0) {
        warnings.push('未找到任何测试用例');
        return { valid: true, errors, warnings };
      }

      // 3. 检查每个测试用例的多模态兼容性
      const inputModalities = Array.isArray(model.input_modalities)
        ? model.input_modalities
        : ['text'];

      for (const testCase of testCases) {
        // 跳过纯文本测试用例
        if (testCase.input_type === 'text' || !testCase.modalities) {
          continue;
        }

        const modalities = testCase.modalities || {};
        const testCasePreview = testCase.input?.substring(0, 50) || testCase.id;

        // 检查图像支持
        if (modalities.image && !model.vision_enabled) {
          errors.push(
            `测试用例 "${testCasePreview}..." 包含图片，但模型 "${model.name}" 不支持图像理解（vision_enabled=false）`
          );
        }

        // 检查音频支持
        if (modalities.audio && !inputModalities.includes('audio')) {
          errors.push(
            `测试用例 "${testCasePreview}..." 包含音频，但模型 "${model.name}" 不支持音频输入`
          );
        }

        // 检查视频支持
        if (modalities.video && !inputModalities.includes('video')) {
          errors.push(
            `测试用例 "${testCasePreview}..." 包含视频，但模型 "${model.name}" 不支持视频输入`
          );
        }

        // 如果有附件但没有设置input_type为multimodal，给出警告
        if (testCase.attachments && Array.isArray(testCase.attachments) && testCase.attachments.length > 0) {
          if (testCase.input_type !== 'multimodal') {
            warnings.push(
              `测试用例 "${testCasePreview}..." 有附件但input_type不是multimodal，可能导致附件被忽略`
            );
          }
        }
      }

      // 4. 返回验证结果
      return {
        valid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      errors.push(`验证过程发生错误: ${error instanceof Error ? error.message : '未知错误'}`);
      return { valid: false, errors, warnings };
    }
  }

  /**
   * 🆕 Bug #5修复: 检查测试用例与模型的兼容性（单个检查）
   * 用于UI实时提示
   */
  async isTestCaseCompatibleWithModel(
    testCaseId: string,
    modelId: string
  ): Promise<{ compatible: boolean; reason?: string }> {
    try {
      // 获取测试用例信息
      const { data: testCase, error: tcError } = await this.supabase
        .from('test_cases')
        .select('input_type, modalities, attachments')
        .eq('id', testCaseId)
        .single();

      if (tcError || !testCase) {
        return { compatible: false, reason: '测试用例不存在' };
      }

      // 纯文本测试用例与所有模型兼容
      if (testCase.input_type === 'text' || !testCase.modalities) {
        return { compatible: true };
      }

      // 获取模型信息
      const { data: model, error: modelError } = await this.supabase
        .from('models')
        .select('name, input_modalities, vision_enabled')
        .eq('id', modelId)
        .single();

      if (modelError || !model) {
        return { compatible: false, reason: '模型不存在' };
      }

      const modalities = testCase.modalities || {};
      const inputModalities = Array.isArray(model.input_modalities)
        ? model.input_modalities
        : ['text'];

      // 检查各种模态支持
      if (modalities.image && !model.vision_enabled) {
        return { compatible: false, reason: `模型 "${model.name}" 不支持图像理解` };
      }

      if (modalities.audio && !inputModalities.includes('audio')) {
        return { compatible: false, reason: `模型 "${model.name}" 不支持音频输入` };
      }

      if (modalities.video && !inputModalities.includes('video')) {
        return { compatible: false, reason: `模型 "${model.name}" 不支持视频输入` };
      }

      return { compatible: true };

    } catch (error) {
      return {
        compatible: false,
        reason: `检查失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }
}

// 导出单例实例
export const templateService = new TemplateService();