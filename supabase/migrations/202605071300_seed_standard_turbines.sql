insert into public.turbine_scenarios (
  code, name, iec_class, rated_mw, cut_in_ms, rated_speed_ms, cut_out_ms, hub_height_m, rotor_diameter_m, power_curve_json, is_template
)
values
(
  'S-3.6-IEC3',
  'Standard S 3.6MW (IEC III)',
  'III',
  3.6,
  3,
  12,
  25,
  100,
  130,
  '[{"ws":3,"kw":0},{"ws":4,"kw":120},{"ws":5,"kw":320},{"ws":6,"kw":620},{"ws":7,"kw":1020},{"ws":8,"kw":1550},{"ws":9,"kw":2200},{"ws":10,"kw":2900},{"ws":11,"kw":3400},{"ws":12,"kw":3600},{"ws":25,"kw":0}]'::jsonb,
  true
),
(
  'M-4.2-IEC2',
  'Standard M 4.2MW (IEC II)',
  'II',
  4.2,
  3,
  12,
  25,
  105,
  145,
  '[{"ws":3,"kw":0},{"ws":4,"kw":140},{"ws":5,"kw":380},{"ws":6,"kw":740},{"ws":7,"kw":1220},{"ws":8,"kw":1840},{"ws":9,"kw":2580},{"ws":10,"kw":3350},{"ws":11,"kw":3950},{"ws":12,"kw":4200},{"ws":25,"kw":0}]'::jsonb,
  true
),
(
  'L-5.0-IEC1_2',
  'Standard L 5.0MW (IEC I/II)',
  'I/II',
  5.0,
  3,
  12,
  25,
  110,
  155,
  '[{"ws":3,"kw":0},{"ws":4,"kw":170},{"ws":5,"kw":460},{"ws":6,"kw":900},{"ws":7,"kw":1480},{"ws":8,"kw":2240},{"ws":9,"kw":3120},{"ws":10,"kw":4020},{"ws":11,"kw":4700},{"ws":12,"kw":5000},{"ws":25,"kw":0}]'::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  iec_class = excluded.iec_class,
  rated_mw = excluded.rated_mw,
  cut_in_ms = excluded.cut_in_ms,
  rated_speed_ms = excluded.rated_speed_ms,
  cut_out_ms = excluded.cut_out_ms,
  hub_height_m = excluded.hub_height_m,
  rotor_diameter_m = excluded.rotor_diameter_m,
  power_curve_json = excluded.power_curve_json,
  is_template = excluded.is_template;
