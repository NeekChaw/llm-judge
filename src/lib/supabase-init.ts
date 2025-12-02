// 直接使用Supabase客户端初始化数据库
import { supabase } from './db';

export async function initializeSupabaseDatabase() {
  try {
    console.log('🚀 开始初始化Supabase数据库...');
    
    // 1. 检查并创建dimensions表数据
    console.log('📝 初始化维度数据...');
    const dimensionsData = [
      { name: '代码质量', description: '评估代码的可读性、可维护性和最佳实践' },
      { name: '功能正确性', description: '评估代码是否正确实现了预期功能' },
      { name: '安全性', description: '评估代码的安全性和潜在漏洞' }
    ];
    
    for (const dimension of dimensionsData) {
      const { data, error } = await supabase
        .from('dimensions')
        .select('id')
        .eq('name', dimension.name)
        .single();
      
      if (error && error.code === 'PGRST116') {
        // 数据不存在，创建新的
        const { error: insertError } = await supabase
          .from('dimensions')
          .insert([dimension]);
        
        if (insertError) {
          console.error(`❌ 插入维度 "${dimension.name}" 失败:`, insertError);
        } else {
          console.log(`✅ 创建维度: ${dimension.name}`);
        }
      } else if (data) {
        console.log(`✅ 维度已存在: ${dimension.name}`);
      } else {
        console.error(`❌ 检查维度 "${dimension.name}" 时出错:`, error);
      }
    }
    
    // 2. 检查并创建models表数据
    console.log('🤖 初始化模型数据...');
    const modelsData = [
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
    ];
    
    for (const model of modelsData) {
      const { data, error } = await supabase
        .from('models')
        .select('id')
        .eq('name', model.name)
        .single();
      
      if (error && error.code === 'PGRST116') {
        // 数据不存在，创建新的
        const { error: insertError } = await supabase
          .from('models')
          .insert([model]);
        
        if (insertError) {
          console.error(`❌ 插入模型 "${model.name}" 失败:`, insertError);
        } else {
          console.log(`✅ 创建模型: ${model.name}`);
        }
      } else if (data) {
        console.log(`✅ 模型已存在: ${model.name}`);
      } else {
        console.error(`❌ 检查模型 "${model.name}" 时出错:`, error);
      }
    }
    
    // 3. 验证数据
    console.log('🔍 验证数据库状态...');
    const { data: dimensionsCount, error: dimensionsError } = await supabase
      .from('dimensions')
      .select('*', { count: 'exact' });
    
    const { data: modelsCount, error: modelsError } = await supabase
      .from('models')
      .select('*', { count: 'exact' });
    
    if (dimensionsError) {
      console.error('❌ 验证dimensions表失败:', dimensionsError);
    } else {
      console.log(`✅ Dimensions表: ${dimensionsCount?.length || 0} 条记录`);
    }
    
    if (modelsError) {
      console.error('❌ 验证models表失败:', modelsError);
    } else {
      console.log(`✅ Models表: ${modelsCount?.length || 0} 条记录`);
    }
    
    console.log('🎉 数据库初始化完成!');
    
    return {
      success: true,
      dimensions: dimensionsCount?.length || 0,
      models: modelsCount?.length || 0
    };
    
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    throw error;
  }
}

// 检查数据库连接状态
export async function checkSupabaseConnection() {
  try {
    const { data, error } = await supabase
      .from('dimensions')
      .select('count', { count: 'exact' })
      .limit(1);
    
    if (error) {
      return {
        connected: false,
        error: error.message,
        details: error
      };
    }
    
    return {
      connected: true,
      message: 'Supabase连接正常'
    };
    
  } catch (error) {
    return {
      connected: false,
      error: 'Supabase连接失败',
      details: error
    };
  }
}