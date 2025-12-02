/**
 * PostgREST Adapter for Supabase JS API Compatibility
 *
 * 提供与 Supabase JS 客户端兼容的 API，底层直接调用 PostgREST HTTP API
 * 支持本地 Docker 部署模式下的完全离线使用
 */

/**
 * PostgREST 查询构建器
 * 模仿 Supabase JS 的链式 API 风格
 */
class PostgRESTQueryBuilder {
  private filters: string[] = [];
  private selectColumns = '*';
  private orderByClause: string | null = null;
  private limitValue: number | null = null;
  private offsetValue: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private isSingle = false;
  private insertData: any = null;
  private updateData: any = null;
  private isDelete = false;
  private upsertData: any = null;
  private upsertOptions: any = null;

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private table: string
  ) {}

  /**
   * SELECT 操作
   */
  select(columns = '*') {
    this.selectColumns = columns;
    return this;
  }

  /**
   * 相等过滤
   */
  eq(column: string, value: any) {
    this.filters.push(`${column}=eq.${this.encodeValue(value)}`);
    return this;
  }

  /**
   * 不等过滤
   */
  neq(column: string, value: any) {
    this.filters.push(`${column}=neq.${this.encodeValue(value)}`);
    return this;
  }

  /**
   * 大于
   */
  gt(column: string, value: any) {
    this.filters.push(`${column}=gt.${this.encodeValue(value)}`);
    return this;
  }

  /**
   * 大于等于
   */
  gte(column: string, value: any) {
    this.filters.push(`${column}=gte.${this.encodeValue(value)}`);
    return this;
  }

  /**
   * 小于
   */
  lt(column: string, value: any) {
    this.filters.push(`${column}=lt.${this.encodeValue(value)}`);
    return this;
  }

  /**
   * 小于等于
   */
  lte(column: string, value: any) {
    this.filters.push(`${column}=lte.${this.encodeValue(value)}`);
    return this;
  }

  /**
   * LIKE 模糊匹配
   */
  like(column: string, pattern: string) {
    this.filters.push(`${column}=like.${encodeURIComponent(pattern)}`);
    return this;
  }

  /**
   * ILIKE 不区分大小写模糊匹配
   */
  ilike(column: string, pattern: string) {
    this.filters.push(`${column}=ilike.${encodeURIComponent(pattern)}`);
    return this;
  }

  /**
   * IN 操作
   */
  in(column: string, values: any[]) {
    const formattedValues = values.map(v => this.encodeValue(v)).join(',');
    this.filters.push(`${column}=in.(${formattedValues})`);
    return this;
  }

  /**
   * IS NULL
   */
  is(column: string, value: null | boolean) {
    if (value === null) {
      this.filters.push(`${column}=is.null`);
    } else {
      this.filters.push(`${column}=is.${value}`);
    }
    return this;
  }

  /**
   * CONTAINS (用于数组和 JSONB)
   */
  contains(column: string, value: any) {
    const encoded = typeof value === 'object'
      ? encodeURIComponent(JSON.stringify(value))
      : this.encodeValue(value);
    this.filters.push(`${column}=cs.${encoded}`);
    return this;
  }

  /**
   * OR 条件
   */
  or(filters: string) {
    this.filters.push(`or=(${filters})`);
    return this;
  }

  /**
   * 排序
   */
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    const direction = options?.ascending === false ? 'desc' : 'asc';
    const nulls = options?.nullsFirst ? 'nullsfirst' : 'nullslast';
    this.orderByClause = `${column}.${direction}.${nulls}`;
    return this;
  }

  /**
   * 限制返回数量
   */
  limit(count: number) {
    this.limitValue = count;
    return this;
  }

  /**
   * 偏移量
   */
  offset(count: number) {
    this.offsetValue = count;
    return this;
  }

  /**
   * 范围查询
   */
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  /**
   * 返回单条记录
   */
  single() {
    this.isSingle = true;
    return this;
  }

  /**
   * 可能返回单条记录（不存在时不报错）
   */
  maybeSingle() {
    this.isSingle = true;
    return this;
  }

  /**
   * INSERT 操作
   */
  insert(data: any) {
    this.insertData = data;
    return this;
  }

  /**
   * UPDATE 操作
   */
  update(data: any) {
    this.updateData = data;
    return this;
  }

  /**
   * DELETE 操作
   */
  delete() {
    this.isDelete = true;
    return this;
  }

  /**
   * UPSERT 操作
   */
  upsert(data: any, options?: any) {
    this.upsertData = data;
    this.upsertOptions = options;
    return this;
  }

  /**
   * 编码值
   */
  private encodeValue(value: any): string {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'string') return encodeURIComponent(value);
    return encodeURIComponent(JSON.stringify(value));
  }

  /**
   * 构建查询 URL
   */
  private buildUrl(): string {
    const params: string[] = [];

    // SELECT columns
    if (this.selectColumns) {
      params.push(`select=${encodeURIComponent(this.selectColumns)}`);
    }

    // Filters
    if (this.filters.length > 0) {
      params.push(...this.filters);
    }

    // Order
    if (this.orderByClause) {
      params.push(`order=${this.orderByClause}`);
    }

    // Limit
    if (this.limitValue !== null) {
      params.push(`limit=${this.limitValue}`);
    }

    // Offset
    if (this.offsetValue !== null) {
      params.push(`offset=${this.offsetValue}`);
    }

    const queryString = params.length > 0 ? '?' + params.join('&') : '';
    return `${this.baseUrl}/${this.table}${queryString}`;
  }

  /**
   * 执行查询（支持 Promise 和 async/await）
   */
  async then(resolve: any, reject: any) {
    try {
      let url = this.buildUrl();
      let method = 'GET';
      let body: string | undefined = undefined;
      const headers: Record<string, string> = {
        'apikey': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      // INSERT
      if (this.insertData !== null) {
        method = 'POST';
        body = JSON.stringify(this.insertData);
        headers['Prefer'] = 'return=representation';
      }
      // UPDATE
      else if (this.updateData !== null) {
        method = 'PATCH';
        body = JSON.stringify(this.updateData);
        headers['Prefer'] = 'return=representation';
      }
      // UPSERT
      else if (this.upsertData !== null) {
        method = 'POST';
        body = JSON.stringify(this.upsertData);
        headers['Prefer'] = 'return=representation,resolution=merge-duplicates';
        if (this.upsertOptions?.onConflict) {
          headers['Prefer'] += `,on-conflict=${this.upsertOptions.onConflict}`;
        }
      }
      // DELETE
      else if (this.isDelete) {
        method = 'DELETE';
        headers['Prefer'] = 'return=representation';
      }

      // Range header
      if (this.rangeFrom !== null && this.rangeTo !== null) {
        headers['Range'] = `${this.rangeFrom}-${this.rangeTo}`;
      }

      // Single record
      if (this.isSingle) {
        headers['Accept'] = 'application/vnd.pgrst.object+json';
      }

      // 🐛 DEBUG: 记录请求信息
      console.log('[PostgREST Adapter] 发送请求:', {
        url,
        method,
        headers,
        body,
        isSingle: this.isSingle,
        insertData: this.insertData,
      });

      const response = await fetch(url, {
        method,
        headers,
        body,
      });

      // 🐛 DEBUG: 记录响应状态
      console.log('[PostgREST Adapter] 响应状态:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
      });

      // 处理错误响应
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorJson.hint || errorText;
        } catch {
          // 保持原始错误文本
        }

        const error = {
          message: errorMessage,
          details: errorText,
          hint: null,
          code: response.status.toString(),
        };

        resolve({ data: null, error, status: response.status, statusText: response.statusText });
        return;
      }

      // 处理成功响应
      const contentType = response.headers.get('content-type');
      let data: any = null;

      console.log('[PostgREST Adapter] 检查Content-Type:', { contentType, includesJson: contentType?.includes('application/json') });

      // 检查Content-Type是否包含JSON（支持application/json、application/vnd.pgrst.object+json等）
      const isJsonContent = contentType && (contentType.includes('application/json') || contentType.includes('+json'));
      console.log('[PostgREST Adapter] JSON内容检查:', { isJsonContent });

      if (isJsonContent) {
        const text = await response.text();
        console.log('[PostgREST Adapter] 响应内容:', { text, textLength: text?.length, isEmpty: !text });
        if (text) {
          data = JSON.parse(text);
          console.log('[PostgREST Adapter] 解析后的数据:', { data, isArray: Array.isArray(data) });
        } else {
          console.log('[PostgREST Adapter] ❌ 响应text为空');
        }
      } else {
        console.log('[PostgREST Adapter] ❌ Content-Type不是JSON类型');
      }

      // 如果是 single 模式，处理数据
      if (this.isSingle) {
        console.log('[PostgREST Adapter] Single模式处理前:', { data, isArray: Array.isArray(data) });
        // 如果返回的是数组，取第一个元素
        if (Array.isArray(data)) {
          data = data.length > 0 ? data[0] : null;
          console.log('[PostgREST Adapter] 从数组中提取:', { extractedData: data });
        }
        // 如果没有数据，返回错误
        if (!data) {
          console.log('[PostgREST Adapter] ❌ Single模式但无数据，返回错误');
          resolve({
            data: null,
            error: { message: 'No rows found', details: null, hint: null, code: 'PGRST116' },
            status: 406,
            statusText: 'Not Acceptable',
          });
          return;
        }
        console.log('[PostgREST Adapter] ✅ Single模式数据处理完成:', { finalData: data });
      }

      // 获取总数（从 Content-Range header）
      const contentRange = response.headers.get('content-range');
      let count: number | null = null;
      if (contentRange) {
        const match = contentRange.match(/\/(\d+|\*)/);
        if (match && match[1] !== '*') {
          count = parseInt(match[1], 10);
        }
      }

      resolve({
        data,
        error: null,
        status: response.status,
        statusText: response.statusText,
        count,
      });
    } catch (error: any) {
      reject({
        data: null,
        error: {
          message: error.message || 'Network request failed',
          details: error.stack || null,
          hint: null,
          code: 'NETWORK_ERROR',
        },
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
  }
}

/**
 * PostgREST 适配器主类
 * 模仿 Supabase 客户端的接口
 */
export class SupabasePostgRESTAdapter {
  constructor(private baseUrl: string, private apiKey: string) {}

  /**
   * 从表中查询
   */
  from(table: string) {
    return new PostgRESTQueryBuilder(this.baseUrl, this.apiKey, table);
  }

  /**
   * 调用 PostgreSQL 函数（RPC）
   */
  async rpc(functionName: string, params?: any) {
    try {
      const url = `${this.baseUrl}/rpc/${functionName}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': this.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(params || {}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          data: null,
          error: {
            message: errorText,
            details: null,
            hint: null,
            code: response.status.toString(),
          },
        };
      }

      const data = await response.json();
      return { data, error: null };
    } catch (error: any) {
      return {
        data: null,
        error: {
          message: error.message || 'RPC call failed',
          details: error.stack || null,
          hint: null,
          code: 'NETWORK_ERROR',
        },
      };
    }
  }

  /**
   * Auth 模块（本地模式下简化实现）
   */
  auth = {
    getSession: async () => ({
      data: { session: null },
      error: null,
    }),
    getUser: async () => ({
      data: { user: null },
      error: null,
    }),
    onAuthStateChange: (callback: any) => {
      // 本地模式下不支持实时认证
      return {
        data: {
          subscription: {
            unsubscribe: () => {},
          },
        },
      };
    },
    signOut: async () => ({
      error: null,
    }),
  };

  /**
   * Storage 模块（本地模式下不支持）
   */
  storage = {
    from: (bucket: string) => {
      console.warn('[PostgREST Adapter] Storage is not supported in local mode. Please use cloud Supabase or implement custom storage.');
      return {
        upload: async () => ({
          data: null,
          error: { message: 'Storage not supported in local PostgREST mode' },
        }),
        download: async () => ({
          data: null,
          error: { message: 'Storage not supported in local PostgREST mode' },
        }),
        remove: async () => ({
          data: null,
          error: { message: 'Storage not supported in local PostgREST mode' },
        }),
      };
    },
  };

  /**
   * Realtime 模块（本地模式下不支持）
   */
  channel(name: string) {
    console.warn('[PostgREST Adapter] Realtime channels are not supported in local mode.');
    return {
      on: () => this,
      subscribe: () => this,
      unsubscribe: () => {},
    };
  }
}
