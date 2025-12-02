# 🎯 智能函数发现逻辑
# 自动发现用户定义的函数，无需预设函数名列表

print("🔍 开始智能函数发现...")

# 获取当前命名空间中的所有名称
all_names = list(globals().keys())

# 过滤出用户定义的函数
user_functions = []
for name in all_names:
    try:
        obj = globals()[name]
        # 检查是否是函数且不是内置函数
        if (callable(obj) and
            hasattr(obj, '__name__') and
            not name.startswith('_') and  # 排除私有函数
            name not in ['print', 'len', 'max', 'min', 'sum', 'abs', 'all', 'any', 'bool', 'dict', 'list', 'set', 'str', 'int', 'float', 'range', 'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed', 'type', 'isinstance', 'hasattr', 'getattr', 'setattr', 'vars', 'dir', 'help', 'input', 'open', 'round', 'pow', 'divmod'] and  # 排除常见内置函数
            name not in ['time', 'json', 'os', 'sys', 'math', 'random', 'collections', 'itertools', 'functools', 'operator', 're', 'datetime', 'copy', 'Counter', 'defaultdict', 'OrderedDict'] and  # 排除常见导入模块
            hasattr(obj, '__code__')):  # 确保是用户定义的函数
            user_functions.append((name, obj))
    except:
        continue

print(f"   发现 {len(user_functions)} 个用户定义的函数: {[name for name, _ in user_functions]}")

# 智能选择主函数
algorithm_function = None
selected_function_name = None

if len(user_functions) == 1:
    # 只有一个函数，直接使用
    selected_function_name, algorithm_function = user_functions[0]
    print(f"✅ 自动选择唯一函数: {selected_function_name}")

elif len(user_functions) > 1:
    # 多个函数，使用启发式规则选择
    print("   检测到多个函数，使用启发式规则选择...")

    # 优先级规则：
    # 1. 名称包含常见算法关键词的函数
    algorithm_keywords = ['solution', 'solve', 'algorithm', 'main', 'process', 'calculate', 'compute', 'find', 'search', 'sort', 'optimize']

    for keyword in algorithm_keywords:
        for name, func in user_functions:
            if keyword.lower() in name.lower():
                selected_function_name, algorithm_function = name, func
                print(f"✅ 根据关键词'{keyword}'选择函数: {selected_function_name}")
                break
        if algorithm_function:
            break

    # 2. 如果没有关键词匹配，选择最后定义的函数（通常是主要逻辑）
    if not algorithm_function:
        # 根据函数定义的行号排序，选择最后定义的
        try:
            user_functions_with_line = []
            for name, func in user_functions:
                if hasattr(func, '__code__') and hasattr(func.__code__, 'co_firstlineno'):
                    line_no = func.__code__.co_firstlineno
                    user_functions_with_line.append((line_no, name, func))

            if user_functions_with_line:
                # 按行号排序，选择最后定义的
                user_functions_with_line.sort(key=lambda x: x[0])
                _, selected_function_name, algorithm_function = user_functions_with_line[-1]
                print(f"✅ 选择最后定义的函数: {selected_function_name}")
            else:
                # 兜底：选择第一个
                selected_function_name, algorithm_function = user_functions[0]
                print(f"✅ 兜底选择第一个函数: {selected_function_name}")
        except:
            # 如果获取行号失败，选择第一个
            selected_function_name, algorithm_function = user_functions[0]
            print(f"✅ 兜底选择第一个函数: {selected_function_name}")

else:
    print("⚠️  未发现任何用户定义的函数")
    print("   可能的原因:")
    print("   1. 模型只提供了代码片段，没有函数定义")
    print("   2. 函数名以下划线开头（被过滤）")
    print("   3. 代码执行过程中出现错误")

# 输出选择结果
if algorithm_function:
    print(f"🎯 最终选择函数: {selected_function_name}")

    # 尝试获取函数信息
    try:
        import inspect
        sig = inspect.signature(algorithm_function)
        print(f"   函数签名: {selected_function_name}{sig}")
    except:
        print(f"   函数参数: 无法获取签名信息")
else:
    print("❌ 未找到可调用的函数")
    print("📊 将直接运行代码并从输出解析结果...")