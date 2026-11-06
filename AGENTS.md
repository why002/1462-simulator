# AGENTS.md — 京沪神车 1462

面向在本仓库工作的 agent。**当前代码与本文件优先于外部实施计划**（计划文件可能滞后）。

## 项目概览

- Three.js + TypeScript + Vite 的京沪线时间挑战小游戏：上海 → 北京，1462 次列车。
- 66 个三等及以上车站：22 个停靠上下客，44 个通过；四等及以下不建模。
- 核心线路 14,630 游戏米（1 游戏米 = 100 真实米），加 70 m 起点引线和 150 m 终点缓冲，总长 14,850。
- 玩法：按住加速、松开制动；乘客跳乘、载重；曲线超速脱线；到北京停表并记录最快用时。
- 当前状态（2026-11-06）：M1–M9 + R1/R2 已完成并通过本地浏览器回归；济南实际经路、正线直线道岔、σ=50 发卡弯与急弯相机已更新；列车倾斜改为平衡竖直的二阶弹簧模型，脱线只由实际倾角 60° 触发、翻车动画到 90°；尚未部署。官桥站经纬度待用户确认。

## 常用命令

```bash
npm install
npm run dev       # http://localhost:5173/
npm run typecheck # tsc --noEmit
npm run build     # tsc --noEmit && vite build，输出 dist/
npm run preview   # http://localhost:4173/
```

- 不要用 `file://` 直接打开 `dist/index.html`，用 dev/preview 或静态服务器。
- 构建产物是纯静态 `dist/`，`vite.config.ts` 的 `base` 为 `'./'`，适配 GitHub Pages 子路径。

## 代码地图

- `src/main.ts`：渲染器、相机、场景组装；暴露 `window.__renderer` 和 `window.__game`。
- `src/game/stations.ts`：66 站单一数据源（name / km / grade / stop / lat / lon / paxIn / paxOut），启动时校验数量和等级。
- `src/game/route.ts`：全部站坐标 + 济南实际经路途径点作为控制点；等距圆柱投影 → centripetal Catmull-Rom → 1 m s 采样 → σ=50 m 高斯平滑（首尾加 3σ 直线）→ 缩放到 14,630 m；京沪正线取分离点→汇合点直线，两端 70 m 缓和曲线道岔；跨河点也在这里。
- `src/game/world.ts`：天空、地面、轨道、接触网、沿线场景、站台/站牌、跨河桥（开放式细杆桁架，`mergeGeometries`）、济南京沪正线实体轨道（道砟/轨枕/钢轨）。
- `src/game/train.ts`：SS9 风格机车 + 1 节绿皮车厢；双点贴轨、受电弓、车侧文字。
- `src/game/game.ts`：游戏循环、物理/脱线/载重、相机、上下客流程、HUD 更新、结算/重跑、调试钩子 `GameDebug`。
- `src/game/hud.ts`：LED 状态、北朝上小地图、速度表、站名弹层、最快纪录、分享。
- `src/game/audio.ts` / `effects.ts` / `exchange.ts`：合成音效、火花/风线、乘客跳乘动画。
- `src/game/types.ts` / `config.ts`：接口与参数。
- `README.md`：运行方式、玩法、**浏览器控制台调试命令**（新增调试命令时同步更新）。
- `map-points.local.json`：本地地图点（66 站、桥梁、济南线），**已 gitignore，不提交**。
- `.github/workflows/deploy.yml`：GitHub Pages 工作流（未启用）。

## 不可破坏的约定

### 数据与线路

- 66 站 / 22 停靠 / 44 通过；等级仅 `特/一/二/三`；不含天津站；包含济南、济南南。
- 站点位置严格使用 `s = 70 + km × 10`（km 为距上海里程），`s` 单调递增；不要在其他地方另写一套站点计数。
- `path.length = 14,850`，`coreStart = 70`，`coreEnd = 14,700`，`realKmAt(14,700) = 1,463`。
- 速度显示为 `v × 360`（等效 1,463 km 尺度），54 m/s 对应 19,440 km/h；物理内部仍用游戏 m/s。
- 济南实际经路（1462 走的弯线）控制点：分离点 `36.578613,116.903536`（km 952.5）→ 济南南（km 960）→ 济南（km 966）→ 济南东北经点 `36.709590,117.000743`（km 970）→ 济南线经点 `36.705241,116.942292`（km 975）→ 济南西经点 `36.701534,116.917067`（km 977）→ 桥南西经点 `36.690657,116.861892`（km 981.7）→ 汇合点 `36.700742,116.835851`（km 984.3）→ 黄河大桥 `36.717332,116.818034`（km 987.2）。
- 京沪正线在游戏内取「分离点 → 汇合点」的直线方向，中段直线，两端各用约 70 m 缓和曲线接入既有线路，形成平滑道岔；**不要再把西侧经点 1/2/3 加回渲染几何**（用户要求去掉，曲率过大）。这些详细测点只保留在 `map-points.local.json` 备查。
- 当前线路平滑 σ=50 m，最小半径约 31.5 m（济南出站后的发卡弯），这是用户要求的真实急弯；不要未经确认用增大平滑的方式“修复”。急弯相机使用 `cameraTight*` 参数切换到沿切线的追车视角。
- 长江跨河点 s=3180（河宽 15、桥长 68）；黄河 s=9942（河宽 10、桥长 13）；水面横向延伸到 9,000 游戏米；跨河提示为「跨越长江 · 南京长江大桥」/「跨越黄河 · 黄河大桥」。

### 列车姿态与脱线

- 车体倾斜的**平衡位置始终竖直**：弯道不提供“超高”内倾偏移。横向加速度 `a = v²·|κ|` 只产生瞬时的向弯外倾斜；低速或直线时车体收回到垂直。不要再加“低速向弯内收”的平衡角。
- 倾斜方向永远朝弯外。`rotation.z > 0` 会抬起右侧（车身向左倾），所以方向取 `-sign(curvature)`；`curvature > 0` 表示左转。
- 目标角：`targetTilt = -sign(κ) × clamp(atan2(v²|κ|, tiltGravity) × tiltGain, 0, tiltMax)`，`tiltGravity = 12`、`tiltGain = 1.3`、`tiltMax = 65°`。
- 倾斜使用**二阶弹簧阻尼**：`tiltVel += ((targetTilt − tilt) × tiltSpring − tiltVel × tiltDamping) × dt`，`tiltSpring = 50`、`tiltDamping = 7.2`（阻尼比约 0.51）。当前倾角和角速度共同决定下一刻，不要退回一阶插值。加大刚度会降低阻尼比、增加过冲，因而间接降低有效过弯速度。
- **脱线只由实际倾角触发**：`|tilt| ≥ derailAngle = 60°` 立即脱线；不要重新引入横向加速度阈值、持续时间或保持计时。旧的 `derailAcc`、`derailHold`、`overSpeedTime` 已删除。
- 脱线动画从触发角继续向弯外翻到 `derailTilt = 90°`，`derailReset = 0.9 s` 后回轨；复位时同时清零 `tilt` 和 `tiltVel`。
- 沿线限速牌与轨道导引带颜色由同一角阈值反推：`v = √(tiltGravity × tan(derailAngle / tiltGain) / κ) ≈ √(12.5R)`，改 `derailAngle` 会自动同步。
- HUD 在 `|tilt| > derailAngle × 0.82`（约 49.2°）时提示「曲线临界 · 松手减速」。
- 实测（R≈145 m）：39 m/s 通过时倾角峰值约 57.7°；41 m/s 在约 60.1° 脱线并翻到 90°。90° 时车体绕轨面中心线旋转，车身一侧会略微压入道砟；若近看明显，再加随倾角增大的抬升。
- 若要让弹簧参数不影响过弯难度，可把脱线判定改为平衡目标角 `targetTilt`；当前仍按实际倾角判定，以保持“看到 60° 才翻车”的因果一致。

### 视觉与 UI

- 小地图是**北朝上**：直接使用 `path.x/z`，东=右、北=上；**只画 1462 实际经路**（66 站、列车红点、两河短线、济南曲线）和「北 ↑」。不要画京沪正线/虚线/标签，也不要加济南放大图或退回“侧向偏移 + 里程”示意图（均为用户明确要求）。
- 京沪正线只在世界中有实体轨道（道砟、轨枕、双轨）；小地图不显示正线。
- 站台/雨棚/站牌/候客人数按车站等级分档；44 个通过站只有短站台/站牌。
- 固定晴朗午后光照；装饰性地标（东方明珠、虎丘塔、泰山山脊、天津之眼、北京站钟楼等）暂不做。
- 不新增外部图片/字体/服务端；贴图用 Canvas，音效用 Web Audio 合成。

### 坐标与数据来源

- 车站经纬度为 GCJ-02，按用户提供原样记录。
- **需要新的经纬度时直接问用户，不要自行搜索、猜测或用相近地点替代。** 官桥站当前使用京沪线坐标 `lat 34.921275, lon 117.197839`；用户另给过 `lon 117.421145, lat 34.846885`，尚未确认，不要静默切换。
- `map-points.local.json` 是用户可复用的本地数据文件；更新后保持 gitignore，绝不提交。
- 南京长江大桥点位已存入该文件；当前长江跨河点仍按 s=3180 布置。

### 协作与安全

- 只借鉴参考站的玩法类型；**不复制**其代码、贴图、文案或 UI 素材；不使用中国铁路路徽或其他商标。
- 线路走向参考 OpenRailwayMap / © OpenStreetMap contributors (ODbL)，保留署名。
- **未经用户明确要求，不要 `git commit`、`git push`、创建远程仓库或开启 GitHub Pages。**
- 不要绕过网站访问控制；不要自动化抓取用户明确要求“问我要”的坐标。
- 修改后至少运行 `npm run typecheck` 和 `npm run build`；涉及 UI 的改动要在浏览器实测，不要只凭类型检查宣布完成。
- 手感/数值调参按用户字面要求实现，并用浏览器实测（截图或时序数据）；主动说明副作用（过弯难度、穿模、参数耦合），不要静默改平衡。

## 浏览器调试 API

页面加载后，在 DevTools Console 使用 `window.__game`：

```js
__game.teleportKm(500);   // 跳到已跑 500 km
__game.km;                // 当前已跑 km
__game.teleportKm(966);   // 济南
__game.teleportKm(1463);  // 终点线前 0.5 m；再加速才结算
__game.reset();           // 重置整局
```

常用：`teleport(s)`、`teleportToStation(name)`、`teleportToRiver('长江'|'黄河')`、`setSpeed(54)`、`setPax(1000)`、`forceDerail()`、`setView('follow'|'train'|'station'|'door'|'overview'|'jinan'|'yangtze'|'yellow')`、`tilt`（弧度）、`derails`、`lateralAccel()`、`routeSummary`、`path`、`stations`。

- 跳转不重置计时；需要新一局用 `reset()`。
- 新增/修改调试命令时，同步更新 `README.md` 的控制台调试表。
- `__game` 是调试接口，不要依赖它实现正常游戏逻辑。

## 验证流程

1. `npm run typecheck`、`npm run build` 通过。
2. `npm run preview` 能加载，`dist/index.html` 使用 `./assets/...`。
3. Puppeteer + Edge headless（1440×900 / 390×844）检查：无控制台报错、无横向溢出、触摸按住加速/松开制动正常。
4. 关键断言：66/22/44、`s=70+km×10`、`path.length=14850`、`realKmAt(14700)=1463`、长江 s=3180、黄河 s=9942、`__game.teleportKm(500)` → s=5070；`routeSummary.minRadius ≈ 31.5`，`mainlineTrack` 中段为直线。
5. 姿态/脱线回归：`__game.tilt` 为弧度；低速或停车过弯应回到约 0，高速向弯外；R≈145 m 弯 39 m/s 安全（峰值约 57.7°），41 m/s 在 ≥60° 脱线并翻到约 90°，0.9 s 后回轨且 `tilt` 归零；限速牌与导引带颜色随 `derailAngle` 同步。
6. 玩法回归：苏州上下客、通过站提示、强制脱线、终点结算/重跑、最快纪录持久化、静音持久化；济南发卡弯处追车相机能看到完整列车。
7. 性能目标：draw calls <180、三角形 <500k；当前约 104 calls / 274k 三角形（上海起点）。

## 当前待办

- 官桥站经纬度确认。
- 部署（GitHub Pages）需用户确认后执行。
- 外部实施计划可能滞后；以代码、README 和本文件为准。
