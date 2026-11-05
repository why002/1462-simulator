import { GAME } from './config';
import type { Grade, Station } from './types';

type StationRow = [name: string, km: number, grade: Grade, stop: boolean];

const ROWS: StationRow[] = [
  ['上海', 0, '特', true],
  ['上海西', 5, '一', false],
  ['南翔', 14, '特', false],
  ['安亭', 27, '三', false],
  ['昆山', 49, '一', true],
  ['苏州', 84, '一', true],
  ['苏州西', 90, '一', false],
  ['浒墅关', 96, '三', false],
  ['望亭', 104, '三', false],
  ['无锡南', 121, '一', false],
  ['无锡', 126, '特', true],
  ['戚墅堰', 154, '三', false],
  ['湾城', 159, '三', false],
  ['常州', 165, '一', true],
  ['奔牛', 183, '三', false],
  ['丹阳', 209, '二', false],
  ['镇江东', 235, '二', false],
  ['镇江', 238, '一', false],
  ['龙潭', 275, '三', false],
  ['南京东', 294, '特', false],
  ['兴卫村', 296, '三', false],
  ['南京', 303, '一', true],
  ['滁州北', 359, '二', true],
  ['明光', 423, '三', true],
  ['凤阳', 460, '三', false],
  ['蚌埠东', 476, '一', false],
  ['蚌埠', 484, '一', true],
  ['曹老集', 498, '三', false],
  ['固镇', 527, '三', false],
  ['芦岭', 549, '三', false],
  ['宿州', 574, '二', true],
  ['符离集', 588, '三', false],
  ['徐州', 649, '特', true],
  ['徐州北', 654, '特', false],
  ['前亭', 667, '二', false],
  ['枣庄西', 716, '二', true],
  ['官桥', 731, '三', false],
  ['滕州', 750, '二', false],
  ['邹城', 790, '二', false],
  ['兖州', 810, '一', true],
  ['磁窑', 860, '三', false],
  ['泰山', 895, '二', false],
  ['济南南', 960, '三', false],
  ['济南', 966, '特', true],
  ['禹城', 1021, '三', false],
  ['平原', 1053, '三', false],
  ['德州', 1087, '一', true],
  ['吴桥', 1109, '三', false],
  ['东光', 1142, '三', false],
  ['泊头', 1162, '二', false],
  ['沧州', 1201, '一', true],
  ['青县', 1232, '三', true],
  ['唐官屯', 1250, '三', false],
  ['静海', 1274, '二', true],
  ['杨柳青', 1301, '三', false],
  ['天津西', 1316, '一', true],
  ['南仓', 1333, '特', false],
  ['北仓', 1340, '三', false],
  ['汉沟镇', 1347, '三', false],
  ['杨村', 1354, '三', false],
  ['落垡', 1376, '三', false],
  ['广阳', 1389, '二', true],
  ['黄村', 1430, '二', false],
  ['北京丰台', 1447, '特', true],
  ['北京南', 1454, '特', false],
  ['北京', 1463, '特', true],
];

const PAX_BY_GRADE: Record<Grade, readonly [number, number]> = {
  特: [42, 34],
  一: [34, 28],
  二: [26, 20],
  三: [18, 14],
};

const STATIONS: Station[] = ROWS.map(([name, km, grade, stop]) => ({
  name,
  km,
  grade,
  stop,
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
