# V3.0 之后：候选迭代方向

> Future versions are evidence-driven. These are candidate directions rather than a fixed implementation sequence.

## 当前产品基线

V3.0 将「今天吃什么」从单一做饭工具扩展为双场景决策产品：

- 在家吃：库存 → 推荐 → 菜谱 → 制作 → 原子扣减；
- 出去吃：偏好 → 餐饮类型盲盒 → 推荐 → 换一个 / 确认。

下一轮不按功能数量排期，而按用户是否更快完成一次真实决策来判断。

## 优先验证的问题

1. 用户能否快速理解并选择「在家吃 / 出去吃」？
2. 外出盲盒的筛选是否足够，还是仍然让用户觉得结果太泛？
3. 「换一个」出现的频率和原因是什么？
4. 购买时长提示是否真的影响了在家吃的选择？
5. 哪个断点最影响从推荐到实际吃饭的完成？

## 候选方向

### 🏠 Home Cooking

- shopping list、purchase-to-inventory；
- favorites、custom recipes；
- nutrition / price data（接入前先验证数据可信度与用户价值）。

### 🤖 AI Assistance

- photo recognition；
- constrained AI assistance；
- recipe generation。

AI 只在规则难以覆盖且结果可以解释、校验时进入产品，不替代库存和安全边界。

### 🍽️ Eat Out

- location、business districts、maps；
- real restaurant / POI data；
- multi-city support。

进入真实餐厅阶段前，需要先确认数据源、更新频率、隐私授权和无结果降级策略；不使用虚构评分、距离或人均。

### ☁️ Platform & Collaboration

- login、cloud sync；
- household sharing、reminders；
- WeChat Mini Program。

## 决策门槛

候选能力进入实现前至少满足一项：

- 解决已观察到的高频决策阻塞；
- 明显缩短完成一次吃饭决策的路径；
- 提高库存数据的复用价值；
- 有可信数据源、清晰隐私边界和可测试的失败降级。

每轮仍坚持小范围、可验证、可回退：先定义成功标准，再做最小实现，最后由 Human Release Gate 决定是否发布。

