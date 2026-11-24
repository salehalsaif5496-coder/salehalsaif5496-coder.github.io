-- جوجو — مكتبة وصفات قهوتها (jojo_recipes).  Idempotent; safe to re-run (service role / SQL editor).
-- Jojo's own home library: V60-style drip for a Baratza Encore (grind 1–40; drip ≈ 13–20).
-- 4 hot + 4 iced (Japanese-style flash brew: hot water poured straight onto ice in the server).
-- Each step: at_sec = when to start the pour, pour_to_g = scale reading (water only — tare with the ice
-- and the dripper on), note = what to do.  Bloom first, then pulses; the last pour_to_g = water.
-- The JSON below is also read by jojo/test/recipes.test.js (ratios, grind range, steps).
insert into public.jojo_recipes as t
  (id, name, style, roast, dose, water, ice, temp_c, target_sec, grind_encore, steps, tastes, note)
select r.id, r.name, r.style, r.roast, r.dose, r.water, r.ice, r.temp_c, r.target_sec, r.grind_encore, r.steps, r.tastes, r.note
from jsonb_to_recordset($recipes$
[
  {"id":"hot-calm-morning","name":"صباحي الهادئ","style":"hot","roast":["medium"],
   "dose":15,"water":240,"ice":0,"temp_c":93,"target_sec":180,"grind_encore":15,
   "steps":[{"at_sec":0,"pour_to_g":45,"note":"بلّلي القهوة كلها بهدوء وخليها تتنفس"},
            {"at_sec":45,"pour_to_g":120,"note":"صبّي بدواير صغيرة من النص لبرّا"},
            {"at_sec":75,"pour_to_g":180,"note":"كملي بنفس الهدوء"},
            {"at_sec":105,"pour_to_g":240,"note":"آخر صبّة، وبعدها لفّي الدريبر لفّة خفيفة"}],
   "tastes":["حلو","خفيف"],
   "note":"وصفة يومية متوازنة: حلوة وناعمة، تبدين فيها يومك على رواق 🤍"},

  {"id":"hot-light-bloom","name":"زهرة الصباح","style":"hot","roast":["light"],
   "dose":15,"water":250,"ice":0,"temp_c":95,"target_sec":195,"grind_encore":14,
   "steps":[{"at_sec":0,"pour_to_g":45,"note":"بلّلي القهوة كلها وحرّكي الدريبر شوي"},
            {"at_sec":45,"pour_to_g":100,"note":"صبّي ببطء على النص"},
            {"at_sec":70,"pour_to_g":150,"note":"دواير صغيرة"},
            {"at_sec":95,"pour_to_g":200,"note":"كملي"},
            {"at_sec":120,"pour_to_g":250,"note":"آخر صبّة، وخليها تنزل كلها"}],
   "tastes":["حامض","خفيف"],
   "note":"للمحاصيل الفاتحة: موية أحر وطحنة أنعم عشان تطلع الفواكه والزهور 🌸"},

  {"id":"hot-dark-cocoa","name":"شوكلاتة المسا","style":"hot","roast":["dark"],
   "dose":16,"water":250,"ice":0,"temp_c":88,"target_sec":165,"grind_encore":18,
   "steps":[{"at_sec":0,"pour_to_g":40,"note":"بلّلي القهوة كلها، الغامقة تفور أكثر — عادي"},
            {"at_sec":40,"pour_to_g":150,"note":"صبّة وحدة هادية بدواير"},
            {"at_sec":80,"pour_to_g":250,"note":"آخر صبّة، ولا تحركين كثير"}],
   "tastes":["مر","ثقيل"],
   "note":"للمحاصيل الغامقة: موية أبرد شوي وطحنة أخشن عشان تطلع شوكلاتية بدون مرارة زايدة ☕"},

  {"id":"hot-afternoon-big","name":"كوب العصرية","style":"hot","roast":["medium","dark"],
   "dose":20,"water":320,"ice":0,"temp_c":92,"target_sec":210,"grind_encore":17,
   "steps":[{"at_sec":0,"pour_to_g":60,"note":"بلّلي القهوة كلها وخليها تتنفس"},
            {"at_sec":45,"pour_to_g":140,"note":"صبّي بدواير من النص لبرّا"},
            {"at_sec":80,"pour_to_g":220,"note":"كملي بهدوء"},
            {"at_sec":115,"pour_to_g":320,"note":"آخر صبّة، ولفّي الدريبر لفّة خفيفة"}],
   "tastes":["حلو","ثقيل"],
   "note":"كوب كبير للمذاكرة أو الجلسة الطويلة، قوامه أثقل وطعمه حلو 📚"},

  {"id":"iced-pink-berry","name":"توتي المثلّج","style":"iced","roast":["light"],
   "dose":20,"water":200,"ice":120,"temp_c":94,"target_sec":150,"grind_encore":13,
   "steps":[{"at_sec":0,"pour_to_g":50,"note":"حطي الثلج بالسيرفر أول، وبلّلي القهوة كلها"},
            {"at_sec":40,"pour_to_g":125,"note":"صبّي بدواير صغيرة"},
            {"at_sec":70,"pour_to_g":200,"note":"آخر صبّة، وبعدها حرّكي السيرفر عشان يذوب الثلج"}],
   "tastes":["حامض","حلو","خفيف"],
   "note":"قهوة باردة منعشة طعمها مثل التوت، حلوة بالعصر 🍓"},

  {"id":"iced-caramel","name":"كراميل بارد","style":"iced","roast":["medium"],
   "dose":20,"water":180,"ice":120,"temp_c":92,"target_sec":150,"grind_encore":14,
   "steps":[{"at_sec":0,"pour_to_g":45,"note":"الثلج بالسيرفر، وبلّلي القهوة كلها"},
            {"at_sec":40,"pour_to_g":115,"note":"صبّي بهدوء بدواير"},
            {"at_sec":70,"pour_to_g":180,"note":"آخر صبّة، وحرّكي السيرفر"}],
   "tastes":["حلو","ثقيل"],
   "note":"باردة وحلوة مثل الكراميل، وقوامها حلو مع الثلج 🧊"},

  {"id":"iced-night-dark","name":"ليل بارد","style":"iced","roast":["dark"],
   "dose":22,"water":200,"ice":130,"temp_c":88,"target_sec":140,"grind_encore":16,
   "steps":[{"at_sec":0,"pour_to_g":45,"note":"الثلج بالسيرفر، وبلّلي القهوة كلها"},
            {"at_sec":35,"pour_to_g":120,"note":"صبّة هادية"},
            {"at_sec":65,"pour_to_g":200,"note":"آخر صبّة، وحرّكي السيرفر"}],
   "tastes":["مر","ثقيل"],
   "note":"للي تحب القهوة الغامقة: بارد وقوي وشوكلاتي 🌙"},

  {"id":"iced-summer-breeze","name":"نسمة الصيف","style":"iced","roast":["light","medium"],
   "dose":18,"water":170,"ice":100,"temp_c":93,"target_sec":140,"grind_encore":14,
   "steps":[{"at_sec":0,"pour_to_g":40,"note":"الثلج بالسيرفر، وبلّلي القهوة كلها"},
            {"at_sec":35,"pour_to_g":105,"note":"دواير صغيرة"},
            {"at_sec":65,"pour_to_g":170,"note":"آخر صبّة، وحرّكي السيرفر"}],
   "tastes":["خفيف","حلو"],
   "note":"كوب صغير خفيف ومنعش، يمشي مع أي وقت باليوم 🎀"}
]
$recipes$::jsonb) as r(id text, name text, style text, roast text[], dose numeric, water numeric, ice numeric,
                       temp_c numeric, target_sec int, grind_encore int, steps jsonb, tastes text[], note text)
on conflict (id) do update set
  name = excluded.name, style = excluded.style, roast = excluded.roast, dose = excluded.dose,
  water = excluded.water, ice = excluded.ice, temp_c = excluded.temp_c, target_sec = excluded.target_sec,
  grind_encore = excluded.grind_encore, steps = excluded.steps, tastes = excluded.tastes, note = excluded.note;
