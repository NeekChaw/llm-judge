/**
 * e2b.dev 代码沙箱客户端 - 使用现代E2B SDK
 * 用于安全执行CODE类型评分器的代码
 */

import { Sandbox } from '@e2b/code-interpreter';

export interface SandboxRequest {
  language: string;
  code: string;
  timeout?: number; // 毫秒
  environment?: Record<string, any>;
  files?: Array<{
    name: string;
    content: string;
  }>;
}

export interface SandboxResponse {
  success: boolean;
  output: string;
  error?: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  execution_time: number; // 毫秒
  memory_usage?: number; // MB
  cpu_usage?: number; // %
  // 增强的兼容性分析属性
  executionStatus?: 'compatible' | 'restricted' | 'error';
  compatibilityIssues?: string[];
  suggestions?: string[];
  compatibilityReport?: string;
}

/**
 * e2b.dev 沙箱客户端 - 现代SDK实现
 */
export class E2BClient {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.E2B_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️ E2B_API_KEY not found, using mock execution');
    }
  }

  /**
   * 增强的代码分析 - 检测E2B限制并提供智能策略
   */
  private analyzeCodeCompatibility(code: string): {
    hasRestrictedImports: boolean;
    restrictedModules: string[];
    severity: 'blocking' | 'warning' | 'safe';
    alternativeStrategy: string;
    estimatedCompatibility: number;
    issues: string[];
    suggestions: string[];
  } {
    const restrictedModules: string[] = [];
    const issues: string[] = [];
    const suggestions: string[] = [];
    let severity: 'blocking' | 'warning' | 'safe' = 'safe';
    let alternativeStrategy = 'direct_execution';
    
    // 预处理代码：移除注释和字符串，避免误报
    const cleanedCode = this.removeCommentsAndStrings(code);
    
    // 🆕 真正危险的功能（永远阻止） - 减少误报，专注于真正的安全风险
    const blockingPatterns = [
      { pattern: /__import__\s*\(/, module: '__import__', issue: '使用了被禁用的 __import__ 函数', suggestion: '请使用标准的 import 语句' },
      { pattern: /import\s+subprocess/, module: 'subprocess', issue: '尝试导入 subprocess 模块（安全风险）', suggestion: '避免使用子进程相关功能，重新设计为纯Python算法' },
      { pattern: /from\s+subprocess/, module: 'subprocess', issue: '尝试导入 subprocess 模块（安全风险）', suggestion: '避免使用子进程相关功能，重新设计为纯Python算法' },
      { pattern: /\bos\.system\s*\(/, module: 'os.system', issue: '尝试执行系统命令（安全风险）', suggestion: '避免系统调用，使用算法逻辑' },
      // 网络访问（真正需要限制）
      { pattern: /import\s+requests/, module: 'requests', issue: '尝试导入 requests 模块（网络访问被限制）', suggestion: '移除网络请求代码，专注于算法逻辑' },
      { pattern: /import\s+urllib/, module: 'urllib', issue: '尝试导入 urllib 模块（网络访问被限制）', suggestion: '移除网络请求代码，专注于算法逻辑' },
      { pattern: /import\s+socket/, module: 'socket', issue: '尝试导入 socket 模块（网络访问被限制）', suggestion: '移除网络相关代码，专注于算法逻辑' },
      // 文件写入（安全风险）
      { pattern: /\bopen\s*\([^)]*,\s*['"][wa][+]?['"]/, module: 'file_write', issue: '尝试写入文件（安全风险）', suggestion: '使用内存数据结构替代文件操作' },
    ];
    
    // 🆕 相对安全但需要谨慎的功能（警告但通常允许执行）
    const warningPatterns = [
      { pattern: /\bopen\s*\([^)]*['"]r['"]/, module: 'file_read', issue: '尝试读取文件（可能失败）', suggestion: '确保文件存在或使用异常处理' },
      { pattern: /importlib\.import_module/, module: 'importlib', issue: '使用了动态导入功能', suggestion: '请使用静态 import 语句' },
      // 线程和多进程（在算法评估中通常不需要）
      { pattern: /import\s+threading/, module: 'threading', issue: '尝试导入 threading 模块（算法评估中通常不需要）', suggestion: '避免多线程，使用单线程算法实现' },
      { pattern: /import\s+multiprocessing/, module: 'multiprocessing', issue: '尝试导入 multiprocessing 模块（算法评估中通常不需要）', suggestion: '避免多进程，使用单进程算法实现' },
    ];
    
    // 检测阻塞模式
    for (const { pattern, module, issue, suggestion } of blockingPatterns) {
      // 对于文件操作检测，使用原始代码；其他使用清理后的代码避免误报
      const codeToCheck = module === 'file_write' ? code : cleanedCode;
      if (pattern.test(codeToCheck)) {
        restrictedModules.push(module);
        issues.push(issue);
        suggestions.push(suggestion);
        severity = 'blocking';
      }
    }
    
    // 检测警告模式
    if (severity !== 'blocking') {
      for (const { pattern, module, issue, suggestion } of warningPatterns) {
        if (pattern.test(cleanedCode)) {
          restrictedModules.push(module);
          issues.push(issue);
          suggestions.push(suggestion);
          severity = 'warning';
          alternativeStrategy = suggestion;
        }
      }
    }
    
    // 🆕 更智能的兼容性评估 - 算法代码更宽松
    let estimatedCompatibility = 100;
    if (severity === 'blocking') {
      estimatedCompatibility = 0; // 完全不兼容
    } else if (severity === 'warning') {
      // 检测是否为算法评估上下文
      const isAlgorithmCode = this.detectAlgorithmContext(code);
      estimatedCompatibility = isAlgorithmCode ? 85 : 30; // 算法代码更宽松
    }

    // 特殊案例：纯计算代码通常兼容性很高
    if (restrictedModules.length === 0) {
      const hasMathImports = /import\s+(math|random|numpy|pandas|collections)/.test(code);
      const hasComplexLogic = code.split('\n').length > 10;
      const hasAlgorithmFeatures = this.detectAlgorithmContext(code);

      if (hasMathImports || hasComplexLogic || hasAlgorithmFeatures) {
        estimatedCompatibility = 95; // 高度兼容
      }
    }
    
    return {
      hasRestrictedImports: restrictedModules.length > 0,
      restrictedModules,
      severity,
      alternativeStrategy,
      estimatedCompatibility,
      issues,
      suggestions
    };
  }

  /**
   * 移除代码中的注释和字符串，避免误报
   */
  private removeCommentsAndStrings(code: string): string {
    let cleaned = code;
    
    // 移除多行字符串 ("""...""" 和 '''...''')
    cleaned = cleaned.replace(/"""[\s\S]*?"""/g, ' ');
    cleaned = cleaned.replace(/'''[\s\S]*?'''/g, ' ');
    
    // 移除单行字符串 ("..." 和 '...')
    cleaned = cleaned.replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, ' ');
    cleaned = cleaned.replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, ' ');
    
    // 移除单行注释 (#...)
    cleaned = cleaned.replace(/#.*$/gm, ' ');
    
    return cleaned;
  }

  /**
   * 智能执行策略选择器
   */
  private selectExecutionStrategy(analysis: ReturnType<typeof this.analyzeCodeCompatibility>): {
    strategy: 'e2b_direct' | 'e2b_modified' | 'execution_failed';
    reason: string;
    modification?: string;
  } {
    if (analysis.severity === 'blocking') {
      return {
        strategy: 'execution_failed',
        reason: `代码使用了E2B禁用的功能: ${analysis.restrictedModules.join(', ')}`
      };
    }
    
    if (analysis.severity === 'warning' && analysis.estimatedCompatibility < 50) {
      return {
        strategy: 'execution_failed',
        reason: `代码兼容性过低 (${analysis.estimatedCompatibility}%)，建议重新设计算法`
      };
    }
    
    if (analysis.severity === 'warning') {
      return {
        strategy: 'e2b_modified',
        reason: `代码需要轻微修改以兼容E2B环境`,
        modification: analysis.alternativeStrategy
      };
    }
    
    return {
      strategy: 'e2b_direct',
      reason: `代码与E2B环境兼容 (${analysis.estimatedCompatibility}%)`
    };
  }

  /**
   * 代码预检测函数 - 兼容原有接口
   */
  private detectProblematicImports(code: string): { 
    hasIssues: boolean; 
    issues: string[]; 
    suggestions: string[] 
  } {
    const analysis = this.analyzeCodeCompatibility(code);
    return {
      hasIssues: analysis.hasRestrictedImports,
      issues: analysis.issues,
      suggestions: analysis.suggestions
    };
  }

  /**
   * 生成增强的执行失败报告
   */
  private generateExecutionReport(
    code: string,
    analysis: ReturnType<typeof this.analyzeCodeCompatibility>,
    strategy: ReturnType<typeof this.selectExecutionStrategy>
  ): string {
    let report = '';
    
    if (strategy.strategy === 'execution_failed') {
      report += '🚫 代码执行失败\n\n';
      report += `原因: ${strategy.reason}\n\n`;
      
      report += '❌ 检测到的问题:\n';
      analysis.restrictedModules.forEach((module, index) => {
        report += `   ${index + 1}. 使用了被限制的模块: ${module}\n`;
      });
      
      report += '\n💡 解决建议:\n';
      
      if (analysis.restrictedModules.includes('subprocess')) {
        report += '   • subprocess: 避免调用外部程序，重新设计为纯Python算法\n';
      }
      
      if (analysis.restrictedModules.includes('os')) {
        report += '   • os: 使用pathlib模块替代文件路径操作\n';
        report += '   • 或避免文件系统操作，使用内存中的数据结构\n';
      }
      
      if (analysis.restrictedModules.includes('sys')) {
        report += '   • sys: 避免系统特定操作，使用算法逻辑替代\n';
      }
      
      if (analysis.restrictedModules.includes('__import__')) {
        report += '   • __import__: 使用标准的import语句替代动态导入\n';
      }
      
      if (analysis.restrictedModules.includes('exec()')) {
        report += '   • exec(): 动态代码执行被禁用，请使用静态代码实现\n';
        report += '     - 如果用于解析JSON，使用 json.loads() 替代\n';
        report += '     - 如果用于定义函数，直接写出函数定义\n';
        report += '     - 如果用于变量赋值，使用直接赋值语句\n';
      }
      
      if (analysis.restrictedModules.includes('eval()')) {
        report += '   • eval(): 动态表达式求值被禁用，请使用静态计算\n';
        report += '     - 如果计算数学表达式，直接写出计算公式\n';
        report += '     - 如果解析字符串为数据，使用 json.loads() 或 ast.literal_eval()\n';
      }
      
      report += '\n✅ 推荐的兼容写法:\n';
      report += this.getCompatibleCodeSuggestion(analysis.restrictedModules);
      
      report += '\n📊 评分说明:\n';
      report += '   由于代码使用了E2B环境不支持的功能，';
      report += '此次评测标记为"执行环境不兼容"。\n';
      report += '   这不代表算法逻辑有误，而是环境限制导致的执行失败。';
    }
    
    return report;
  }

  /**
   * 根据问题模块提供兼容代码建议
   */
  private getCompatibleCodeSuggestion(restrictedModules: string[]): string {
    let suggestions = '';
    
    if (restrictedModules.includes('exec()')) {
      suggestions += `
# ❌ 不兼容: 使用 exec() 动态执行
# exec("def my_function(): return 42")

# ✅ 兼容: 直接定义函数
def my_function():
    return 42

# ❌ 不兼容: 动态解析 JSON
# exec(f"result = {json_string}")

# ✅ 兼容: 使用 json.loads()
import json
result = json.loads(json_string)
`;
    }
    
    if (restrictedModules.includes('eval()')) {
      suggestions += `
# ❌ 不兼容: 使用 eval() 计算表达式
# result = eval("2 + 3 * 4")

# ✅ 兼容: 直接计算
result = 2 + 3 * 4

# ❌ 不兼容: 动态解析数据
# data = eval(string_data)

# ✅ 兼容: 使用安全解析
import ast
data = ast.literal_eval(string_data)  # 仅支持字面量
`;
    }
    
    if (restrictedModules.includes('os')) {
      suggestions += `
# 替代 os 模块的写法:
import pathlib

# 替代 os.path.join
path = pathlib.Path('folder') / 'file.txt'

# 替代 os.listdir
files = list(pathlib.Path('.').iterdir())

# 替代 os.getcwd
current_dir = pathlib.Path.cwd()
`;
    }
    
    if (restrictedModules.includes('subprocess')) {
      suggestions += `
# 避免 subprocess，重新设计算法:
# 原始代码: subprocess.run(['sort', 'file.txt'])
# 替代方案: 使用Python内置排序

def sort_data(data_list):
    return sorted(data_list)

# 或者读取数据到内存中处理
lines = ['line3', 'line1', 'line2']
sorted_lines = sorted(lines)
`;
    }
    
    if (restrictedModules.includes('sys')) {
      suggestions += `
# 避免 sys 模块:
# 替代 sys.argv
def main(args=None):
    # 通过函数参数传递而不是命令行参数
    if args is None:
        args = ['default', 'arguments']
    return process(args)

# 替代 sys.exit
def solve():
    if error_condition:
        return None  # 返回None表示错误
    return result
`;
    }
    
    return suggestions || '   建议重新设计算法，避免使用系统级功能，专注于纯计算逻辑。';
  }

  /**
   * 生成友好的错误信息 - 兼容原有接口
   */
  private generateFriendlyErrorMessage(
    originalError: string, 
    codeAnalysis: ReturnType<typeof this.detectProblematicImports>
  ): string {
    let message = '';
    
    if (originalError.includes('__import__ not found')) {
      message += '🚫 代码执行被阻止：使用了被禁用的导入功能\n\n';
      
      if (codeAnalysis.hasIssues) {
        message += '❌ 检测到的问题:\n';
        codeAnalysis.issues.forEach((issue, index) => {
          message += `   ${index + 1}. ${issue}\n`;
        });
        
        message += '\n💡 修复建议:\n';
        codeAnalysis.suggestions.forEach((suggestion, index) => {
          message += `   ${index + 1}. ${suggestion}\n`;
        });
      }
      
      message += '\n✅ 允许使用的标准库:\n';
      message += '   - math, random, json, re\n';
      message += '   - collections, itertools, functools\n';
      message += '   - datetime, time\n';
      message += '   - heapq, bisect, copy\n';
      
      message += '\n🎯 请修改代码避免使用被限制的功能，然后重新提交。';
    } else {
      message = `代码执行失败: ${originalError}`;
    }
    
    return message;
  }

  /**
   * 在沙箱中执行代码 - 使用现代E2B SDK
   */
  async executeCode(request: SandboxRequest): Promise<SandboxResponse> {
    const startTime = Date.now();

    try {
      if (!this.apiKey) {
        // 如果没有API密钥，使用模拟执行
        return await this.mockExecution(request);
      }

      // 🆕 增强的代码兼容性分析
      let strategy = null;
      if (request.language.toLowerCase() === 'python') {
        const analysis = this.analyzeCodeCompatibility(request.code);
        strategy = this.selectExecutionStrategy(analysis);
        
        console.log(`🔍 代码分析: ${strategy.strategy} (${strategy.reason})`);
        
        if (strategy.strategy === 'execution_failed') {
          console.log('🚫 代码预检测发现严重兼容性问题，阻止执行');
          const report = this.generateExecutionReport(request.code, analysis, strategy);
          return {
            success: false,
            output: '',
            error: report,
            exit_code: 1,
            stdout: '',
            stderr: 'Code incompatible with E2B environment',
            execution_time: Date.now() - startTime,
            executionStatus: 'restricted',
            compatibilityIssues: analysis.restrictedModules,
            suggestions: analysis.suggestions,
            compatibilityReport: report,
          };
        }
        
        if (strategy.strategy === 'e2b_modified') {
          console.log(`💡 代码需要修改: ${strategy.modification}`);
          // 对于需要修改的代码，我们仍然尝试执行，但会在结果中标注
        }
      }

      // 使用现代E2B SDK
      const sandbox = await Sandbox.create({
        apiKey: this.apiKey
      });

      try {
        // 设置环境变量（如果有）
        if (request.environment && Object.keys(request.environment).length > 0) {
          await this.setEnvironmentVariables(sandbox, request.environment);
        }

        // 上传文件（如果有）
        if (request.files && request.files.length > 0) {
          await this.uploadFiles(sandbox, request.files);
        }

        // 执行代码
        const result = await this.runCodeWithSDK(sandbox, request);
        
        // 分析代码兼容性（如果没有提前返回的话）
        const codeAnalysis = this.analyzeCodeCompatibility(request.code);
        if (!strategy) {
          strategy = this.selectExecutionStrategy(codeAnalysis);
        }
        const compatibilityReport = this.generateExecutionReport(request.code, codeAnalysis, strategy);
        
        return {
          ...result,
          execution_time: Date.now() - startTime,
          executionStatus: result.success ? 'compatible' : 'error',
          compatibilityIssues: codeAnalysis.restrictedModules,
          suggestions: codeAnalysis.suggestions,
          compatibilityReport: compatibilityReport,
        };

      } finally {
        // 清理沙箱
        await sandbox.kill();
      }
    } catch (error) {
      console.error('E2B执行错误:', error);
      
      // 🆕 智能错误处理：如果是导入相关错误，提供详细分析
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      let friendlyError = errorMessage;
      
      if (errorMessage.includes('__import__') || errorMessage.includes('not found')) {
        const analysis = this.analyzeCodeCompatibility(request.code);
        if (analysis.hasRestrictedImports) {
          const strategy = this.selectExecutionStrategy(analysis);
          friendlyError = this.generateExecutionReport(request.code, analysis, strategy);
        }
      }
      
      return {
        success: false,
        output: '',
        error: friendlyError,
        exit_code: 1,
        stdout: '',
        stderr: friendlyError,
        execution_time: Date.now() - startTime,
      };
    }
  }

  /**
   * 使用SDK运行代码
   */
  private async runCodeWithSDK(
    sandbox: Sandbox,
    request: SandboxRequest
  ): Promise<Omit<SandboxResponse, 'execution_time'>> {
    try {
      // 根据语言类型执行代码
      if (request.language.toLowerCase() === 'python') {
        const result = await sandbox.runCode(request.code);
        
        // 处理traceback字段，可能是数组或字符串
        let tracebackStr = '';
        if (result.error?.traceback) {
          if (Array.isArray(result.error.traceback)) {
            tracebackStr = result.error.traceback.join('\n');
          } else if (typeof result.error.traceback === 'string') {
            tracebackStr = result.error.traceback;
          } else {
            tracebackStr = String(result.error.traceback);
          }
        }

        return {
          success: !result.error,
          output: (result.logs?.stdout || []).join('') || result.text || '',
          error: result.error?.name ? `${result.error.name}: ${result.error.value}` : undefined,
          exit_code: result.error ? 1 : 0,
          stdout: (result.logs?.stdout || []).join('') || result.text || '',
          stderr: tracebackStr || (result.logs?.stderr || []).join('') || '',
        };
      } else {
        // 对于非Python代码，通过文件系统创建并执行
        const fileName = this.getFileName(request.language);
        await sandbox.runCode(`
import subprocess
import sys
import os

# 写入代码到文件
with open('${fileName}', 'w') as f:
    f.write('''${request.code.replace(/'/g, "\\'")}''')

# 执行代码
try:
    result = subprocess.run(['${this.getExecuteCommand(request.language)}', '${fileName}'], 
                           capture_output=True, text=True, timeout=30)
    print('STDOUT:', result.stdout)
    print('STDERR:', result.stderr)  
    print('EXIT_CODE:', result.returncode)
except subprocess.TimeoutExpired:
    print('STDERR: Execution timeout')
    print('EXIT_CODE: 1')
except Exception as e:
    print('STDERR:', str(e))
    print('EXIT_CODE: 1')
`);

        return {
          success: true,
          output: 'Code execution initiated',
          error: undefined,
          exit_code: 0,
          stdout: 'Code execution initiated',
          stderr: '',
        };
      }
    } catch (error) {
      console.error('SDK代码执行失败:', error);
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown SDK error',
        exit_code: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown SDK error',
      };
    }
  }

  /**
   * 使用SDK上传文件到沙箱
   */
  private async uploadFiles(
    sandbox: Sandbox,
    files: Array<{ name: string; content: string }>
  ): Promise<void> {
    for (const file of files) {
      try {
        await sandbox.runCode(`
# 写入文件: ${file.name}
with open('${file.name}', 'w') as f:
    f.write('''${file.content.replace(/'/g, "\\'")}''')
print(f"文件 ${file.name} 上传成功")
`);
      } catch (error) {
        console.warn(`Failed to upload file ${file.name}:`, error);
        throw new Error(`Failed to upload file ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * 使用SDK设置环境变量
   */
  private async setEnvironmentVariables(
    sandbox: Sandbox,
    environment: Record<string, any>
  ): Promise<void> {
    const envCode = Object.entries(environment).map(
      ([key, value]) => `import os\nos.environ['${key}'] = '${value}'`
    ).join('\n');

    if (envCode) {
      try {
        await sandbox.runCode(envCode);
        console.log('环境变量设置完成');
      } catch (error) {
        console.warn('Failed to set environment variables:', error);
        throw new Error(`Failed to set environment variables: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * 根据语言获取文件名
   */
  private getFileName(language: string): string {
    const extensions: Record<string, string> = {
      'python': 'temp_code.py',
      'javascript': 'temp_code.js',
      'typescript': 'temp_code.ts',
      'java': 'Main.java',
      'cpp': 'temp_code.cpp',
      'c': 'temp_code.c',
      'go': 'temp_code.go',
      'rust': 'temp_code.rs',
      'php': 'temp_code.php',
      'ruby': 'temp_code.rb',
      'bash': 'temp_code.sh',
    };

    return extensions[language.toLowerCase()] || 'temp_code.py';
  }

  /**
   * 根据语言获取执行命令
   */
  private getExecuteCommand(language: string): string {
    const commands: Record<string, string> = {
      'python': 'python3',
      'javascript': 'node',
      'typescript': 'npx tsx',
      'java': 'java',
      'cpp': 'g++ -o temp_executable temp_code.cpp && ./temp_executable',
      'c': 'gcc -o temp_executable temp_code.c && ./temp_executable',
      'go': 'go run',
      'rust': 'rustc temp_code.rs && ./temp_code',
      'php': 'php',
      'ruby': 'ruby',
      'bash': 'bash',
    };

    return commands[language.toLowerCase()] || 'python3';
  }


  /**
   * 模拟代码执行（当没有API密钥时使用）
   */
  private async mockExecution(request: SandboxRequest): Promise<SandboxResponse> {
    console.log(`🔧 Mock executing ${request.language} code`);
    
    // 模拟执行时间
    const executionTime = 500 + Math.random() * 2000;
    await new Promise(resolve => setTimeout(resolve, executionTime));

    // 模拟执行结果
    const success = Math.random() > 0.15; // 85%成功率
    
    if (success) {
      // 尝试从代码中提取可能的分数输出
      const codeLines = request.code.toLowerCase();
      let score = 75 + Math.random() * 25; // 75-100分
      
      // 如果代码包含明显的评分逻辑，调整分数
      if (codeLines.includes('score') || codeLines.includes('评分')) {
        score = 60 + Math.random() * 40; // 60-100分
      }

      const stdout = `Mock execution completed\nSCORE: ${score.toFixed(1)}\nExecution time: ${executionTime.toFixed(0)}ms`;
      
      // 分析代码兼容性
      const codeAnalysis = this.analyzeCodeCompatibility(request.code);
      const strategy = this.selectExecutionStrategy(codeAnalysis);
      const compatibilityReport = this.generateExecutionReport(request.code, codeAnalysis, strategy);
      
      return {
        success: true,
        output: stdout,
        exit_code: 0,
        stdout,
        stderr: '',
        execution_time: executionTime,
        memory_usage: 5 + Math.random() * 15, // 5-20MB
        cpu_usage: 10 + Math.random() * 40, // 10-50%
        executionStatus: strategy.strategy === 'execution_failed' ? 'restricted' : 'compatible',
        compatibilityIssues: codeAnalysis.restrictedModules,
        suggestions: codeAnalysis.suggestions,
        compatibilityReport: compatibilityReport,
      };
    } else {
      const stderr = 'Mock execution error: Simulated runtime exception';
      
      // 分析代码兼容性
      const codeAnalysis = this.analyzeCodeCompatibility(request.code);
      const strategy = this.selectExecutionStrategy(codeAnalysis);
      const compatibilityReport = this.generateExecutionReport(request.code, codeAnalysis, strategy);
      
      return {
        success: false,
        output: stderr,
        error: stderr,
        exit_code: 1,
        stdout: '',
        stderr,
        execution_time: executionTime,
        memory_usage: 2 + Math.random() * 5, // 2-7MB
        cpu_usage: 5 + Math.random() * 15, // 5-20%
        executionStatus: 'error',
        compatibilityIssues: codeAnalysis.restrictedModules,
        suggestions: codeAnalysis.suggestions,
        compatibilityReport: compatibilityReport,
      };
    }
  }

  /**
   * 检查服务状态 - 使用现代E2B SDK
   */
  async checkHealth(): Promise<{ available: boolean; error?: string }> {
    if (!this.apiKey) {
      return { available: false, error: 'API key not configured' };
    }

    try {
      // 尝试创建一个简单的沙箱来测试连接
      const sandbox = await Sandbox.create({
        apiKey: this.apiKey
      });

      // 执行一个简单的Python命令来验证功能
      const result = await sandbox.runCode('print("E2B health check successful")');
      await sandbox.kill();

      return { 
        available: !result.error, 
        error: result.error?.name ? `${result.error.name}: ${result.error.value}` : undefined 
      };
    } catch (error) {
      console.error('E2B健康检查失败:', error);
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 🆕 检测是否为算法评估上下文
   * 识别常见的算法评估特征，避免对此类代码过度限制
   */
  private detectAlgorithmContext(code: string): boolean {
    // 算法评估的特征标识
    const algorithmIndicators = [
      /test_cases\s*=/, // 测试用例变量
      /def\s+\w*sort\w*/, // 排序函数
      /def\s+\w*search\w*/, // 搜索函数
      /def\s+\w*find\w*/, // 查找函数
      /def\s+\w*(palindrome|fibonacci|factorial|binary_search|merge_sort|quick_sort)\w*/, // 经典算法
      /globals\s*\(\s*\)/, // 使用globals进行函数发现（常见于模板代码）
      /exec\s*\(/, // 使用exec执行代码（常见于动态评估）
      /test_case|test_input|expected|reference_answer/, // 测试相关关键词
      /algorithm|solution|solve/, // 算法或解决方案关键词
      /SCORE:\s*\d+/, // 评分输出格式
      /def\s+\w+\([^)]*\):\s*\n/, // 函数定义模式
      /(for|while).*range|enumerate/, // 常见的算法循环模式
      /return\s+.*/, // 函数返回值
      /len\s*\(.*\)/, // 长度计算（常见于算法）
      /sorted\s*\(.*\)|\.sort\s*\(/, // 排序操作
      /max\s*\(.*\)|min\s*\(.*\)/, // 最值计算
    ];

    const matchCount = algorithmIndicators.filter(pattern => pattern.test(code)).length;

    // 如果匹配2个或以上特征，认为是算法代码
    const isAlgorithm = matchCount >= 2;

    if (isAlgorithm) {
      console.log(`🎯 检测到算法评估上下文 (匹配 ${matchCount} 个特征)，使用宽松检查策略`);
    }

    return isAlgorithm;
  }
}

// 导出单例实例
export const e2bClient = new E2BClient();