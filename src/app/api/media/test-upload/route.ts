/**
 * 测试上传API - 使用service role key绕过RLS
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 开始测试上传...');

    // 使用 service role key 绕过 RLS
    // 服务器端优先使用 SUPABASE_URL
    const isServer = typeof window === 'undefined';
    const supabaseUrl = isServer
      ? (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
      : process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: '缺少 Supabase 配置（需要 service role key）' },
        { status: 500 }
      );
    }

    // 检测本地PostgREST模式
    const isLocalMode = supabaseUrl.includes('postgrest') ||
                        supabaseUrl.includes('localhost:3001') ||
                        supabaseUrl.includes('127.0.0.1:3001');

    if (isLocalMode) {
      return NextResponse.json(
        {
          error: '本地PostgREST模式不支持Storage功能',
          message: '请参考 docs/storage-options.md 配置混合模式或MinIO',
          mode: 'local'
        },
        { status: 501 } // 501 Not Implemented
      );
    }

    // 创建具有管理员权限的客户端
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: '没有找到上传的文件' },
        { status: 400 }
      );
    }

    console.log('📁 文件信息:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

    // 转换文件为 Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 生成安全的文件名
    const timestamp = Date.now();

    // 获取文件扩展名
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'bin';

    // 生成安全的文件名（仅包含ASCII字符）
    const safeFileName = file.name
      .replace(/[^\w\-_.]/g, '') // 移除非ASCII字符
      .replace(/\s+/g, '_')      // 空格替换为下划线
      .substring(0, 50);         // 限制长度

    // 如果处理后文件名为空，使用默认名称
    const baseName = safeFileName || 'uploaded_file';

    // 确保文件名包含正确的扩展名
    const finalFileName = baseName.endsWith(`.${fileExtension}`)
      ? baseName
      : `${baseName}.${fileExtension}`;

    const fileName = `test/${timestamp}_${finalFileName}`;

    console.log('📤 上传到:', fileName);

    // 上传到 Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('media-assets')
      .upload(fileName, buffer, {
        contentType: file.type,
        cacheControl: '3600'
      });

    if (uploadError) {
      console.error('❌ 上传失败:', uploadError);
      return NextResponse.json(
        { error: '文件上传失败', details: uploadError.message },
        { status: 500 }
      );
    }

    console.log('✅ 上传成功:', uploadData);

    // 获取公共 URL
    const { data: urlData } = supabase.storage
      .from('media-assets')
      .getPublicUrl(fileName);

    console.log('🔗 公共 URL:', urlData.publicUrl);

    // 创建简化的媒体记录（不涉及复杂的RLS）
    const { data: mediaRecord, error: dbError } = await supabase
      .from('media_assets')
      .insert({
        file_name: uploadData.path,
        original_name: file.name,
        file_type: file.type.startsWith('image/') ? 'image' : 'other',
        mime_type: file.type,
        file_size: file.size,
        storage_type: 'supabase',
        storage_path: uploadData.path,
        public_url: urlData.publicUrl,
        upload_status: 'completed',
        uploaded_by: 'test-system'
      })
      .select()
      .single();

    if (dbError) {
      console.warn('⚠️ 数据库记录创建失败:', dbError);
      // 不阻止上传成功，只是警告
    } else {
      console.log('✅ 数据库记录创建成功:', mediaRecord?.id);
    }

    return NextResponse.json({
      success: true,
      message: '测试上传成功',
      file: {
        originalName: file.name,        // 原始文件名
        safeName: finalFileName,        // 安全文件名
        size: file.size,
        type: file.type
      },
      storage: {
        path: uploadData.path,
        fullPath: uploadData.fullPath,
        publicUrl: urlData.publicUrl
      },
      database: {
        created: !dbError,
        id: mediaRecord?.id,
        error: dbError?.message
      },
      mapping: {
        originalFileName: file.name,
        storagePath: uploadData.path,
        timestamp: timestamp,
        uploadTime: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('💥 测试上传异常:', error);
    return NextResponse.json(
      {
        error: '服务器错误',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
}