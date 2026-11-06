# 京沪神车 1462

基于 Three.js + TypeScript + Vite 的京沪线时间挑战小游戏：上海 → 北京，1,463 km 压缩为 14,630 游戏米。按住加速、松开制动，在 22 个停靠站完成乘客跳乘，曲线超速会脱线；到北京站停表并记录最快用时。

## 运行

需要 Node.js 20+。

```bash
npm install
npm run dev       # 开发服务器 http://localhost:5173/
npm run typecheck # TypeScript 检查
npm run build     # 产出 dist/
npm run preview   # 预览 dist/ http://localhost:4173/
```

不要直接双击 `dist/index.html`，构建产物需要通过 HTTP 服务器打开。

## 玩法

- 按住画面 / 空格 / ↑ / W 加速，松开减速。从静止起步时牵引力逐渐建立，加速度先增大再随速度回落；松开后制动力会在约 0.9 秒内平滑建立。
- 列车不停站，乘客在站台与车门之间跳上跳下；人数越多，车越重，加速和制动越慢。
- 曲线超速会脱线，约 0.9 秒后原地复位，计时不停。
- 全线 66 个三等及以上车站：22 个停靠、44 个通过；剩余站数只数停靠站。
- 1462 在济南拐入济南站，出站后经济南线在黄河大桥南侧与京沪正线会合，共桥过河；京沪正线在济南西侧以直线通过，两端用缓和曲线接入道岔。
- 线路保留了真实走向的急弯：济南出站后有最小半径约 31.5 m 的发卡弯，必须提前大幅制动；急弯处相机会切换为沿列车切线的追车视角。

## 浏览器控制台调试

打开浏览器开发者工具的 Console，页面加载后使用全局 `__game` 对象。以下命令只用于调试，不影响正常玩法。

### 按已跑里程跳转

最常用的是 `__game.teleportKm(km)`：把列车直接放到“已跑 km”的位置。

```js
__game.teleportKm(0);     // 上海站
__game.teleportKm(500);   // 已跑 500 km
__game.teleportKm(966);   // 济南站
__game.teleportKm(1463);  // 北京终点线前 0.5 m，再按住加速即可结算
__game.km;                // 当前已跑 km（只读）
```

说明：

- 传入值会自动限制在 `0–1463`；非法值（如 `NaN`）会被忽略。
- 跳转后计时不会自动清零。需要重新开一局请执行 `__game.reset()`。
- `__game.teleportKm(1463)` 会停在终点线前 0.5 m，不会立刻弹出结算。

### 其他调试命令

| 命令 | 作用 |
| --- | --- |
| `__game.km` | 当前已跑 km（只读） |
| `__game.s` | 当前内部线路坐标；`s = 70 + km × 10` |
| `__game.teleport(s)` | 按内部坐标跳转（70 = 上海，14700 = 北京终点） |
| `__game.teleportToStation('济南')` | 跳到指定车站中心 |
| `__game.teleportToRiver('长江')` | 跳到长江桥；`('黄河')` 跳到黄河大桥 |
| `__game.setSpeed(194)` | 设置游戏速度（约 0–194.4 m/s，最高约 70,000 km/h） |
| `__game.setPax(1000)` | 设置乘客数，用于测试载重 |
| `__game.forceDerail()` | 强制触发脱线 |
| `__game.setView('overview')` | 切换调试镜头，可选 `follow` / `train` / `station` / `door` / `overview` / `jinan` / `yangtze` / `yellow` |
| `__game.reset()` | 重置整局，回到上海站 |
| `__game.routeSummary.minRadius` | 当前线路的最小曲率半径（米） |
| `__game.routeSummary.jinanBypassMinDistance` | 济南正线参考测点与比赛线路的最小距离 |
| `__game.time` | 当前用时（秒） |
| `__game.v` | 当前速度（游戏米/秒） |
| `__game.pax` | 当前乘客数 |
| `__game.massFactor` | 当前载重系数 |
| `__renderer.info.render.calls` | 当前 draw calls |
| `__renderer.info.render.triangles` | 当前三角形数 |

示例：

```js
// 跳到 500 km，给 30 m/s，观察中段线路
__game.teleportKm(500);
__game.setSpeed(30);

// 跳到济南，打开济南枢纽俯视镜头
__game.teleportKm(966);
__game.setView('jinan');

// 测试满载加速/制动
__game.setPax(1000);
__game.teleportKm(0);
```

## 部署

`vite.config.ts` 使用 `base: './'`，`dist/` 为纯静态产物。仓库内的 `.github/workflows/deploy.yml` 已准备 GitHub Actions → GitHub Pages；在 GitHub 仓库 Settings → Pages 选择 **Source: GitHub Actions** 后，推送到 `main` 即可发布。

## 说明

- 玩法参考自网页小游戏的类型，代码、程序化贴图、UI 与音效均为原创实现。
- 线路走向参考 OpenRailwayMap / © OpenStreetMap contributors (ODbL)。
- 车站经纬度采用用户提供的 GCJ-02 点位；本地 `map-points.local.json` 保存 66 站、桥梁与济南线点位，已加入 `.gitignore`，不提交版本库。
- 不使用中国铁路路徽或其他商标。
