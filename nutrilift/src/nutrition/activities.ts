// Hoạt động thể chất với giá trị MET theo Compendium of Physical Activities
// (cùng nguồn OpenNutriTracker sử dụng). kcal = MET × cân nặng (kg) × giờ.

export interface ActivityDef {
  code: string;
  name: string;
  met: number;
  group: string;
}

export const ACTIVITIES: ActivityDef[] = [
  { code: "17150", name: "Đi bộ chậm (~3 km/h)", met: 2.8, group: "Đi bộ & chạy" },
  { code: "17190", name: "Đi bộ vừa (~5 km/h)", met: 3.5, group: "Đi bộ & chạy" },
  { code: "17220", name: "Đi bộ nhanh (~6,5 km/h)", met: 5.0, group: "Đi bộ & chạy" },
  { code: "17080", name: "Đi bộ leo dốc / trekking", met: 6.0, group: "Đi bộ & chạy" },
  { code: "12020", name: "Chạy bộ nhẹ (jogging)", met: 7.0, group: "Đi bộ & chạy" },
  { code: "12030", name: "Chạy 8 km/h", met: 8.3, group: "Đi bộ & chạy" },
  { code: "12050", name: "Chạy 10 km/h", met: 9.8, group: "Đi bộ & chạy" },
  { code: "12070", name: "Chạy 12 km/h", met: 11.8, group: "Đi bộ & chạy" },
  { code: "12180", name: "Chạy trên máy (vừa)", met: 9.0, group: "Đi bộ & chạy" },
  { code: "17133", name: "Leo cầu thang", met: 8.8, group: "Đi bộ & chạy" },

  { code: "01010", name: "Đạp xe nhẹ (<16 km/h)", met: 4.0, group: "Đạp xe" },
  { code: "01020", name: "Đạp xe vừa (16–19 km/h)", met: 6.8, group: "Đạp xe" },
  { code: "01030", name: "Đạp xe nhanh (19–22 km/h)", met: 8.0, group: "Đạp xe" },
  { code: "02011", name: "Xe đạp tập — nhẹ", met: 3.5, group: "Đạp xe" },
  { code: "02012", name: "Xe đạp tập — vừa", met: 6.8, group: "Đạp xe" },
  { code: "02014", name: "Xe đạp tập — mạnh / spinning", met: 8.8, group: "Đạp xe" },

  { code: "02050", name: "Tập tạ (thông thường)", met: 3.5, group: "Phòng gym" },
  { code: "02055", name: "Tập tạ cường độ cao", met: 6.0, group: "Phòng gym" },
  { code: "02040", name: "Circuit training", met: 8.0, group: "Phòng gym" },
  { code: "02210", name: "HIIT", met: 8.0, group: "Phòng gym" },
  { code: "02030", name: "Calisthenics vừa (hít xà, chống đẩy...)", met: 3.8, group: "Phòng gym" },
  { code: "02020", name: "Calisthenics mạnh (burpee, nhảy...)", met: 8.0, group: "Phòng gym" },
  { code: "02090", name: "Máy elip (vừa)", met: 5.0, group: "Phòng gym" },
  { code: "02095", name: "Máy leo bậc", met: 9.0, group: "Phòng gym" },
  { code: "02080", name: "Máy chèo thuyền (vừa)", met: 7.0, group: "Phòng gym" },
  { code: "02068", name: "Nhảy dây", met: 11.8, group: "Phòng gym" },
  { code: "02160", name: "Yoga", met: 2.5, group: "Phòng gym" },
  { code: "02165", name: "Pilates", met: 3.0, group: "Phòng gym" },
  { code: "02170", name: "Giãn cơ", met: 2.3, group: "Phòng gym" },
  { code: "03015", name: "Aerobic / Zumba", met: 7.3, group: "Phòng gym" },

  { code: "18310", name: "Bơi thong thả", met: 6.0, group: "Bơi lội" },
  { code: "18240", name: "Bơi sải nhanh", met: 9.8, group: "Bơi lội" },
  { code: "18250", name: "Bơi ếch", met: 5.3, group: "Bơi lội" },

  { code: "15030", name: "Cầu lông (giải trí)", met: 5.5, group: "Thể thao" },
  { code: "15020", name: "Cầu lông (thi đấu)", met: 7.0, group: "Thể thao" },
  { code: "15605", name: "Bóng đá (giải trí)", met: 7.0, group: "Thể thao" },
  { code: "15610", name: "Bóng đá (thi đấu)", met: 10.0, group: "Thể thao" },
  { code: "15711", name: "Bóng chuyền", met: 4.0, group: "Thể thao" },
  { code: "15055", name: "Bóng rổ", met: 6.5, group: "Thể thao" },
  { code: "15675", name: "Tennis", met: 7.3, group: "Thể thao" },
  { code: "15660", name: "Bóng bàn", met: 4.0, group: "Thể thao" },
  { code: "15640", name: "Pickleball", met: 4.5, group: "Thể thao" },
  { code: "15110", name: "Đấm bao cát", met: 5.5, group: "Thể thao" },
  { code: "15100", name: "Boxing / kickboxing (đối kháng)", met: 7.8, group: "Thể thao" },
  { code: "15430", name: "Võ thuật (nhịp vừa)", met: 5.3, group: "Thể thao" },
  { code: "15425", name: "Võ thuật (nhịp nhanh)", met: 10.3, group: "Thể thao" },
  { code: "15535", name: "Leo núi đá / leo tường", met: 7.5, group: "Thể thao" },

  { code: "05020", name: "Dọn dẹp nhà cửa", met: 3.3, group: "Sinh hoạt" },
  { code: "08245", name: "Làm vườn", met: 3.8, group: "Sinh hoạt" },
  { code: "03025", name: "Khiêu vũ / nhảy", met: 5.0, group: "Sinh hoạt" },
];

export function activityKcal(met: number, weightKg: number, minutes: number): number {
  return Math.round((met * weightKg * minutes) / 60);
}
