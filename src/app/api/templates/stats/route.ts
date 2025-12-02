import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

// GET /api/templates/stats - 获取模板统计信息
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();

    // 获取模板总数和状态分布
    const { data: templates, error: templatesError } = await supabase
      .from('templates')
      .select('id, status');

    if (templatesError) {
      console.error('Templates stats error:', templatesError);
      return NextResponse.json({ error: '获取模板统计失败' }, { status: 500 });
    }

    // 获取映射数量分布
    const { data: mappings, error: mappingsError } = await supabase
      .from('template_mappings')
      .select('template_id');

    if (mappingsError) {
      console.error('Template mappings stats error:', mappingsError);
      return NextResponse.json({ error: '获取映射统计失败' }, { status: 500 });
    }

    // 计算统计信息
    const total = templates?.length || 0;
    
    // 按状态分组
    const byStatus = templates?.reduce((acc: Record<string, number>, template) => {
      acc[template.status] = (acc[template.status] || 0) + 1;
      return acc;
    }, {}) || {};

    // 按映射数量分组
    const mappingCounts = mappings?.reduce((acc: Record<string, number>, mapping) => {
      acc[mapping.template_id] = (acc[mapping.template_id] || 0) + 1;
      return acc;
    }, {}) || {};

    const byDimensionCount = Object.values(mappingCounts).reduce((acc: Record<string, number>, count) => {
      const key = count.toString();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    // 计算平均映射数
    const totalMappings = Object.values(mappingCounts).reduce((sum: number, count) => sum + count, 0);
    const avgMappingsPerTemplate = total > 0 ? totalMappings / total : 0;

    const stats = {
      total,
      by_status: byStatus,
      by_dimension_count: byDimensionCount,
      avg_mappings_per_template: Math.round(avgMappingsPerTemplate * 100) / 100
    };

    return NextResponse.json({ stats });

  } catch (error) {
    console.error('Template stats error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}