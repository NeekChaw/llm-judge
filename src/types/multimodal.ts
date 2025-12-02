/**
 * 多模态支持的类型定义
 */

export type ModalityType = 'text' | 'image' | 'audio' | 'video';

export interface MediaAsset {
  id: string;
  file_name: string;
  original_name?: string;
  file_type: 'image' | 'audio' | 'video' | 'document';
  mime_type: string;
  file_size: number;
  storage_type: 'supabase' | 's3' | 'local' | 'url';
  storage_path: string;
  public_url?: string;
  metadata: Record<string, any>;
  upload_status: 'pending' | 'completed' | 'failed';
  uploaded_by?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface ContentAttachment {
  type: ModalityType;
  url?: string; // 公开URL或相对路径
  base64?: string; // Base64编码数据
  media_id?: string; // 关联的媒体资产ID
  description?: string;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    format?: string;
    [key: string]: any;
  };
}

export interface MultimodalTestCase {
  id: string;
  input: string; // 文本部分
  input_type: 'text' | 'multimodal';
  modalities: Record<ModalityType, boolean>;
  attachments: ContentAttachment[];
  reference_answer?: string;
  created_at: string;
  updated_at: string;
}

export interface MultimodalModel {
  id: string;
  name: string;
  provider: string;
  input_modalities: ModalityType[];
  output_modalities: ModalityType[];
  vision_enabled: boolean;
  image_generation_enabled: boolean;
  // ... 其他字段
}

export interface MultimodalLLMRequest {
  model_id: string;
  system_prompt?: string;
  user_prompt: string;
  attachments?: ContentAttachment[]; // 输入的附件
  modalities?: ModalityType[]; // 期望的输出模态
  temperature?: number;
  max_tokens?: number;
  // ... 其他LLM参数
}

export interface MultimodalLLMResponse {
  content: string;
  attachments?: ContentAttachment[]; // 模型生成的附件（如图像）
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  model: string;
  finish_reason: string;
  response_time: number;
  modalities_used: {
    input: ModalityType[];
    output: ModalityType[];
  };
}

export interface MultimodalEvaluationResult {
  id: string;
  task_id: string;
  test_case_id: string;
  model_id: string;
  model_response: any; // 原始响应JSON
  response_attachments: ContentAttachment[]; // 模型生成的附件
  input_modalities_used: ModalityType[];
  output_modalities_generated: ModalityType[];
  score: number;
  justification: string;
  // ... 其他字段
}

// 用于前端组件的数据结构
export interface MediaUploadResult {
  success: boolean;
  media_asset?: MediaAsset;
  error?: string;
}

export interface TestCaseFormData {
  input: string;
  input_type: 'text' | 'multimodal';
  attachments: File[] | ContentAttachment[];
  reference_answer?: string;
  tags?: string[];
}