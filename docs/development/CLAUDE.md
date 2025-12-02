# AI Benchmark V2 - Claude Code Development Guide

An advanced AI model evaluation platform supporting multiple evaluator types, real-time task monitoring, and comprehensive analytics.

## 🎯 Project Overview

**Current Version**: v2.5 🚀  
**Development Status**: ✅ Production Ready  
**Database Version**: v2.5 (Model default configuration system)  
**Architecture**: Next.js 15 + TypeScript + Supabase + E2B Cloud Sandboxes + Reasoning Models Support  

This is a sophisticated LLM evaluation system that supports:
- Multi-dimensional AI model benchmarking
- Real-time code execution in secure sandboxes
- Advanced template system with custom configurations
- Comprehensive analytics and export capabilities
- **🆕 Model default configuration system** with reasoning model support
- **🆕 Thinking chain (Chain-of-Thought) execution** for reasoning models
- **🆕 Flexible tag-based model categorization** (非推理, 推理, 多模态)

## 🏗️ Core Architecture

### Frontend Stack
- **Framework**: Next.js 15.4.4 with App Router
- **Language**: TypeScript with strict mode
- **Styling**: Tailwind CSS + shadcn/ui components
- **State Management**: React hooks + server state
- **Charts**: Recharts library for analytics

### Backend Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Next.js API   │────│   Supabase      │────│     Redis       │
│   Routes        │    │   PostgreSQL    │    │   (BullMQ)      │
│   (Port 3000)   │    │   (Database)    │    │   (Task Queue)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │
         └───────────────────────┼─────────────────────┐
                                 │                     │
                    ┌─────────────────┐    ┌─────────────────┐
                    │   E2B Cloud     │    │   LLM APIs      │
                    │   Sandboxes     │    │   (Multi-Provider)│
                    │   (Code Exec)   │    │   OpenAI/Claude │
                    └─────────────────┘    └─────────────────┘
```

### Key Directories
```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   ├── tasks/         # Task management
│   │   ├── system/        # System configuration
│   │   └── evaluations/   # Evaluation endpoints
│   ├── workbench/         # Main application UI
│   ├── analytics/         # Analytics dashboard
│   └── settings/          # Configuration pages
├── lib/                   # Core business logic
│   ├── task-processor/    # Task execution engine
│   ├── llm-client.ts     # LLM API abstraction
│   ├── supabase.ts       # Database client
│   └── queue.ts          # Task queue management
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── analytics/        # Chart components
│   └── layout/           # Layout components
└── types/                # TypeScript definitions
```

## 🚀 Common Development Commands

### Development Workflow
```bash
# Start development server (includes task processor)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run type checking
npm run type-check

# Run linting
npm run lint

# Format code
npm run format
```

### Task Processor Commands
```bash
# Start task processor manually
npx tsx start-processor.ts --auto

# Test token data flow
npx tsx test-token-validation-enhanced.ts

# Check system status
npx tsx check-system-status.ts

# Monitor verification results
npx tsx monitor-verification-results.ts
```

### Database Operations
```bash
# Run database migrations
npx tsx scripts/run-unified-config-migration.ts

# 🆕 Run model default configuration migration (v2.5)
npx tsx migrate-model-defaults.ts

# Check database health
curl http://localhost:3000/api/system/health

# Test database connections
npx tsx test-db-connection.ts
```

### Docker Deployment
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Scale application
docker-compose up -d --scale app=3
```

## 🧠 Core Components Deep Dive

### 1. Task Processing System (`src/lib/task-processor/`)

The heart of the evaluation system with multiple processing modes:

- **ScriptTaskProcessor**: Primary evaluation engine
- **ProcessorConfigManager**: Configuration management
- **Unified task routing**: Handles different evaluator types

Key files:
- `script-processor.ts`: Main task processing logic (1374 lines)
- Core methods: `processTask()`, `processSubTask()`, `executeEvaluation()`

### 2. LLM Client Abstraction (`src/lib/llm-client.ts`)

Multi-provider LLM interface supporting:
- OpenAI (GPT models)
- Anthropic (Claude models)  
- SiliconFlow (Chinese providers)
- Intelligent token allocation
- Cost estimation and usage tracking

Key methods:
- `callLLM()`: Unified API interface
- `estimateTokens()`: Token usage prediction
- `normalizeResponse()`: Provider response standardization

### 3. Evaluation Framework

#### Template System (Dual Architecture)
- **Unified Templates**: Traditional shared configuration
- **Custom Templates**: Dimension-specific configurations
  - Individual test cases per dimension
  - Dimension-level system prompts  
  - Flexible weight configurations

#### Evaluator Types
- **PROMPT**: AI-based evaluation using LLM models
- **REGEX**: Pattern matching with scoring rules
- **CODE**: E2B sandbox execution with performance metrics
- **HUMAN**: Manual evaluation interface

### 4. Database Schema (PostgreSQL/Supabase)

Core tables:
```sql
-- Main entities
templates         # Evaluation templates
dimensions        # Scoring dimensions  
evaluators        # Scoring algorithms
models           # LLM model configurations
test_cases       # Evaluation test cases

-- Task management
evaluation_tasks     # Main tasks
evaluation_results   # Individual evaluations

-- Configuration
system_configs      # System-wide settings
api_providers       # LLM provider configurations
```

## 🔧 Development Guidelines

### Code Patterns

#### API Route Structure
```typescript
// src/app/api/[endpoint]/route.ts
import { withMonitoring } from '@/lib/monitoring';

export const GET = withMonitoring('endpoint_name', async (request) => {
  try {
    const supabase = createClient();
    // Implementation...
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Message' }, { status: 500 });
  }
});
```

#### Database Operations
```typescript
// Always use the centralized Supabase client
import { createClient } from '@/lib/supabase';

const supabase = createClient();
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('field', value);
```

#### Task Processing Pattern
```typescript
// Use unified task processor service
import { getTaskProcessorService } from '@/lib/task-processor';

const processorService = getTaskProcessorService();
const result = await processorService.processTask(taskData);
```

### Environment Configuration

#### Required Variables
```bash
# Database
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key

# LLM APIs  
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
SILICONFLOW_API_KEY=your_siliconflow_key

# E2B Code Execution
E2B_API_KEY=your_e2b_key

# Redis Queue
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=ai_benchmark_redis_2025
```

#### Optional Performance Tuning
```bash
DEFAULT_CONCURRENT_LIMIT=10
DEFAULT_API_TIMEOUT=60000
DEFAULT_MAX_RETRIES=3
ENABLE_VERBOSE_LOGGING=true
```

### Testing Strategy

#### API Testing
```bash
# System health
curl http://localhost:3000/api/system/health

# Task management
curl http://localhost:3000/api/tasks

# Configuration
curl http://localhost:3000/api/system/config
```

#### Integration Testing
```bash
# E2B integration
./scripts/verify-e2b-integration.sh

# Complete system test
npx tsx scripts/test-all-fixes.ts

# Performance testing
npx tsx test-performance.ts
```

## 🎯 Key Features Implementation

### 1. Dual Template System
Located in: `src/app/workbench/tasks/new/page.tsx`
- Unified templates: Standard evaluation approach
- Custom templates: Advanced dimension-specific configuration

### 2. Real-time Task Monitoring  
- WebSocket connections for live updates
- BullMQ integration for reliable job processing
- Comprehensive progress tracking

### 3. E2B Code Execution
- Secure cloud sandbox execution
- Multi-language support (Python, JavaScript, TypeScript)
- Detailed execution metrics and performance data

### 4. Advanced Analytics
Located in: `src/app/analytics/`
- Comprehensive reporting system
- Excel export with multiple worksheets
- Token usage and cost analysis

### 5. System Configuration Management
Located in: `src/app/settings/system/`
- Dynamic configuration without restarts
- Database-persisted settings
- Validation and default value management

### 6. 🏗️ CODE Evaluator Architecture (v2.0+)
Located in: `src/lib/evaluator-engine.ts`, `ARCHITECTURE.md`

**🚨 CRITICAL ARCHITECTURE NOTE:**
- **NEW ARCHITECTURE**: Test cases are at QUESTION level, not evaluator level
- **CORRECT**: `evaluator.config.test_cases = []` (empty array for universal evaluators)
- **INCORRECT**: Adding test cases to evaluator config
- **Data Source**: Test cases extracted from question description using `extractExamplesFromDescription()`
- **Key Files**:
  - `evaluator-engine.ts:2128` - Example parser
  - `evaluator-engine.ts:527` - Field compatibility mapping
  - `ARCHITECTURE.md` - Complete architecture documentation

**If you see empty test_cases in evaluator config, this is CORRECT in the new architecture!**

### 7. 🆕 Model Default Configuration System (v2.5)
Located in: `src/app/library/models/ModelsContent.tsx`, `src/app/workbench/tasks/new/page.tsx`
- **Model-level default parameters**: Pre-configured max_tokens, temperature, thinking_budget
- **Tag-based categorization**: 非推理 (Non-reasoning), 推理 (Reasoning), 多模态 (Multimodal)
- **Dual configuration mode**: Use model defaults or custom task-specific settings
- **Reasoning model support**: Thinking chain token allocation for CoT models
- **Smart validation**: Automatic checks for model configuration completeness
- **Cost transparency**: Clear indication of thinking chain token costs

#### Key Components:
- `src/lib/llm-client.ts`: Enhanced LLM client with thinking_budget support
- `src/lib/task-processor/script-processor.ts`: Model configuration resolution logic
- `src/app/api/models/`: API endpoints supporting new configuration fields
- `migrate-model-defaults.ts`: Database migration script for new fields

## 🔍 Troubleshooting Common Issues

### Task Processing Problems
```bash
# Check processor status
npx tsx check-system-status.ts

# Reset stuck tasks  
npx tsx scripts/reset-stuck-subtasks.ts

# Investigate specific task
npx tsx analyze-task-[id]-progress.ts
```

### Database Connection Issues
```bash
# Test database connectivity
npx tsx test-db-simple.ts

# Verify table schema
npx tsx scripts/investigate-database-schema.ts
```

### LLM API Problems
```bash
# Test API connectivity
npx tsx test-llm-config.ts

# Debug token issues
npx tsx debug-token-data-flow-issue.ts
```

## 📊 Performance Considerations

### Concurrency Management
- Default concurrent limit: 10 tasks
- Configurable via system settings
- Real concurrent execution (not serial)

### Token Optimization  
- Intelligent token allocation based on complexity
- Provider-specific optimizations
- Usage tracking and cost estimation

### Database Performance
- Comprehensive indexing strategy
- Connection pooling via Supabase
- Optimized queries with proper joins

## 🔐 Security Implementation

### API Security
- Input validation on all endpoints
- SQL injection prevention via Supabase client
- Rate limiting and timeout protections

### Data Protection
- Environment variable security for API keys
- Supabase Row Level Security (RLS) policies
- Secure sandbox execution via E2B

### Production Hardening
- HTTPS enforcement via nginx configuration
- Docker container isolation
- Regular security audits of dependencies

## 📈 Scalability Architecture

### Horizontal Scaling
- Stateless application design
- Redis-based session storage
- Load balancer ready (nginx configuration included)

### Performance Monitoring
- Built-in monitoring middleware
- Comprehensive logging system
- Health check endpoints for uptime monitoring

---

**Development Philosophy**: Maintainable, scalable, and thoroughly tested code with comprehensive error handling and monitoring capabilities.

**Key Principle**: Always use the existing abstractions (task-processor, llm-client, supabase client) rather than creating new database connections or processing logic.