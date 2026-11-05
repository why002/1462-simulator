import { GAME } from './config';
import type { Grade, Station } from './types';

// 经纬度为 GCJ-02：北京—丹阳段取自用户提供的 mapchaxun 查询历史，
// 沪宁段与徐州北取自辉睿车站页；湾城按相邻站里程插值，
// 官桥采用百度百科坐标（34°55′16.59″N / 117°11′52.22″E）。
type StationRow = [
  name: string,
  km: number,
  grade: Grade,
  stop: boolean,
  lat: number,
  lon: number,
];

const ROWS: StationRow[] = [
  ['上海', 0, '特', true, 31.249601, 121.455704],
  ['上海西', 5, '一', false, 31.262897, 121.402831],
  ['南翔', 14, '特', false, 31.276967, 121.315555],
  ['安亭', 27, '三', false, 31.305102, 121.179248],
  ['昆山', 49, '一', true, 31.365937, 120.957481],
  ['苏州', 84, '一', true, 31.329503, 120.610815],
  ['苏州西', 90, '一', false, 31.341652, 120.552402],
  ['浒墅关', 96, '三', false, 31.383931, 120.511239],
  ['望亭', 104, '三', false, 31.44035, 120.46329],
  ['无锡南', 121, '一', false, 31.547949, 120.34065],
  ['无锡', 126, '特', true, 31.58792, 120.30669],
  ['戚墅堰', 154, '三', false, 31.722734, 120.067641],
  ['湾城', 159, '三', false, 31.7511, 120.0247],
  ['常州', 165, '一', true, 31.7851, 119.9731],
  ['奔牛', 183, '三', false, 31.86376, 119.813609],
  ['丹阳', 209, '二', false, 32.001825, 119.592784],
  ['镇江东', 235, '二', false, 32.192199, 119.456857],
  ['镇江', 238, '一', false, 32.197729, 119.432541],
  ['龙潭', 275, '三', false, 32.170952, 119.058535],
  ['南京东', 294, '特', false, 32.1188, 118.888875],
  ['兴卫村', 296, '三', false, 32.108036, 118.851244],
  ['南京', 303, '一', true, 32.086866, 118.797697],
  ['滁州北', 359, '二', true, 32.307947, 118.327336],
  ['明光', 423, '三', true, 32.76985, 117.988759],
  ['凤阳', 460, '三', false, 32.90509, 117.629033],
  ['蚌埠东', 476, '一', false, 32.927151, 117.457695],
  ['蚌埠', 484, '一', true, 32.943095, 117.378331],
  ['曹老集', 498, '三', false, 33.054361, 117.372094],
  ['固镇', 527, '三', false, 33.316572, 117.306709],
  ['芦岭', 549, '三', false, 33.462607, 117.153526],
  ['宿州', 574, '二', true, 33.638855, 116.995403],
  ['符离集', 588, '三', false, 33.76001, 116.986081],
  ['徐州', 649, '特', true, 34.264848, 117.207343],
  ['徐州北', 654, '特', false, 34.2966, 117.21636],
  ['前亭', 667, '二', false, 34.413685, 117.298381],
  ['枣庄西', 716, '二', true, 34.792656, 117.254253],
  ['官桥', 731, '三', false, 34.921275, 117.197839],
  ['滕州', 750, '二', false, 35.081983, 117.152998],
  ['邹城', 790, '二', false, 35.40095, 116.9583],
  ['兖州', 810, '一', true, 35.556338, 116.841171],
  ['磁窑', 860, '三', false, 35.902425, 117.107123],
  ['泰山', 895, '二', false, 36.187056, 117.11093],
  ['济南南', 960, '三', false, 36.627501, 116.939493],
  ['济南', 966, '特', true, 36.67072, 116.990934],
  ['禹城', 1021, '三', false, 36.924326, 116.633477],
  ['平原', 1053, '三', false, 37.17037, 116.439937],
  ['德州', 1087, '一', true, 37.449695, 116.287747],
  ['吴桥', 1109, '三', false, 37.629371, 116.386501],
  ['东光', 1142, '三', false, 37.89167, 116.530004],
  ['泊头', 1162, '二', false, 38.060718, 116.588418],
  ['沧州', 1201, '一', true, 38.308861, 116.878183],
  ['青县', 1232, '三', true, 38.57775, 116.83873],
  ['唐官屯', 1250, '三', false, 38.711676, 116.930727],
  ['静海', 1274, '二', true, 38.932854, 116.930004],
  ['杨柳青', 1301, '三', false, 39.142242, 117.001647],
  ['天津西', 1316, '一', true, 39.158351, 117.163322],
  ['南仓', 1333, '特', false, 39.206993, 117.175035],
  ['北仓', 1340, '三', false, 39.242823, 117.152084],
  ['汉沟镇', 1347, '三', false, 39.299307, 117.109404],
  ['杨村', 1354, '三', false, 39.354315, 117.065541],
  ['落垡', 1376, '三', false, 39.439749, 116.844472],
  ['广阳', 1389, '二', true, 39.511681, 116.70718],
  ['黄村', 1430, '二', false, 39.720237, 116.331611],
  ['北京丰台', 1447, '特', true, 39.850228, 116.301279],
  ['北京南', 1454, '特', false, 39.865011, 116.379007],
  ['北京', 1463, '特', true, 39.902802, 116.427048],
];

const PAX_BY_GRADE: Record<Grade, readonly [number, number]> = {
  特: [42, 34],
  一: [34, 28],
  二: [26, 20],
  三: [18, 14],
};

const STATIONS: Station[] = ROWS.map(([name, km, grade, stop, lat, lon]) => ({
  name,
  km,
  grade,
  stop,
  lat,
  lon,
  paxIn: stop ? PAX_BY_GRADE[grade][0] : 0,
  paxOut: stop ? PAX_BY_GRADE[grade][1] : 0,
}));

function validate(list: Station[]): void {
  if (list.length !== 66) {
    throw new Error(`Expected 66 stations, got ${list.length}`);
  }

  const stops = list.filter((station) => station.stop).length;
  if (stops !== 22) {
    throw new Error(`Expected 22 stop stations, got ${stops}`);
  }

  const gradeCounts: Record<Grade, number> = { 特: 0, 一: 0, 二: 0, 三: 0 };
  for (let i = 0; i < list.length; i += 1) {
    const station = list[i];
    gradeCounts[station.grade] += 1;
    if (i > 0 && station.km <= list[i - 1].km) {
      throw new Error(`Station km must increase at ${station.name}`);
    }
    if (
      !Number.isFinite(station.lat) ||
      !Number.isFinite(station.lon) ||
      station.lat < 30 ||
      station.lat > 41 ||
      station.lon < 115 ||
      station.lon > 123
    ) {
      throw new Error(`Station coordinate out of range at ${station.name}`);
    }
  }

  if (gradeCounts.特 !== 11 || gradeCounts.一 !== 14 || gradeCounts.二 !== 13 || gradeCounts.三 !== 28) {
    throw new Error(`Unexpected grade counts: ${JSON.stringify(gradeCounts)}`);
  }

  if (list[0].name !== '上海' || list[list.length - 1].name !== '北京') {
    throw new Error('Station list must start at 上海 and end at 北京');
  }
}

validate(STATIONS);

export { STATIONS };
export const STATION_COUNT = STATIONS.length;
export const STOP_COUNT = STATIONS.filter((station) => station.stop).length;

export function stationS(station: Station): number {
  return GAME.coreStart + station.km * GAME.metersPerKm;
}
