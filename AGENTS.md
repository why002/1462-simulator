# AGENTS.md — 京沪神车 1462

面向在本仓库工作的 agent。**当前代码与本文件优先于外部实施计划**（计划文件可能滞后）。

## 项目概览

- Three.js + TypeScript + Vite 的京沪线时间挑战小游戏：上海 → 北京，1462 次列车。
- 66 个三等及以上车站：22 个停靠上下客，44 个通过；四等及以下不建模。
- 核心线路 14,630 游戏米（1 游戏米 = 100 真实米），加 70 m 起点引线和 150 m 终点缓冲，总长 14,850。
- 玩法：按住加速、松开制动；乘客跳乘；曲线超速脱线；到北京停表并记录最快用时。
- 当前状态（2026-11-09）：M1–M9 + R1/R2 已完成并通过本地浏览器回归；济南实际经路、正线直线道岔、σ=50 发卡弯与急弯相机已更新；列车倾斜改为平衡竖直的二阶弹簧模型，脱线只由实际倾角 60° 触发、翻车动画到 90°；最高速度与过弯极限已整体 ×2（70,000 km/h 等效、`√(50R)`），`accMax = 27`、`brake = 42`，速度表盘刻度到 30,000 km/h；已接入 B 站 Toy 排行榜（榜位 1，分数为用时负十分之一秒）与分享/挑战链接/成绩图保存（成绩图底栏为当前分享用户 + 作者小字 + 挑战二维码），本地与 GitHub Pages 自动降级；尚未部署。官桥站经纬度待用户确认。

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
- `src/game/game.ts`：游戏循环、物理/脱线、相机、上下客流程、HUD 更新、结算/重跑、调试钩子 `GameDebug`。
- `src/game/hud.ts`：LED 状态、车头朝上的前方小地图、结算速度图、速度表、站名弹层、最快纪录、结算海报渲染。
- `src/game/toy.ts`：B 站 Toy SDK 的窄类型与调用封装（榜位 1 分数换算、提交/读榜/我的排名、分享、二维码、相册保存、超时与错误分类、`isToyPage()` 路径判定）。
- `src/game/leaderboard.ts`：排行榜弹层（总榜/本周/本月、前 20 名、我的排名、缓存与手动刷新）及结算页成绩上传状态。
- `src/game/share.ts`：分享面板/系统分享/二维码复制链接弹层，成绩图在 App 内保存相册、Web 端下载。
- `src/game/ledFont.ts`：LED 用的 12 行 0/1 点阵字库（81 个实际用到的字符），可直接改字形；每字后由跑马灯自动补 1 列空列。
- `tools/led_editor.py`：本地 tkinter 点阵字库编辑器，12 行网格可点击/拖动编辑、整体上下左右平移（方向键也可）、顶部跑马灯预览，保存写回 `ledFont.ts`；`--check` 只校验。
- `tools/auto_run.js`：浏览器控制台自动跑脚本，按曲率限速和制动剖面全程自动驾驶（默认 44° 目标倾角、52° 倾角保护），粘贴即从上海站开跑。
- `src/game/audio.ts` / `effects.ts` / `exchange.ts`：合成音效、火花/风线、乘客跳乘动画。
- `src/game/types.ts` / `config.ts`：接口与参数。
- `README.md`：运行方式、玩法、**浏览器控制台调试命令**（新增调试命令时同步更新）。
- `toy/toy.d.ts` / `toy/toy-js-sdk-abilities.md`：B 站 Toy SDK 官方类型与能力说明；`toy/` 已 gitignore，只作本地参考，构建和运行不得依赖该目录。
- `map-points.local.json`：本地地图点（66 站、桥梁、济南线），**已 gitignore，不提交**。
- `.github/workflows/deploy.yml`：GitHub Pages 工作流（未启用）。

## 不可破坏的约定

### 数据与线路

- 66 站 / 22 停靠 / 44 通过；等级仅 `特/一/二/三`；不含天津站；包含济南、济南南。
- 站点位置严格使用 `s = 70 + km × 10`（km 为距上海里程），`s` 单调递增；不要在其他地方另写一套站点计数。
- `path.length = 14,850`，`coreStart = 70`，`coreEnd = 14,700`，`realKmAt(14,700) = 1,463`。
- 速度显示为 `v × 360`（等效 1,463 km 尺度），最高 `vMax = 70000 / 360 ≈ 194.44 m/s`，对应 70,000 km/h；物理内部仍用游戏 m/s。
- 速度表盘刻度画到 30,000 km/h；超过后指针按同一比例继续旋转（70k 时约转 1.8 圈），不要重新夹到表盘满刻度。
- 起步牵引力不立即拉满：`traction = accStart + (1 − accStart) × smoothstep(v / accRampSpeed)`，`accStart = 0.1`、`accRampSpeed = 12 m/s`；常规加速度为 `(accMax / massFactor) × (1 − v/vMax)`，`accMax = 27 m/s²`；低速段从约 2.2 m/s² 逐渐增大，到 12 m/s 后恢复常规衰减曲线。
- 制动力也平滑建立但更快：松手后 `brakeRamp` 在 `brakeRampTime = 0.9 s` 内从 0 经 smoothstep 升到满制动（`brake / massFactor`，`brake = 42`），不要退回松手即满制动。
- 质量系数固定 `massFactor = 1.24`（240 人基准，原 `1 + 240 × 0.001`）；乘客数 `pax` 只驱动 HUD 与上下客动画，**不得再参与加速/制动计算**，不要重新引入 `paxWeight` 或按人数变化的质量。
- 速度与过弯极限已整体 ×2；牵引和制动均比旧版更强，但最高速下的制动距离仍约为旧版的 2.2 倍，过弯前必须比旧版更早松手。
- 济南实际经路（1462 走的弯线）控制点：分离点 `36.578613,116.903536`（km 952.5）→ 济南南（km 960）→ 济南（km 966）→ 济南东北经点 `36.709590,117.000743`（km 970）→ 济南线经点 `36.705241,116.942292`（km 975）→ 济南西经点 `36.701534,116.917067`（km 977）→ 桥南西经点 `36.690657,116.861892`（km 981.7）→ 汇合点 `36.700742,116.835851`（km 984.3）→ 黄河大桥 `36.717332,116.818034`（km 987.2）。
- 京沪正线在游戏内取「分离点 → 汇合点」的直线方向，中段直线，两端各用约 70 m 缓和曲线接入既有线路，形成平滑道岔；**不要再把西侧经点 1/2/3 加回渲染几何**（用户要求去掉，曲率过大）。这些详细测点只保留在 `map-points.local.json` 备查。
- 当前线路平滑 σ=50 m，最小半径约 31.5 m（济南出站后的发卡弯），这是用户要求的真实急弯；不要未经确认用增大平滑的方式“修复”。急弯相机使用 `cameraTight*` 参数切换到沿切线的追车视角。
- 长江跨河点 s=3180（河宽 15、桥长 68）；黄河 s=9942（河宽 10、桥长 13）；水面横向延伸到 9,000 游戏米；跨河提示为「跨越长江 · 南京长江大桥」/「跨越黄河 · 黄河大桥」。

### 列车姿态与脱线

- 车体倾斜的**平衡位置始终竖直**：弯道不提供“超高”内倾偏移。横向加速度 `a = v²·|κ|` 只产生瞬时的向弯外倾斜；低速或直线时车体收回到垂直。不要再加“低速向弯内收”的平衡角。
- 倾斜方向永远朝弯外。`rotation.z > 0` 会抬起右侧（车身向左倾），所以方向取 `-sign(curvature)`；`curvature > 0` 表示左转。
- 目标角：`targetTilt = -sign(κ) × clamp(atan2(v²|κ|, tiltGravity) × tiltGain, 0, tiltMax)`，`tiltGravity = 48`（旧 12；×4 使过弯极限速度 ×2）、`tiltGain = 1.3`、`tiltMax = 65°`。
- 倾斜使用**二阶弹簧阻尼**：`tiltVel += ((targetTilt − tilt) × tiltSpring − tiltVel × tiltDamping) × dt`，`tiltSpring = 50`、`tiltDamping = 9`（阻尼比约 0.64）。当前倾角和角速度共同决定下一刻，不要退回一阶插值。加大刚度会降低阻尼比、增加过冲，因而间接降低有效过弯速度。
- **脱线只由实际倾角触发**：`|tilt| ≥ derailAngle = 60°` 立即脱线；不要重新引入横向加速度阈值、持续时间或保持计时。旧的 `derailAcc`、`derailHold`、`overSpeedTime` 已删除。
- 脱线动画从触发角继续向弯外翻到 `derailTilt = 90°`，`derailReset = 0.9 s` 后回轨；复位时同时清零 `tilt` 和 `tiltVel`。
- 倾斜超过 `wheelSparkTilt = 30°` 后，弯外侧（压低一侧）车轮喷刮擦火星；密度在 30° → `derailAngle` 间按平方增长（`wheelSparkRateMin 14` → `wheelSparkRateMax 150` 颗/秒）。单颗火星寿命内由红转黄并缩小消失；内侧车轮不喷，重度倾斜时不再触发旧的制动双侧车轮火花。粒子池 140。
- 沿线不设限速牌，过弯提示只由导引带颜色与 HUD 临界提示承担。
- 轨道中央导引带改为**按当前车速连续渐变着色**：以各段曲率和当前速度算出平衡倾角 `atan(v²|κ| / tiltGravity) × tiltGain`，在 `0°→30°→60°` 之间对 绿→黄→红 做线性插值（30° 纯黄、60° 纯红，锚点角来自 `wheelSparkTilt` / `derailAngle`），`≥60°` 保持纯红。停车时全线为绿；每帧由 `world.updateGuideBand(v)` 刷新顶点色，速度变化小于 0.01 m/s 时跳过重算。
- HUD 在 `|tilt| > derailAngle × 0.82`（约 49.2°）时提示「曲线临界 · 松手减速」。
- 实测（R≈142–146 m）：新参数约 83–84 m/s 安全（峰值约 59–60°），85 m/s 在约 60° 脱线并翻到 90°，过弯极限约为旧版（41–42 m/s）的 2 倍。90° 时车体绕轨面中心线旋转，车身一侧会略微压入道砟；若近看明显，再加随倾角增大的抬升。
- 若要让弹簧参数不影响过弯难度，可把脱线判定改为平衡目标角 `targetTilt`；当前仍按实际倾角判定，以保持“看到 60° 才翻车”的因果一致。

### 视觉与 UI

- 小地图是**车头朝上的前方局部图**（面板 2:3，位于顶部计时器下方，桌面 200×300 / 手机 132×198）：列车固定在底部中央，显示前方 1,500 游戏米（约 150 真实 km）的 1462 实际经路、站点、两河短线和所有停靠站名，右上角标「前 ↑」。横向使用软压缩（`MAX_LATERAL 1400`、`LATERAL_SOFT 420`），保证济南等大弯也不会甩出窄面板；不要改回北朝上全线路图。不要画京沪正线/虚线/标签，也不要加济南放大图或退回“侧向偏移 + 里程”示意图（均为用户明确要求）。
- 小地图在游戏中始终显示（不要用极矮视口条件隐藏），但开始提示显示时隐藏：`.center-hint:not(.hidden) ~ .route-map { opacity: 0 }`；仅极矮横屏（`orientation: landscape` 且 `max-height: 359px`）例外，提示显示时也保留小地图，此时开始提示宽度用 `min(58vw, 360px, 100vw − 2×小地图宽 − 36px)` 避免压住地图。横屏矮视口（`orientation: landscape` 且 `max-height: 560px`）使用紧凑 HUD：顶栏、进度、速度表缩小，小地图按 `clamp(110px, 100dvh − 230px, 198px)` 定高并保持 2:3，右侧偏移用 `--ls-edge: max(10px, env(safe-area-inset-right))`；结算/排行榜/分享/帮助弹层同步压缩。`max-height: 359px` 时小地图改用 `clamp(120px, 100dvh − 200px, 198px)`，只隐藏开始提示的补充行并进一步压缩结算页。地图 `top` 固定为 `safe-top + 92px`，改动横屏顶栏高度时需同步。不要用宽度断点代替这套规则——手机横屏的宽度会落在桌面区间。
- 竖屏窄屏（`max-width: 900px`）的列车到站提示固定在小地图对侧的左上角：≤520px 用 `inset: safe-top+110px auto auto safe-left`、宽度 `100vw − 166px`；521–900px 顶距改为 `safe-top+124px`、宽度 `100vw − 242px`；提示宽度封顶 240/260px 且 `min-width: 0`。不要改回居中或小地图下方，避免遮挡小地图。
- 顶部计时行中间是「下一站 / 终点站」双语点阵 LED：字形来自 `src/game/ledFont.ts` 的 12 行 0/1 点阵（1 = 亮、0 = 灭，亮/暗二值，不使用 CSS 遮罩、不做渐隐），改这个文件即可改字，也可用 `tools/led_editor.py` 可视化编辑；桌面点距 3 CSS px、手机（以及横屏 34 px 高的 LED）2 CSS px（`hud.ts` 按窗口宽 <160 或高 <38 判定，按 DPR 取整，圆点半径 `max(0.75, 点距×0.36)`），12 行网格在 LED 窗口内垂直居中。桌面板高 48 px、手机 34 px（窗口内高 38 / 26 px）。排版时每个字符后固定插入 `LED_GAP = 1` 列空列、首尾各留 `LED_PAD = 2` 列，滚动步长为一列灯、约 40 px/s。文案为 `下一站：XX站　　终点站：北京站　　next station: {英文站名} Station　　terminal station: Beijing Station`；停靠站英文名集中在 `stations.ts` 的 `STATION_EN_NAMES`，启动时校验 22 个停靠站是否齐全。修改文案若引入新字符，需在 `ledFont.ts` 补字形，否则会以方框回退并在控制台告警。
- LED 有最小横向尺寸，按 2 px 点距保证至少显示 2.5 个中文字（桌面 78 px、手机 74 px，含内距与边框）。顶栏品牌区为单行，宽度不足时先隐藏「上海 → 北京」，仍不足再隐藏「京沪线」，只保留 1462；品牌文案在垂直方向居中对齐，不按底部对齐。右上角喇叭按钮一键静音，与帮助面板的 `#mute` 开关共用状态和 `localStorage` 静音记录。
- 京沪正线只在世界中有实体轨道（道砟、轨枕、双轨）；小地图不显示正线。
- 站台/雨棚/站牌/候客人数按车站等级分档；44 个通过站只有短站台/站牌。
- 结算页与成绩图都显示翻车次数；结算页线路速度图会在本局每个脱线位置画红叉（深色描边 + `#ff6b4a`），标记随成绩图一起保存（保存与分享共用同一张海报）。翻车次数与红叉数量一致，重跑清空。
- 沿线房屋只围绕车站布置，等级越高数量越多、高度越高（特/一/二/三）；树木和农田按车站等级与距离加权，高级站附近明显稀疏，低级站和无站区间更密。任何场景实例都要做轨道净空检查，检查对象包括 1462 经路和济南京沪正线，避免房屋/树木/农田压轨。农田每块带 `0.03 + rand() × 0.08` 的随机抬升，底面不得低于地面，避免田块共面 z-fighting 闪烁。
- 追车相机 FOV = `fovBase 55` + `fovSpeedGain 8 × v/vMax` + 纵向加速度项：加速变宽、制动收窄（上限 +6° / −5°，增益 `fovAccelGain 0.7`），加速度经 `fovAccelSmoothTime 0.45 s` 平滑，用于速度感；平滑时间不要调回 0.18 s，按下加速时 FOV 会跳得太快。调试视角各自固定 FOV，不受影响。
- 过弯时相机向弯外“甩出”：横向偏移 `cameraSwingDistance 4 m`、外倾 `cameraSwingRoll 5°`，强度为 `v²|κ| / cameraSwingAccel 9`（0–1），方向取 `sign(κ) × normal`（左弯向右外移并顺时针滚转），经 `cameraSwingSmoothTime 0.3 s` 平滑；直线回正。
- 触屏按住加速同时监听 Pointer Events、Touch Events 和鼠标事件兜底，全部挂在**捕获阶段**（`capture: true`）：部分手机 WebView 不派发 `pointerdown`，长按也可能触发 `pointercancel`，B 站 Toy 容器或弹层也不能拦掉按压。非 UI 目标的 `touchstart` / `touchmove` 要 `preventDefault()` 并保持 `pressing`；触摸按住期间忽略 `pointercancel`（真正抬手由 `touchend` 释放）和 `blur`（iOS 工具栏弹出会触发 blur），否则会出现“长按车不动”。UI 按钮与可滚动弹层（`#result`、`#help-overlay`、`#rank-overlay`、`#share-overlay` 等）不得拦截触摸，否则按钮和列表滚动会失效。
- `press()` 必须**先**置 `pressing` / `started` 再调用音频；`audio.ts` 导出的每个方法都经 `guard()` 包裹，音频初始化或播放失败只静音、不抛异常。Three 的动画循环一旦抛错就不再调度下一帧，音效异常会表现为“整局卡死/车不动”。
- 固定晴朗午后光照；装饰性地标（东方明珠、虎丘塔、泰山山脊、天津之眼、北京站钟楼等）暂不做。
- 不新增外部图片/字体/服务端；贴图用 Canvas，音效用 Web Audio 合成。唯一的第三方脚本是 B 站官方 Toy SDK（`toy-sdk.js`），用于排行榜与分享。

### B 站 Toy 接入

- `index.html` 在 `<head>` 异步引入官方 `//s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js`；所有 SDK 调用走 `src/game/toy.ts`，不要在别处直接读 `window.toy`。`toy/` 文档目录被 gitignore，不是构建依赖。
- 只有路径匹配 `/toy/<slug>/`（`isToyPage()`）时才调用排行榜 / 分享 / 二维码 / 相册；本地根路径和 GitHub Pages 必须走网页降级，不能反复等 handshake 超时。
- 排行榜固定用榜位 1，分数 `score = -Math.max(1, Math.floor(time × 10))`（负的十分之一秒，整数，至少 1），越快分数越高；不要改成正值或另起榜位，否则旧成绩无法解释。提交是绝对分数，服务端只保留历史最高分。
- 周期只用 `all / week / month`；每页 20 名；榜单在内存缓存，只有手动「刷新」或新成绩提交成功后才重拉，禁止定时轮询。
- 完赛自动提交一次，不要额外重复提交。结算页排名行显示 pending / 全站第 N 名 / 未登录 / 未授权 / 环境不支持 / 繁忙 / 上传失败，点击打开排行榜。`getMyRank` 是否上榜必须看 `ranked`，不能看 score。
- 分享链接路径固定为 `index.html?c=<十分之一秒>`；开始页读取 `c` 显示「分享纪录 X · 来挑战」，只用 textContent 写入，不要拼接 HTML，也不要把昵称等用户输入放进 query。
- App 内分享优先 `toy.share`；Toy 网页端打开二维码/复制链接弹层，非 Toy 网页在支持 `navigator.share` 时使用系统分享。`getQrCode` 只在 Toy 路径下调用。
- 成绩图保存：App 内用 `saveImageToAlbum`（base64Data），Web 用 `<a download>`；不要强制两者走同一路径。保存完成用 `#save-toast` 显示提示条：相册成功为「已保存到相册」，Web 下载在手机端显示「已保存到相册」、电脑端显示「已下载」，生成或保存失败显示「生成失败 / 保存失败」；提示约 2.4 s 后消失，`reset()` 时清除。
- 保存成绩图时，Toy 环境并行调用 `getQrCode`（挑战链接 `index.html?c=...`）、`getAuthorProfile` 与 `getUserProfile`，在原始 1200×1200 海报下方追加底栏：以当前分享用户的头像 + 昵称为主，作者（UP 主）缩成一行「作者：昵称」小字，右侧保留挑战二维码，成图 1200×1520；拿不到当前用户资料时退回原作者卡（头像、昵称、签名、粉丝/稿件）；非 Toy 环境保持原图。头像必须以 `crossOrigin='anonymous'` 加载，失败时用昵称首字占位，避免污染 canvas 导致 `toDataURL` 失败。
- `submitScore`、`share`、`saveImageToAlbum`、`getUserProfile` 可能等待平台授权 / 分享 / 相册弹窗，**不要加短客户端超时**；只有 `getRankList`、`getMyRank`、`getQrCode`、`isSupport` 这类查询使用 8 s / 4 s 超时。`getUserProfile` 首次会弹资料确认框，单独放宽到 20 s。真实 SDK 在非 Toy 环境 handshake 约 10 s 才失败，所以路径判定是首层保护。
- 手机端顶栏隐藏「榜」按钮以保留 LED 宽度，入口放在开始提示「查看排行榜」，结算页排名行也始终可进入；手机点入口不能触发加速（`isUiTarget` 必须包含 `#rank-hint`）。
- `getUserProfile` 只取头像和昵称用于成绩图底栏，不读取、不记录 `toyOpenId`，也不获取 UID/MID；不要把用户昵称或 `toyOpenId` 写入日志或埋点。首次调用必须由保存图片这类用户手势触发（当前在点击处理的第一段同步调用）。

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

常用：`teleport(s)`、`teleportToStation(name)`、`teleportToRiver('长江'|'黄河')`、`setSpeed(194)`、`setPax(1000)`、`forceDerail()`、`setView('follow'|'train'|'station'|'door'|'overview'|'jinan'|'yangtze'|'yellow')`、`tilt`（弧度）、`derails`、`lateralAccel()`、`routeSummary`、`path`、`stations`。

- 跳转不重置计时；需要新一局用 `reset()`。
- 新增/修改调试命令时，同步更新 `README.md` 的控制台调试表。
- `__game` 是调试接口，不要依赖它实现正常游戏逻辑。

## 验证流程

1. `npm run typecheck`、`npm run build` 通过。
2. `npm run preview` 能加载，`dist/index.html` 使用 `./assets/...`。
3. Puppeteer + Edge headless（1440×900 / 390×844）检查：无控制台报错、无横向溢出、触摸按住加速/松开制动正常。
4. 关键断言：66/22/44、`s=70+km×10`、`path.length=14850`、`realKmAt(14700)=1463`、长江 s=3180、黄河 s=9942、`__game.teleportKm(500)` → s=5070；`routeSummary.minRadius ≈ 31.5`，`mainlineTrack` 中段为直线。
5. 姿态/脱线回归：`__game.tilt` 为弧度；低速或停车过弯应回到约 0，高速向弯外；R≈142–146 m 弯 83–84 m/s 安全（峰值约 59–60°），85 m/s 在 ≥60° 脱线并翻到约 90°，0.9 s 后回轨且 `tilt` 归零；沿线无实体限速牌，导引带颜色随 `derailAngle` 同步。
6. 玩法回归：苏州上下客、通过站提示、强制脱线、终点结算/重跑、最快纪录持久化、静音持久化；济南发卡弯处追车相机能看到完整列车。整局按理论限速曲线约 141 s（旧参数约 264 s）；保守自动驾驶（0.8×限速、提前制动）实测 2:46.5 无脱线完赛，最高 49,728 km/h；0→100 m/s 约 7.7 s，120 m/s 制动到停车约 264 m。
7. LED 字库：`py tools/led_editor.py --check` 通过（12 行、81 个字符、各行等宽）；桌面/手机 LED 窗口内高 38 / 26 px，22 个停靠站文案无缺字告警。
8. 性能目标：draw calls <180、三角形 <500k；当前约 104 calls / 274k 三角形（上海起点）。
9. B 站 Toy：在 `/toy/<slug>/` 路径下 mock `window.toy`，完赛应提交并显示「全站第 N 名 · 最快 X」；排行榜前 20 名、周期切换、自己高亮与刷新正常；`toy.share` mock 成功时显示「已分享」；禁用 `toy.share` / `navigator.share` 后应打开二维码 + 复制链接弹层；App mock 下保存图片走 `saveImageToAlbum`。根路径必须即时降级：排行榜提示「需在 B 站 Toy 内使用」、分享弹层无二维码、保存走下载，不能等待 handshake 超时。手机 390×844 无横向溢出，LED 宽度约 107 px，开始页点「查看排行榜」不得触发加速。

## 当前待办

- 真实 B 站 Toy 环境联调：首次提交的用户数据确认弹窗、原生分享面板、相册权限与线上榜单数据。
- 官桥站经纬度确认。
- 部署（GitHub Pages）需用户确认后执行；正式 Toy 功能需把 `dist/` 部署到 B 站 Toy。
- 外部实施计划可能滞后；以代码、README 和本文件为准。
