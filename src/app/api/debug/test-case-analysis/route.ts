import { createClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testCaseId = searchParams.get('testCaseId') || '4344b2a9-58a2-4903-b622-2461fc57bbc9';

    const supabase = createClient();

    console.log(`🔍 Analyzing test case ID: ${testCaseId}`);

    // 1. Get all evaluation results for this test case
    const { data: results, error } = await supabase
      .from('evaluation_results')
      .select('*')
      .eq('test_case_id', testCaseId)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: `Error querying evaluation_results: ${error.message}` }, { status: 500 });
    }

    if (!results || results.length === 0) {
      return NextResponse.json({
        message: 'No evaluation results found for this test case ID',
        testCaseId
      });
    }

    // 2. Analyze scores
    const scores = results.map(r => r.score).filter(s => s !== null);
    const uniqueScores = [...new Set(scores)];

    // Score distribution
    const scoreDistribution: Record<number, number> = {};
    scores.forEach(score => {
      scoreDistribution[score] = (scoreDistribution[score] || 0) + 1;
    });

    // 3. Get test case details
    const { data: testCase } = await supabase
      .from('test_cases')
      .select('*')
      .eq('id', testCaseId)
      .single();

    // 4. Analyze by evaluator
    const evaluatorGroups = results.reduce((acc, result) => {
      if (!acc[result.evaluator_id]) acc[result.evaluator_id] = [];
      acc[result.evaluator_id].push(result);
      return acc;
    }, {} as Record<string, any[]>);

    // Get evaluator details for each group
    const evaluatorAnalysis = [];
    for (const [evaluatorId, evalResults] of Object.entries(evaluatorGroups)) {
      const evalScores = evalResults.map(r => r.score).filter(s => s !== null);
      const allSame = evalScores.length > 0 && evalScores.every(s => s === evalScores[0]);

      const { data: evaluator } = await supabase
        .from('evaluators')
        .select('name, type, config')
        .eq('id', evaluatorId)
        .single();

      evaluatorAnalysis.push({
        evaluatorId,
        evaluator,
        resultCount: evalResults.length,
        scores: evalScores,
        allSameScore: allSame,
        sampleResults: evalResults.slice(0, 2).map(r => ({
          id: r.id,
          score: r.score,
          status: r.status,
          justification: r.justification ? r.justification.substring(0, 200) + '...' : null,
          error_message: r.error_message
        }))
      });
    }

    // 5. Status analysis
    const statusCounts = results.reduce((acc, result) => {
      acc[result.status] = (acc[result.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // 6. Time analysis
    const timestamps = results.map(r => new Date(r.created_at));
    const minTime = Math.min(...timestamps.map(t => t.getTime()));
    const maxTime = Math.max(...timestamps.map(t => t.getTime()));
    const timeSpanHours = (maxTime - minTime) / (1000 * 60 * 60);

    // 7. Error analysis
    const resultsWithErrors = results.filter(r => r.error_message);

    // 8. Data issue analysis
    const potentialIssues = [];

    if (uniqueScores.length === 1 && uniqueScores[0] === 12) {
      potentialIssues.push({
        type: 'uniform_scores',
        severity: 'high',
        description: 'All scores are exactly 12',
        possibleCauses: [
          'Evaluator configured with fixed score of 12',
          'Scoring logic defaulting to 12',
          'Data corruption or incorrect evaluator configuration',
          'All test responses genuinely deserving perfect/near-perfect score'
        ]
      });
    }

    if (timeSpanHours < 0.01) {
      potentialIssues.push({
        type: 'batch_processing_issue',
        severity: 'medium',
        description: 'All results created within minutes',
        possibleCauses: ['Batch processing issue', 'System clock issue', 'Rapid evaluation']
      });
    }

    const analysis = {
      testCaseId,
      testCase: testCase ? {
        input: testCase.input ? testCase.input.substring(0, 300) + '...' : null,
        reference_answer: testCase.reference_answer ? testCase.reference_answer.substring(0, 300) + '...' : null,
        created_at: testCase.created_at
      } : null,
      summary: {
        totalResults: results.length,
        resultsWithScores: scores.length,
        uniqueScores,
        allScoresAre12: scores.every(s => s === 12),
        scoreDistribution,
        statusDistribution: statusCounts
      },
      evaluatorAnalysis,
      timeAnalysis: {
        firstResult: new Date(minTime).toISOString(),
        lastResult: new Date(maxTime).toISOString(),
        timeSpanHours: parseFloat(timeSpanHours.toFixed(2))
      },
      errorAnalysis: {
        resultsWithErrors: resultsWithErrors.length,
        sampleErrors: resultsWithErrors.slice(0, 3).map(r => r.error_message)
      },
      potentialIssues
    };

    return NextResponse.json(analysis);

  } catch (error) {
    console.error('Error in test case analysis:', error);
    return NextResponse.json({
      error: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }, { status: 500 });
  }
}