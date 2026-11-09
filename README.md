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
- 列车不停站，乘客在站台与车门之间跳上跳下；乘客数只影响画面与统计，加速和制动固定按 240 人基准计算。
- 曲线超速会脱线，约 0.9 秒后原地复位，计时不停。轨道中央的导引带会随当前车速连续渐变：按各段曲率算出的平衡倾角从 0° 到 30° 由绿渐变到黄、30° 到 60° 由黄渐变到红、60° 以上保持红，可提前判断当前速度能否安全过弯。
- 全线 66 个三等及以上车站：22 个停靠、44 个通过；剩余站数只数停靠站。
- 1462 在济南拐入济南站，出站后经济南线在黄河大桥南侧与京沪正线会合，共桥过河；京沪正线在济南西侧以直线通过，两端用缓和曲线接入道岔。
- 抵达北京后，结算卡会展示本局线路速度图：北朝上，蓝 → 绿 → 黄 → 红对应由慢到快，可回看哪里减速、哪里跑满。结算页可保存一张含用时、统计和线路速度图的 1200×1200 PNG：B 站 Toy 内写入系统相册，网页端直接下载。
- 接入 B 站 Toy JS SDK：完赛成绩自动提交「全站最快榜」，可按总榜 / 本周 / 本月查看前 20 名、自己的名次并手动刷新；分享链接会带上本次用时（`?c=十分之一秒`），好友打开后会在开始页看到挑战纪录。B 站 App 内分享拉起原生分享面板，网页端使用系统分享或二维码 / 复制链接弹层。本地预览或未部署在 `/toy/<slug>/` 时会优雅降级为「排行榜需在 B 站 Toy 内使用」，不会卡在加载状态。
- 线路保留了真实走向的急弯：济南出站后有最小半径约 31.5 m 的发卡弯，必须提前大幅制动；急弯处相机会切换为沿列车切线的追车视角。
- 计时器下方的小地图跟随车头旋转，车头固定在底部，显示前方一段实际经路并标注沿途停靠站名，便于提前看清弯道。
- 顶部计时行中间的黄色点阵 LED 滚动显示「下一站：XX站」「终点站：北京站」及对应英文，终到北京后只保留终点站信息。字形保存在 `src/game/ledFont.ts` 的 12 行 0/1 矩阵里，直接改 0/1 即可调整；每个字符后会自动空 1 列，也可以用 `tools/led_editor.py` 可视化编辑。
- 机车牵引声由 AudioWorklet 实时生成 VVVF 开关波形（正弦与三角载波比较后的 A 相电压，参考 VVVF-Simulator 的相电压模式），基频 f1 = 0.9v：异步段 300 Hz（约 4,800 km/h 以下）→ 400 Hz（约 4,800–7,600 km/h）；约 7,600 km/h 起同步 21 分频，随后 15 分频（约 11,520）→ 11 分频 SHE（约 14,400）→ 7 分频 SHE（约 18,240）→ 5 分频（约 22,560）→ 广域 3 分频（约 30,000）→ 单脉冲方波（约 45,000 km/h）。再生制动时同一套模式反向回落，响度为牵引的 85%（约 2 m/s 以下淡出）。载波边带、SHE 谐波与方波谐波由开关过程自然产生，不再手工叠加 1.5× 泛音；轨缝哐当声保留。

## B 站 Toy 排行榜与分享

- `index.html` 引入官方 `toy-sdk.js`；所有 SDK 调用集中在 `src/game/toy.ts`，排行榜 UI 在 `src/game/leaderboard.ts`，分享与海报在 `src/game/share.ts`。
- 排行榜只使用榜位 1：分数 = `-max(1, floor(用时秒 × 10))`，即负的十分之一秒（至少 1），越快分数越高；服务端只保留历史最高分。榜单读取前 20 名并在本地缓存，只有手动「刷新」或新成绩提交成功后才重新拉取，避免轮询消耗共享额度。
- 完赛自动提交一次成绩；结算页显示「全站第 N 名 · 最快 X」或未登录 / 未授权 / 环境不支持等状态。点结算页的排名行或桌面右上角「榜」打开排行榜，手机端入口在开始页「查看排行榜」。
- 分享路径固定为 `index.html?c=<十分之一秒>`，开始页会把 `c` 显示为「分享纪录 X · 来挑战」。B 站 App 内调用 `toy.share` 拉起原生分享面板；Toy 网页端打开二维码 / 复制链接弹层；非 Toy 网页在浏览器支持时优先使用系统分享。
- `toy.saveImageToAlbum` 仅在 App 内可用，网页端保存图片改为浏览器下载；分享二维码由 `toy.getQrCode` 生成。
- 本地 `npm run dev` 访问根路径时不在 `/toy/<slug>/` 下，排行榜会提示「需在 B 站 Toy 内使用」，分享直接走网页降级；验证 Toy 分支需使用形如 `/toy/<slug>/` 的路径并 mock `window.toy`，或在真实 B 站 Toy 环境联调。

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
| `__game.setPax(1000)` | 设置乘客数，用于测试上下客显示 |
| `__game.forceDerail()` | 强制触发脱线 |
| `__game.setView('overview')` | 切换调试镜头，可选 `follow` / `train` / `station` / `door` / `rear` / `overview` / `jinan` / `yangtze` / `yellow` |
| `__game.reset()` | 重置整局，回到上海站 |
| `__game.routeSummary.minRadius` | 当前线路的最小曲率半径（米） |
| `__game.routeSummary.jinanBypassMinDistance` | 济南正线参考测点与比赛线路的最小距离 |
| `__game.time` | 当前用时（秒） |
| `__game.v` | 当前速度（游戏米/秒） |
| `__game.pax` | 当前乘客数 |
| `__game.massFactor` | 固定载重系数（240 人基准） |
| `__game.vvvf` | 当前 VVVF 状态：`motorHz` / `carrierHz` / `pulses` / `sync` / `she` / `square` / `level`（只读） |
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

## 全局自动跑脚本

`tools/auto_run.js` 是浏览器控制台用的自动驾驶脚本：从上海站自动起步，按线路曲率提前减速、通过全部弯道，到北京站停表。打开游戏页面，把文件内容粘贴到 DevTools Console 回车即可，脚本会立即重置并开跑。

```js
__autoRun.stop();                      // 停止并松手
__autoRun.status();                    // 用时、速度、目标限速、倾角、脱线次数
__autoRun.start({ reset: false });     // 从当前位置继续
__autoRun.start({ tiltLimitDeg: 50 }); // 更激进；默认 44°，越接近 60° 越容易脱线
```

默认按 44° 目标倾角（约等于 0.8×极限速度）规划，实际倾角到 52° 会强制制动保护；更激进可调高 `tiltLimitDeg`。脚本只派发空格键事件，不修改游戏内部状态；想先加载而不自动开跑，可在粘贴前执行 `window.__autoRunManual = true`。脚本中的线路/车辆参数与 `src/game/config.ts` 保持一致，改游戏调参后需同步。

## LED 点阵字库编辑

LED 字形保存在 `src/game/ledFont.ts`，共 81 个实际用到的字符、12 行 0/1 点阵。可用本地 Python 编辑器可视化修改并写回：

```bash
py tools/led_editor.py          # 打开编辑器和跑马灯预览
py tools/led_editor.py --check  # 只校验文件格式
```

界面左侧选择字符，右侧点格编辑（左键点亮/熄灭，拖动可连续绘制），顶部跑马灯按游戏内「每字后空 1 列」的排版实时预览。工具栏可整体上/下/左/右移字形，也可以点格子后按方向键平移；移出边界的点会被裁掉。点「保存到文件」或按 Ctrl+S 写回 `src/game/ledFont.ts`；加/删列会改变该字符宽度。编辑器使用 Python 3 + tkinter，无需额外依赖。

## 部署

`vite.config.ts` 使用 `base: './'`，`dist/` 为纯静态产物。仓库内的 `.github/workflows/deploy.yml` 已准备 GitHub Actions → GitHub Pages；在 GitHub 仓库 Settings → Pages 选择 **Source: GitHub Actions** 后，推送到 `main` 即可发布。GitHub Pages 不在 `/toy/<slug>/` 路径下，排行榜与 B 站原生分享会自动降级；正式 Toy 功能需把 `dist/` 部署到 B 站 Toy。

## 说明

- 玩法参考自网页小游戏的类型，代码、程序化贴图、UI 与音效均为原创实现。
- 线路走向参考 OpenRailwayMap / © OpenStreetMap contributors (ODbL)。
- 车站经纬度采用用户提供的 GCJ-02 点位；本地 `map-points.local.json` 保存 66 站、桥梁与济南线点位，已加入 `.gitignore`，不提交版本库。
- 不使用中国铁路路徽或其他商标。
