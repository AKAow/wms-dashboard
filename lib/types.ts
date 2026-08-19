export interface Site {
  id: string;
  name: string;
  site_number: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  elevation: number | null;
  location_name: string | null;
  ipack_email: string | null;
  gmail_sync_enabled: boolean;
  gmail_query: string | null;
  sync_gmail_account: string | null;
  is_active: boolean;
  created_at: string;
  report_client: string | null;
  report_project_name: string | null;
  report_writer: string | null;
  report_approval: string | null;
}

export interface UserSiteAccess {
  id: string;
  user_id: string;
  site_id: string;
  role: "admin" | "viewer";
  granted_at: string;
}

export interface DailyStat {
  id: string;
  site_id: string;
  date: string;
  channel: string;
  avg_value: number | null;
  max_value: number | null;
  min_value: number | null;
  std_value: number | null;
  data_count: number | null;
}

export interface Measurement {
  id: string;
  site_id: string;
  timestamp: string;
  ch1: number | null;
  ch2: number | null;
  ch3: number | null;
  ch4: number | null;
  ch5: number | null;
  ch6: number | null;
  ch7: number | null;
  ch8: number | null;
  ch13: number | null;
  ch14: number | null;
  ch15: number | null;
  ch16: number | null;
  ch17: number | null;
  ch21: number | null;
  ch22: number | null;
}

export interface UploadHistory {
  id: string;
  site_id: string;
  source: "gmail" | "manual";
  file_name: string | null;
  date_range_start: string | null;
  date_range_end: string | null;
  records_inserted: number | null;
  status: "pending" | "success" | "failed";
  error_message: string | null;
  created_at: string;
}

export const CHANNEL_LABELS: Record<string, string> = {
  ch1: "100m 풍속 (N)",
  ch2: "96m 풍속 (N)",
  ch3: "80m 풍속 (N)",
  ch4: "80m 풍속 (S)",
  ch5: "60m 풍속 (N)",
  ch6: "60m 풍속 (S)",
  ch7: "40m 풍속 (N)",
  ch8: "40m 풍속 (S)",
  ch13: "97m 풍향",
  ch14: "77m 풍향",
  ch15: "57m 풍향",
  ch16: "37m 풍향",
  ch17: "기압 (hPa)",
  ch21: "습도 (%RH)",
  ch22: "온도 (°C)",
};

export const WIND_CHANNELS = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7", "ch8"];
export const DIRECTION_CHANNELS = ["ch13", "ch14", "ch15", "ch16"];
