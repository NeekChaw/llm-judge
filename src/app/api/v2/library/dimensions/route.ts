import { supabase } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // 构建查询
    let query = supabase
      .from('dimensions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // 分页
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch dimensions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      dimensions: data,
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit
      }
    });
  } catch (error) {
    console.error('Error fetching dimensions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dimensions' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('dimensions')
      .insert([{ name, description }])
      .select()
      .single();

    if (error) {
      console.error('Supabase error creating dimension:', JSON.stringify(error, null, 2));
      return NextResponse.json(
        { error: 'Failed to create dimension', details: error.message || error },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creating dimension:', error);
    return NextResponse.json(
      { error: 'Failed to create dimension' },
      { status: 500 }
    );
  }
}