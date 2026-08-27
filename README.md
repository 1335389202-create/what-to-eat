<p align="center">
  <img src="assets/readme-hero.svg" alt="今天吃什么？双场景吃饭决策产品" width="100%">
</p>

<p align="center">
  <kbd>V3.0</kbd> · <kbd>Vanilla JS</kbd> · <kbd>Mobile First</kbd> · <kbd>LocalStorage</kbd>
</p>

# 今天吃什么？

一个帮助用户结束吃饭纠结的双场景决策产品：在家时结合库存推荐菜谱，出门时用轻量盲盒推荐餐饮类型。

## Live Demo

- [在线体验（V3.0）](https://1335389202-create.github.io/what-to-eat/)
- [GitHub Repository](https://github.com/1335389202-create/what-to-eat)
- [V3.0 Release](https://github.com/1335389202-create/what-to-eat/releases/tag/v3.0.0)

## ✨ Features

| 🏠 Home Cooking | 🍽️ Eat Out |
|---|---|
| Inventory-aware recommendation | Preference filters |
| Recipe and scaled ingredients | Cuisine draw |
| Cooking confirmation | Recommendation and reroll |
| Atomic inventory deduction | Clear future restaurant boundary |

### 🏠 Home Cooking

`Inventory-aware recommendation → Recipe → Cooking → Atomic inventory deduction`

- 库存支持同名批次、数量精度、单位和可选购买日期；
- 购买时长参与推荐加权与扣减排序，但不推断保质期或食用安全；
- 推荐结果解释库存状态、购买时长贡献和 Mock 补买估价；
- 只有确认制作后才预览并一次性更新库存，失败时保持原数据。

### 🍽️ Eat Out

`Preference → Cuisine draw → Recommendation → Reroll`

- 完全随机，或先圈定想吃的餐饮类型；
- 支持不限 / 清淡 / 香辣 / 重口与三种用餐感觉；
- 结果只展示类型、描述和口味标签；
- 不伪造距离、评分、人均、店铺或排队数据。

当前类型：韩餐、泰餐、川菜、湘菜、粤菜、火锅、小炒 / 家常菜、便利店、轻食。

## 🧠 How It Works

```text
今天吃什么？
  ├─ 在家吃 → 库存 → 条件过滤 → 购买时长加权 → 菜谱 → 制作 → 原子扣减
  └─ 出去吃 → 轻量偏好 / 候选类型 → 随机抽取 → 餐饮类型 → 换一个 / 确认
```

外出能力预留为：`Cuisine Recommendation → Location → Business District → Restaurant / POI`。V3.0 只实现第一层，不请求定位，也不接入地图、POI、后端或外部 API。

## 🧭 Product Evolution

```text
V1.0  Portfolio MVP
  ↓
V2.0  Purchase-age prioritization
  ↓
V3.0  Home + Eat Out
```

- **V1.0**：完成库存、推荐、菜谱、制作与扣减闭环；
- **V2.0**：增加购买时长优先级、Schema v1 → v2 迁移与更稳健的数据恢复；
- **V3.0**：保留 Home Cooking 主流程，增加不依赖真实餐厅数据的 Eat Out MVP。

## 🧪 Validation

V2.0 正式发布门禁保持真实可追溯：主项目 151/151、部署烟测 13/13、发布预检 14/14；冻结自动化门禁合计 254/254。详见 [V2.0 retrospective](docs/iterations/v2.0-retrospective.md)。

V3.0 补充验证覆盖：

- Home / Eat Out 场景切换；
- 完全随机、指定候选、结果集合约束与换一个；
- Home Cooking smoke 与 V2 purchase-age regression；
- 320 / 390 / 768 / 1440px responsive smoke；
- keyboard、Reduce Motion 与 no console error。

本仓库没有真实用户分析数据，不虚构转化率、留存或满意度。后续重点验证决策完成率、完成用时、换一个频率，以及购买时长提示是否影响选择。

## 🛠 Tech

- 原生 HTML、CSS、JavaScript ES Modules；
- Hash 路由，兼容 GitHub Pages 子路径；
- LocalStorage Schema v2、迁移备份、校验与失败回滚；
- 静态 Mock 菜谱 / 餐饮类型数据与可解释规则；
- Node 单元测试与 Playwright 浏览器验收；
- 无框架迁移、无后端、无生产运行时依赖、无第三方 API、无 secret。

## 🗺 Future Directions

> Future versions are evidence-driven. These are candidate directions rather than a fixed implementation sequence.

| Area | Candidate directions |
|---|---|
| 🏠 Home Cooking | shopping list · purchase-to-inventory · favorites · custom recipes · nutrition / price data |
| 🤖 AI Assistance | photo recognition · constrained AI assistance · recipe generation |
| 🍽️ Eat Out | location · business districts · maps · real restaurant / POI data · multi-city support |
| ☁️ Platform & Collaboration | login · cloud sync · household sharing · reminders · WeChat Mini Program |

详细的证据门槛与候选问题见 [Post-V3.0 directions](docs/iterations/post-v3.0-directions.md)。

## 📄 Product Docs

| Document | Focus |
|---|---|
| [PRD](PRD.md) | MVP 问题、范围与验收标准 |
| [Design document](design-document.md) | UX 架构、状态与异常恢复 |
| [Prototype spec](prototype-spec.md) | 原型与核心流程规格 |
| [V2.0 retrospective](docs/iterations/v2.0-retrospective.md) | 购买时长迭代证据与发布结果 |
| [V3.0 retrospective](docs/iterations/v3.0-retrospective.md) | 双场景迭代范围、验证与待验证问题 |
| [Post-V3.0 directions](docs/iterations/post-v3.0-directions.md) | 后续候选方向与决策门槛 |

<details>
<summary><strong>Local development</strong></summary>

本项目使用 ES Modules，不能通过 `file://` 双击打开。请在仓库根目录启动静态服务器：

```bash
python -m http.server 8000
```

打开 `http://localhost:8000/`。开发验证需要 Node.js 18+：

```bash
npm install
npm test
npm run test:deployment
npm run test:release
```

</details>

<details>
<summary><strong>Project structure</strong></summary>

```text
.
├─ index.html
├─ src/
│  ├─ app.js
│  ├─ storage.js
│  ├─ purchase-age.js
│  ├─ recommender.js
│  ├─ deduction.js
│  ├─ styles.css
│  └─ data/
│     ├─ recipes.js
│     └─ cuisines.js
├─ assets/
├─ tests/
└─ docs/
```

</details>

## Known Boundaries

- 菜谱、食材价格、营养与餐饮类型均为演示数据；
- LocalStorage 仅限当前浏览器和设备；
- 购买时长不是保质期，应用不判断食材是否安全；
- V3.0 没有 GPS、地图、商圈、POI、真实餐厅、登录、AI 或后端。

## License

[MIT License](LICENSE)
