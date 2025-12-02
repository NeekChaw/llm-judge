/**
 * 智能代码提取器 - Phase 2 混合评估系统核心组件
 * 支持三种提取策略：auto/regex/markers
 */

export interface CodeExtractionStrategy {
  type: 'auto' | 'regex' | 'markers';
  pattern?: string;
  markers?: { start: string; end: string; };
}

export interface ExtractedCode {
  code: string;
  language: 'python' | 'javascript' | 'typescript' | 'cpp' | 'java' | 'go' | 'rust' | 'php' | 'ruby' | 'csharp';
  confidence: number; // 0-100, 提取可信度
  extraction_method: string;
  metadata?: {
    line_start?: number;
    line_end?: number;
    detected_patterns?: string[];
    fallback_used?: boolean;
  };
}

export interface CodeExtractionResult {
  success: boolean;
  extracted_code?: ExtractedCode;
  error?: string;
  fallback_attempted?: boolean;
}

/**
 * 智能代码提取器主类
 */
export class CodeExtractor {
  
  /**
   * 主要提取方法 - 根据策略提取代码
   */
  async extractCode(
    text: string,
    strategy: CodeExtractionStrategy,
    targetLanguage: 'python' | 'javascript' | 'typescript' | 'cpp' | 'java' | 'go' | 'rust' | 'php' | 'ruby' | 'csharp' | 'auto',
    fallbackOnError: boolean = true
  ): Promise<CodeExtractionResult> {
    try {
      let result: ExtractedCode | null = null;

      switch (strategy.type) {
        case 'auto':
          if (targetLanguage === 'auto') {
            result = await this.autoDetectAndExtractCode(text);
          } else {
            result = await this.autoExtractCode(text, targetLanguage as any);
          }
          break;
        case 'regex':
          if (!strategy.pattern) {
            throw new Error('Regex strategy requires pattern parameter');
          }
          result = await this.regexExtractCode(text, strategy.pattern, targetLanguage);
          break;
        case 'markers':
          if (!strategy.markers) {
            throw new Error('Markers strategy requires markers parameter');
          }
          result = await this.markersExtractCode(text, strategy.markers, targetLanguage);
          break;
        default:
          throw new Error(`Unknown extraction strategy: ${strategy.type}`);
      }

      if (result) {
        return {
          success: true,
          extracted_code: result
        };
      } else if (fallbackOnError) {
        // 尝试fallback策略
        const fallbackResult = await this.fallbackExtraction(text, targetLanguage);
        return {
          success: fallbackResult !== null,
          extracted_code: fallbackResult || undefined,
          fallback_attempted: true
        };
      } else {
        return {
          success: false,
          error: 'No code could be extracted with the specified strategy'
        };
      }

    } catch (error: any) {
      if (fallbackOnError) {
        const fallbackResult = await this.fallbackExtraction(text, targetLanguage);
        return {
          success: fallbackResult !== null,
          extracted_code: fallbackResult || undefined,
          fallback_attempted: true,
          error: `Primary extraction failed: ${error.message}`
        };
      } else {
        return {
          success: false,
          error: error.message
        };
      }
    }
  }

  /**
   * 自动检测语言并提取代码 - 智能语言检测
   */
  private async autoDetectAndExtractCode(text: string): Promise<ExtractedCode | null> {
    console.log('🔍 自动检测代码语言...');
    
    // 检测所有可能的代码块
    const markdownCodeBlocks = text.match(/```(\w+)?\n([\s\S]*?)\n```/gi) || [];
    let bestMatch: ExtractedCode | null = null;
    let highestConfidence = 0;
    
    for (const block of markdownCodeBlocks) {
      const match = block.match(/```(\w+)?\n([\s\S]*?)\n```/i);
      if (!match) continue;
      
      const declaredLang = match[1]?.toLowerCase();
      const code = match[2].trim();
      
      if (code.length < 10) continue; // 跳过太短的代码
      
      // 通过内容特征检测语言
      const detectedLang = this.detectLanguageFromContent(code, declaredLang);
      const confidence = this.calculateConfidenceForLanguage(code, detectedLang, 'markdown');
      
      console.log(`   检测到代码块: ${detectedLang}, 置信度: ${confidence}%`);
      
      if (confidence > highestConfidence) {
        highestConfidence = confidence;
        bestMatch = {
          code,
          language: detectedLang,
          confidence,
          extraction_method: 'auto_detect_markdown',
          metadata: {
            detected_patterns: ['markdown', 'auto_detect'],
            fallback_used: false
          }
        };
      }
    }
    
    // 如果没有找到markdown代码块，尝试检测裸代码
    if (!bestMatch || highestConfidence < 50) {
      const detectedFromContent = this.detectAndExtractFromContent(text);
      if (detectedFromContent && detectedFromContent.confidence > highestConfidence) {
        bestMatch = detectedFromContent;
      }
    }
    
    if (bestMatch) {
      console.log(`✅ 成功检测语言: ${bestMatch.language}, 置信度: ${bestMatch.confidence}%`);
    } else {
      console.log('❌ 未能检测到有效代码');
    }
    
    return bestMatch;
  }

  /**
   * 自动提取策略 - 使用启发式方法检测代码块
   */
  private async autoExtractCode(
    text: string,
    targetLanguage: 'python' | 'javascript' | 'typescript'
  ): Promise<ExtractedCode | null> {
    const detectedPatterns: string[] = [];
    let bestMatch: ExtractedCode | null = null;
    let highestConfidence = 0;

    // 策略1: Markdown代码块
    const markdownPattern = new RegExp(`\`\`\`(?:${this.getLanguageAliases(targetLanguage).join('|')})?\n([\\s\\S]*?)\n\`\`\``, 'gi');
    let match;
    while ((match = markdownPattern.exec(text)) !== null) {
      const code = match[1].trim();
      if (code.length > 10) { // 最小代码长度过滤
        const confidence = this.calculateConfidence(code, targetLanguage, 'markdown');
        detectedPatterns.push('markdown');
        
        if (confidence > highestConfidence) {
          highestConfidence = confidence;
          bestMatch = {
            code,
            language: targetLanguage,
            confidence,
            extraction_method: 'auto_markdown',
            metadata: { detected_patterns: [...detectedPatterns] }
          };
        }
      }
    }

    // 策略2: 行内代码块（多行）
    const inlineMultiPattern = /```([\s\S]*?)```/g;
    while ((match = inlineMultiPattern.exec(text)) !== null) {
      const code = match[1].trim();
      if (code.length > 10 && this.isValidCodeStructure(code, targetLanguage)) {
        const confidence = this.calculateConfidence(code, targetLanguage, 'inline_multi');
        detectedPatterns.push('inline_multi');
        
        if (confidence > highestConfidence) {
          highestConfidence = confidence;
          bestMatch = {
            code,
            language: targetLanguage,
            confidence,
            extraction_method: 'auto_inline_multi',
            metadata: { detected_patterns: [...detectedPatterns] }
          };
        }
      }
    }

    // 策略3: 语言特定模式识别
    const languageSpecificCode = this.extractLanguageSpecificPatterns(text, targetLanguage);
    if (languageSpecificCode && languageSpecificCode.confidence > highestConfidence) {
      detectedPatterns.push('language_specific');
      bestMatch = {
        ...languageSpecificCode,
        metadata: { ...languageSpecificCode.metadata, detected_patterns: [...detectedPatterns] }
      };
    }

    return bestMatch;
  }

  /**
   * 正则表达式提取策略
   */
  private async regexExtractCode(
    text: string,
    pattern: string,
    targetLanguage: 'python' | 'javascript' | 'typescript'
  ): Promise<ExtractedCode | null> {
    try {
      const regex = new RegExp(pattern, 'gis');
      const match = regex.exec(text);
      
      if (match) {
        // 如果有捕获组，使用第一个捕获组，否则使用整个匹配
        const code = (match[1] || match[0]).trim();
        
        if (code.length > 5) {
          const confidence = this.calculateConfidence(code, targetLanguage, 'regex');
          return {
            code,
            language: targetLanguage,
            confidence,
            extraction_method: 'regex_custom',
            metadata: {
              detected_patterns: ['custom_regex']
            }
          };
        }
      }
      
      return null;
    } catch (error) {
      throw new Error(`Invalid regex pattern: ${error.message}`);
    }
  }

  /**
   * 标记提取策略
   */
  private async markersExtractCode(
    text: string,
    markers: { start: string; end: string; },
    targetLanguage: 'python' | 'javascript' | 'typescript'
  ): Promise<ExtractedCode | null> {
    const startIndex = text.indexOf(markers.start);
    if (startIndex === -1) {
      return null;
    }

    const endIndex = text.indexOf(markers.end, startIndex + markers.start.length);
    if (endIndex === -1) {
      return null;
    }

    const code = text.slice(startIndex + markers.start.length, endIndex).trim();
    
    if (code.length > 5) {
      const confidence = this.calculateConfidence(code, targetLanguage, 'markers');
      
      // 计算行号
      const beforeCode = text.slice(0, startIndex);
      const lineStart = beforeCode.split('\n').length;
      const lineEnd = lineStart + code.split('\n').length - 1;
      
      return {
        code,
        language: targetLanguage,
        confidence,
        extraction_method: 'markers_custom',
        metadata: {
          line_start: lineStart,
          line_end: lineEnd,
          detected_patterns: ['custom_markers']
        }
      };
    }

    return null;
  }

  /**
   * 备用提取策略 - 当主要策略失败时使用
   */
  private async fallbackExtraction(
    text: string,
    targetLanguage: 'python' | 'javascript' | 'typescript'
  ): Promise<ExtractedCode | null> {
    // 备用策略1: 寻找任何代码块标记
    const generalCodeBlock = /```[\s\S]*?```/g;
    let match = generalCodeBlock.exec(text);
    if (match) {
      const code = match[0].replace(/```[a-zA-Z]*\n?/g, '').replace(/\n?```$/g, '').trim();
      if (code.length > 10) {
        return {
          code,
          language: targetLanguage,
          confidence: 30, // 低可信度
          extraction_method: 'fallback_general',
          metadata: {
            fallback_used: true,
            detected_patterns: ['general_code_block']
          }
        };
      }
    }

    // 备用策略2: 启发式行分析
    const lines = text.split('\n');
    let codeLines: string[] = [];
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (this.looksLikeCode(line, targetLanguage)) {
        if (!inCodeBlock) {
          codeLines = [line];
          inCodeBlock = true;
        } else {
          codeLines.push(line);
        }
      } else if (inCodeBlock && line.length === 0) {
        // 空行，继续收集
        codeLines.push(line);
      } else if (inCodeBlock) {
        // 非代码行，结束收集
        break;
      }
    }

    if (codeLines.length > 2) {
      const code = codeLines.join('\n').trim();
      return {
        code,
        language: targetLanguage,
        confidence: 20, // 很低可信度
        extraction_method: 'fallback_heuristic',
        metadata: {
          fallback_used: true,
          detected_patterns: ['heuristic_analysis']
        }
      };
    }

    return null;
  }

  /**
   * 计算代码提取的可信度分数
   */
  private calculateConfidence(
    code: string,
    targetLanguage: 'python' | 'javascript' | 'typescript',
    extractionMethod: string
  ): number {
    let confidence = 0;

    // 基础分数（根据提取方法）
    const methodScores = {
      'markdown': 80,
      'inline_multi': 70,
      'language_specific': 90,
      'regex': 60,
      'markers': 85
    };
    confidence += methodScores[extractionMethod as keyof typeof methodScores] || 50;

    // 语言特征匹配加分
    if (this.hasLanguageFeatures(code, targetLanguage)) {
      confidence += 15;
    }

    // 代码结构完整性加分
    if (this.isValidCodeStructure(code, targetLanguage)) {
      confidence += 10;
    }

    // 长度合理性
    if (code.length > 50 && code.length < 5000) {
      confidence += 5;
    } else if (code.length >= 5000) {
      confidence -= 10; // 过长可能包含非代码内容
    }

    return Math.min(100, Math.max(0, confidence));
  }

  /**
   * 获取语言别名列表
   */
  private getLanguageAliases(language: 'python' | 'javascript' | 'typescript'): string[] {
    const aliases = {
      'python': ['python', 'py', 'python3'],
      'javascript': ['javascript', 'js', 'node'],
      'typescript': ['typescript', 'ts']
    };
    return aliases[language];
  }

  /**
   * 检查是否具有语言特定特征
   */
  private hasLanguageFeatures(code: string, language: 'python' | 'javascript' | 'typescript'): boolean {
    const features = {
      'python': [
        /\bdef\s+\w+\s*\(/,
        /\bif\s+__name__\s*==\s*['""]__main__['""]:/,
        /\bimport\s+\w+/,
        /\bfrom\s+\w+\s+import/,
        /\bprint\s*\(/,
        /:\s*$/m // Python的冒号语法
      ],
      'javascript': [
        /\bfunction\s+\w+\s*\(/,
        /\bconst\s+\w+\s*=/,
        /\blet\s+\w+\s*=/,
        /\bvar\s+\w+\s*=/,
        /\bconsole\.log\s*\(/,
        /=>\s*{?/,
        /\brequire\s*\(/,
        /\bmodule\.exports/
      ],
      'typescript': [
        /\binterface\s+\w+/,
        /\btype\s+\w+\s*=/,
        /:\s*(string|number|boolean|any)\b/,
        /\bfunction\s+\w+\s*\([^)]*:\s*\w+/,
        /\bconst\s+\w+:\s*\w+/,
        /\bimport\s+.*\bfrom\b/
      ]
    };

    const patterns = features[language];
    return patterns.some(pattern => pattern.test(code));
  }

  /**
   * 检查代码结构的有效性
   */
  private isValidCodeStructure(code: string, language: 'python' | 'javascript' | 'typescript'): boolean {
    // 基础检查：不能全是注释或空行
    const meaningfulLines = code.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('//');
    });

    if (meaningfulLines.length === 0) {
      return false;
    }

    // 语言特定结构检查
    switch (language) {
      case 'python':
        // 检查Python缩进一致性
        return this.hasConsistentIndentation(code);
      case 'javascript':
      case 'typescript':
        // 检查括号匹配
        return this.hasBalancedBrackets(code);
      default:
        return true;
    }
  }

  /**
   * 检查Python代码缩进一致性
   */
  private hasConsistentIndentation(code: string): boolean {
    const lines = code.split('\n').filter(line => line.trim().length > 0);
    const indentations = lines.map(line => {
      const match = line.match(/^(\s*)/);
      return match ? match[1].length : 0;
    }).filter(indent => indent > 0);

    if (indentations.length === 0) return true;

    // 检查是否使用一致的缩进单位
    const gcd = indentations.reduce((a, b) => {
      while (b !== 0) {
        const temp = b;
        b = a % b;
        a = temp;
      }
      return a;
    });

    return gcd > 0; // 有公共缩进单位
  }

  /**
   * 检查括号匹配
   */
  private hasBalancedBrackets(code: string): boolean {
    const stack: string[] = [];
    const pairs = { '(': ')', '[': ']', '{': '}' };
    const opening = Object.keys(pairs);
    const closing = Object.values(pairs);

    for (const char of code) {
      if (opening.includes(char)) {
        stack.push(char);
      } else if (closing.includes(char)) {
        const lastOpening = stack.pop();
        if (!lastOpening || pairs[lastOpening as keyof typeof pairs] !== char) {
          return false;
        }
      }
    }

    return stack.length === 0;
  }

  /**
   * 提取语言特定模式
   */
  private extractLanguageSpecificPatterns(
    text: string,
    targetLanguage: 'python' | 'javascript' | 'typescript'
  ): ExtractedCode | null {
    let bestCode: string = '';
    let bestConfidence = 0;

    switch (targetLanguage) {
      case 'python':
        // Python函数定义模式
        const pythonFuncPattern = /def\s+\w+\s*\([^)]*\):\s*\n((?:\s{4,}.*\n?)*)/g;
        let match;
        while ((match = pythonFuncPattern.exec(text)) !== null) {
          const fullMatch = match[0];
          if (fullMatch.length > bestCode.length) {
            bestCode = fullMatch;
            bestConfidence = 85;
          }
        }
        break;

      case 'javascript':
      case 'typescript':
        // JavaScript/TypeScript函数模式
        const jsFuncPattern = /(?:function\s+\w+\s*\([^)]*\)\s*{[^}]*}|const\s+\w+\s*=\s*(?:\([^)]*\)\s*=>\s*{[^}]*}|\([^)]*\)\s*=>\s*[^;]+))/g;
        while ((match = jsFuncPattern.exec(text)) !== null) {
          const fullMatch = match[0];
          if (fullMatch.length > bestCode.length) {
            bestCode = fullMatch;
            bestConfidence = 80;
          }
        }
        break;
    }

    if (bestCode.length > 20) {
      return {
        code: bestCode.trim(),
        language: targetLanguage,
        confidence: bestConfidence,
        extraction_method: 'language_specific',
        metadata: {
          detected_patterns: [`${targetLanguage}_specific`]
        }
      };
    }

    return null;
  }

  /**
   * 启发式判断是否像代码行
   */
  private looksLikeCode(line: string, language: 'python' | 'javascript' | 'typescript'): boolean {
    const trimmed = line.trim();
    
    // 空行或明显的自然语言
    if (trimmed.length === 0 || /^[A-Z][a-z\s]+[.!?]$/.test(trimmed)) {
      return false;
    }

    // 代码特征检查
    const codeIndicators = [
      /[{}()\[\]]/,  // 括号
      /[=+\-*/<>]/,  // 操作符
      /\b(if|else|for|while|function|def|class|import|return|var|let|const)\b/,  // 关键词
      /^\s*[#//]/, // 注释
      /;\s*$/,     // 分号结尾
      /:\s*$/      // 冒号结尾（Python）
    ];

    return codeIndicators.some(pattern => pattern.test(trimmed));
  }

  /**
   * 从代码内容检测编程语言
   */
  private detectLanguageFromContent(code: string, declaredLang?: string): ExtractedCode['language'] {
    // 如果有明确声明的语言，先检查是否合法
    if (declaredLang) {
      const normalizedLang = this.normalizeLanguageName(declaredLang);
      if (normalizedLang) return normalizedLang;
    }
    
    // 基于内容特征检测语言
    const features = [
      // C++
      { lang: 'cpp' as const, patterns: [/#include/, /std::/, /cout/, /struct\s+\w+/, /int main\s*\(/, /iostream/, /namespace\s+std/] },
      
      // Python  
      { lang: 'python' as const, patterns: [/def\s+\w+\s*\(/, /import\s+\w+/, /from\s+\w+\s+import/, /print\s*\(/, /if\s+__name__\s*==/, /:\s*$/m] },
      
      // JavaScript/TypeScript
      { lang: 'javascript' as const, patterns: [/function\s+\w+\s*\(/, /const\s+\w+\s*=/, /let\s+\w+/, /var\s+\w+/, /console\.log\s*\(/, /=>\s*{?/] },
      { lang: 'typescript' as const, patterns: [/interface\s+\w+/, /type\s+\w+\s*=/, /:\s*\w+\s*[;,}]/, /function\s+\w+\s*\([^)]*:\s*\w+/] },
      
      // Java
      { lang: 'java' as const, patterns: [/public\s+class\s+\w+/, /public\s+static\s+void\s+main/, /System\.out\.println/, /import\s+java\./, /@Override/] },
      
      // Go
      { lang: 'go' as const, patterns: [/package\s+\w+/, /func\s+\w+\s*\(/, /import\s*\(/, /fmt\.Print/, /var\s+\w+\s+\w+/] },
      
      // Rust
      { lang: 'rust' as const, patterns: [/fn\s+\w+\s*\(/, /let\s+mut\s+/, /println!\s*\(/, /use\s+std::/, /impl\s+\w+/] },
      
      // PHP
      { lang: 'php' as const, patterns: [/<\?php/, /\$\w+/, /echo\s+/, /function\s+\w+\s*\(/, /class\s+\w+/] },
      
      // Ruby
      { lang: 'ruby' as const, patterns: [/def\s+\w+/, /end\s*$/, /puts\s+/, /class\s+\w+/, /@\w+/, /require\s+/] },
      
      // C#
      { lang: 'csharp' as const, patterns: [/using\s+System/, /namespace\s+\w+/, /public\s+class\s+\w+/, /Console\.WriteLine/, /\[.*\]/] }
    ];
    
    let bestMatch: ExtractedCode['language'] = 'python'; // 默认
    let maxScore = 0;
    
    for (const feature of features) {
      let score = 0;
      for (const pattern of feature.patterns) {
        if (pattern.test(code)) {
          score++;
        }
      }
      
      if (score > maxScore) {
        maxScore = score;
        bestMatch = feature.lang;
      }
    }
    
    return bestMatch;
  }

  /**
   * 标准化语言名称
   */
  private normalizeLanguageName(lang: string): ExtractedCode['language'] | null {
    const langMap: Record<string, ExtractedCode['language']> = {
      'cpp': 'cpp', 'c++': 'cpp', 'cxx': 'cpp',
      'python': 'python', 'py': 'python', 'python3': 'python',
      'javascript': 'javascript', 'js': 'javascript', 'node': 'javascript',
      'typescript': 'typescript', 'ts': 'typescript',
      'java': 'java',
      'go': 'go', 'golang': 'go',
      'rust': 'rust', 'rs': 'rust',
      'php': 'php',
      'ruby': 'ruby', 'rb': 'ruby',
      'csharp': 'csharp', 'cs': 'csharp', 'c#': 'csharp'
    };
    
    return langMap[lang.toLowerCase()] || null;
  }

  /**
   * 计算特定语言的置信度
   */
  private calculateConfidenceForLanguage(
    code: string,
    language: ExtractedCode['language'],
    extractionMethod: string
  ): number {
    let confidence = 0;
    
    // 基础分数（根据提取方法）
    const methodScores = {
      'markdown': 80,
      'inline_multi': 70,
      'language_specific': 90,
      'regex': 60,
      'markers': 85,
      'fallback': 20
    };
    
    confidence += methodScores[extractionMethod as keyof typeof methodScores] || 50;
    
    // 语言特征匹配度
    const languageFeatureMatch = this.hasLanguageFeaturesExtended(code, language);
    if (languageFeatureMatch) {
      confidence += 20;
    }
    
    // 代码长度和复杂度调整
    const lines = code.split('\n').length;
    if (lines > 5) confidence += 5;
    if (lines > 10) confidence += 5;
    if (code.length > 200) confidence += 5;
    
    // 确保不超过100
    return Math.min(confidence, 100);
  }

  /**
   * 检查是否有特定语言的特征（扩展版）
   */
  private hasLanguageFeaturesExtended(code: string, language: ExtractedCode['language']): boolean {
    const features = {
      'cpp': [/#include/, /std::/, /cout/, /struct\s+\w+/, /int main\s*\(/, /iostream/],
      'python': [/def\s+\w+\s*\(/, /import\s+\w+/, /from\s+\w+\s+import/, /print\s*\(/, /:\s*$/m],
      'javascript': [/function\s+\w+\s*\(/, /const\s+\w+\s*=/, /console\.log\s*\(/, /=>\s*{?/],
      'typescript': [/interface\s+\w+/, /type\s+\w+\s*=/, /:\s*\w+\s*[;,}]/],
      'java': [/public\s+class\s+\w+/, /System\.out\.println/, /import\s+java\./],
      'go': [/package\s+\w+/, /func\s+\w+\s*\(/, /fmt\.Print/],
      'rust': [/fn\s+\w+\s*\(/, /let\s+mut\s+/, /println!\s*\(/],
      'php': [/<\?php/, /\$\w+/, /echo\s+/],
      'ruby': [/def\s+\w+/, /end\s*$/, /puts\s+/],
      'csharp': [/using\s+System/, /Console\.WriteLine/, /public\s+class\s+\w+/]
    };
    
    const patterns = features[language] || [];
    return patterns.some(pattern => pattern.test(code));
  }

  /**
   * 从裸内容中检测并提取代码
   */
  private detectAndExtractFromContent(text: string): ExtractedCode | null {
    // 尝试查找看起来像代码的连续行块
    const lines = text.split('\n');
    let bestBlock: { start: number; end: number; language: ExtractedCode['language']; confidence: number } | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      // 检查从这里开始是否有连续的代码行
      let codeLineCount = 0;
      let j = i;
      
      while (j < lines.length && j - i < 50) { // 最多检查50行
        const line = lines[j].trim();
        if (this.looksLikeCodeGeneric(line)) {
          codeLineCount++;
        } else if (line.length === 0) {
          // 空行，继续
        } else {
          // 非代码行，停止
          break;
        }
        j++;
      }
      
      if (codeLineCount >= 3) { // 至少3行代码
        const blockText = lines.slice(i, j).join('\n');
        const detectedLang = this.detectLanguageFromContent(blockText);
        const confidence = Math.min(30 + codeLineCount * 5, 70); // 基础分数较低
        
        if (!bestBlock || confidence > bestBlock.confidence) {
          bestBlock = { start: i, end: j, language: detectedLang, confidence };
        }
      }
    }
    
    if (bestBlock) {
      const code = lines.slice(bestBlock.start, bestBlock.end).join('\n').trim();
      return {
        code,
        language: bestBlock.language,
        confidence: bestBlock.confidence,
        extraction_method: 'content_analysis',
        metadata: {
          detected_patterns: ['content_analysis'],
          fallback_used: false,
          line_start: bestBlock.start + 1,
          line_end: bestBlock.end
        }
      };
    }
    
    return null;
  }

  /**
   * 通用代码行检测（支持更多语言）
   */
  private looksLikeCodeGeneric(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed.length < 2) return false;
    
    const codeIndicators = [
      // 通用编程语言模式
      /^(public|private|protected|static|const|let|var|def|function|class|struct|if|else|for|while|return|import|include|using|namespace)\s+/,
      /[{}();]$/, // 以常见编程符号结尾
      /^\s*[{}]/, // 大括号开头
      /\w+\s*\([^)]*\)\s*[{;]/, // 函数调用/定义
      /\w+\s*[:=]\s*.*[;,]?$/, // 赋值语句
      /#include\s*</, // C/C++头文件
      /std::|cout|cin/, // C++特征
      /print\s*\(|def\s+\w+|import\s+\w+/, // Python特征
      /console\.|function\s*\(/, // JavaScript特征
      /System\.|public\s+static/, // Java特征
      /fmt\.|package\s+\w+/, // Go特征
      /println!\s*\(|fn\s+\w+/, // Rust特征
      /\$\w+|<\?php/, // PHP特征
      /puts\s+|def\s+\w+.*end/, // Ruby特征
      /Console\.|using\s+System/ // C#特征
    ];
    
    return codeIndicators.some(pattern => pattern.test(trimmed));
  }
}

// 全局实例
export const codeExtractor = new CodeExtractor();

// 便捷方法导出
export async function extractCodeFromText(
  text: string,
  strategy: CodeExtractionStrategy,
  targetLanguage: 'python' | 'javascript' | 'typescript' | 'cpp' | 'java' | 'go' | 'rust' | 'php' | 'ruby' | 'csharp' | 'auto',
  fallbackOnError: boolean = true
): Promise<CodeExtractionResult> {
  return await codeExtractor.extractCode(text, strategy, targetLanguage, fallbackOnError);
}