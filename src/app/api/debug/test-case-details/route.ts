import { createClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testCaseId = searchParams.get('testCaseId') || '4344b2a9-58a2-4903-b622-2461fc57bbc9';

    const supabase = createClient();

    // Get detailed test case information including max_score
    const { data: testCase, error } = await supabase
      .from('test_cases')
      .select('*')
      .eq('id', testCaseId)
      .single();

    if (error) {
      return NextResponse.json({ error: `Error querying test_cases: ${error.message}` }, { status: 500 });
    }

    if (!testCase) {
      return NextResponse.json({
        message: 'Test case not found',
        testCaseId
      }, { status: 404 });
    }

    // Also check other test cases to see max_score distribution
    const { data: sampleTestCases } = await supabase
      .from('test_cases')
      .select('id, max_score')
      .neq('max_score', null)
      .limit(20);

    // Check if there are other test cases with all scores being 12
    const { data: otherResults } = await supabase
      .from('evaluation_results')
      .select('test_case_id, score')
      .neq('test_case_id', testCaseId)
      .eq('score', 12)
      .limit(100);

    // Group by test case ID to see patterns
    const scorePatterns = otherResults?.reduce((acc: Record<string, number>, result) => {
      acc[result.test_case_id] = (acc[result.test_case_id] || 0) + 1;
      return acc;
    }, {}) || {};

    return NextResponse.json({
      testCase,
      sampleMaxScores: sampleTestCases?.map(tc => ({ id: tc.id, max_score: tc.max_score })) || [],
      otherTestCasesWith12: Object.entries(scorePatterns)
        .filter(([_, count]) => count > 10) // Cases with more than 10 results of score 12
        .map(([id, count]) => ({ test_case_id: id, count_of_12_scores: count }))
    });

  } catch (error) {
    console.error('Error in test case details:', error);
    return NextResponse.json({
      error: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }, { status: 500 });
  }
}