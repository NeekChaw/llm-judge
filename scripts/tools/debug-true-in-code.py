#!/usr/bin/env python3

def possiblyEquals(s1, s2):
    def get_options(segment):
        # 解析数字段，返回所有可能的整数值列表
        if not segment:
            return [0]
        res = []
        n = len(segment)
        for i in range(1, n+1):
            for j in range(i, n+1):
                for k in range(j, n+1):
                    if i == n:
                        res.append(int(segment))
                        break
                    if j == n:
                        res.append(int(segment[:i]) + int(segment[i:]))
                        break
                    if k == n:
                        res.append(int(segment[:i]) + int(segment[i:j]) + int(segment[j:]))
                        break
        return res

    def dfs(i, j, diff):
        # i,j 是 s1,s2 的指针
        # diff = 当前 s1 剩余未匹配字母长度 - s2 剩余未匹配字母长度
        if i == len(s1) and j == len(s2):
            return diff == 0
        if diff == 0:
            # 必须同步匹配字母
            if i < len(s1) and j < len(s2) and s1[i].isalpha() and s2[j].isalpha():
                if s1[i] != s2[j]:
                    return False
                return dfs(i+1, j+1, 0)
            # 如果 diff==0 但有一方还有数字，则无法匹配
            return False
        if diff > 0:
            # s1 还有字母未匹配，s2 需要消耗 diff 个字母
            if j >= len(s2):
                return False
            if s2[j].isalpha():
                return dfs(i, j+1, diff-1)
            # s2[j] 是数字，尝试所有可能的数字长度
            num_seg = []
            k = j
            while k < len(s2) and s2[k].isdigit():
                num_seg.append(s2[k])
                k += 1
                if len(num_seg) > 3:
                    break
            for seg_len in range(1, len(num_seg)+1):
                seg = ''.join(num_seg[:seg_len])
                for val in get_options(seg):
                    if dfs(i, j+seg_len, diff - val):
                        return True
            return False
        else:  # diff < 0
            # s2 还有字母未匹配，s1 需要消耗 -diff 个字母
            if i >= len(s1):
                return False
            if s1[i].isalpha():
                return dfs(i+1, j, diff+1)
            # s1[i] 是数字
            num_seg = []
            k = i
            while k < len(s1) and s1[k].isdigit():
                num_seg.append(s1[k])
                k += 1
                if len(num_seg) > 3:
                    break
            for seg_len in range(1, len(num_seg)+1):
                seg = ''.join(num_seg[:seg_len])
                for val in get_options(seg):
                    if dfs(i+seg_len, j, diff + val):
                        return True
            return False

    return dfs(0, 0, 0)

# 测试代码
if __name__ == "__main__":
    # 测试用例
    test_cases = [
        ("a", "a"),
        ("b", "1"),
        ("abc", "123")
    ]

    for i, (s1, s2) in enumerate(test_cases, 1):
        try:
            result = possiblyEquals(s1, s2)
            print(f"测试 {i}: possiblyEquals('{s1}', '{s2}') = {result}")
        except Exception as e:
            print(f"测试 {i}: 错误 - {e}")
            import traceback
            traceback.print_exc()