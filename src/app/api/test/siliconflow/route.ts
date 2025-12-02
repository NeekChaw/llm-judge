import { siliconFlowClient, SiliconFlowClient } from '@/lib/siliconflow';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { model, message } = await request.json();

    if (!model || !message) {
      return NextResponse.json(
        { error: 'Model and message are required' },
        { status: 400 }
      );
    }

    const response = await siliconFlowClient.chatCompletion({
      model: SiliconFlowClient.MODELS[model as keyof typeof SiliconFlowClient.MODELS] || model,
      messages: [
        {
          role: 'user',
          content: message
        }
      ],
      max_tokens: 100,
      temperature: 0.7
    });

    return NextResponse.json({
      success: true,
      response: response.choices[0].message.content,
      usage: response.usage,
      model: response.model
    });

  } catch (error) {
    console.error('Error testing SiliconFlow:', error);
    return NextResponse.json(
      { 
        error: 'Failed to connect to SiliconFlow',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// 获取可用模型列表
export async function GET() {
  try {
    return NextResponse.json({
      models: SiliconFlowClient.MODELS,
      message: 'SiliconFlow client initialized successfully'
    });
  } catch (error) {
    console.error('Error initializing SiliconFlow:', error);
    return NextResponse.json(
      { 
        error: 'Failed to initialize SiliconFlow client',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}