// Seven shifts on Mount Elgo: the drive-up radio talk from D. Marsh (text + beeps only), the sky/fog mood of each drive,
// the night's schedule (check-ins, distant smoke, power outages, dead-radio wildfires), how hard the thing below pushes, and
// the secrets / bodies that appear on the mountain as the season goes on.
const L = (start_s, speaker, text) => ({ start_s, speaker, text, duration_s: Math.max(2.6, 1.6 + text.length * 0.055) });
const CUES = (arrive) => [{ id: 'arrive_lot', time_s: arrive }, { id: 'engine_off', time_s: arrive + 2 }, { id: 'door_open', time_s: arrive + 6.5 }, { id: 'door_close', time_s: arrive + 8.2 }, { id: 'fade_black', time_s: arrive + 9, fade_duration_s: 2.0 }];
export const SHIFTS = [
  null,
  { n: 1, title: 'Night 1 \u2014 First Watch', mood: 'hazy dawn', intro: null /* the original morning drive (mychief-intro.json) */,
    sched: [{ at: 21 * 60 + 40, type: 'checkin', text: 'Elgo, Base. Evening check-in. How are things up top?' }, { at: 22 * 60 + 30, type: 'fire' }], aggr: 0 },
  { n: 2, title: 'Night 2 \u2014 Brownout', mood: 'overcast dusk', intro: { lines: [
      L(0.6, 'BOSS', 'Unit Four, Kettle Base. You made it through your first night. How did you sleep?'),
      L(6.6, 'PLAYER', 'Barely. Something was moving down below the tower.'),
      L(11.4, 'BOSS', 'Elk come up to the summit to lick the salt off the rocks. Do not let it get in your head.'),
      L(18.6, 'BOSS', 'Heads up. The generator has been acting up since the cold snap. If the tower goes dark, you remember the drill.'),
      L(26.8, 'PLAYER', 'Stairs Key, unlock the gate, down to the generator shed. Fill it, pull it.'),
      L(32.4, 'BOSS', 'That is it. In and out. Do not stop to look at anything down there.'),
      L(38.6, 'BOSS', 'And keep your sidearm on you. Just... keep it on you.'),
      L(56.5, 'BOSS', 'Kettle Base out.')], cue_markers: CUES(52) },
    sched: [{ at: 21 * 60 + 30, type: 'checkin', text: 'Elgo, Base. Check-in. Generator holding?' }, { at: 22 * 60 + 15, type: 'outage' }, { at: 23 * 60 + 40, type: 'fire' }], aggr: 0.45 },
  { n: 3, title: 'Night 3 \u2014 Dead Air', mood: 'amber fog', intro: { lines: [
      L(0.6, 'BOSS', 'Elgo, Base. Fog is sitting in the drainages this morning. It burns off by noon.'),
      L(7.0, 'PLAYER', 'Marsh. Who had this tower before me?'),
      L(11.0, 'BOSS', '...A lot of people. It is a hard posting. Nobody stays a whole season.'),
      L(17.4, 'BOSS', 'The repeater on Kettle Ridge is failing. If you lose me tonight, it is the equipment, not you.'),
      L(25.0, 'BOSS', 'If you see fire and cannot raise me, there is a hose pack at the trailhead cache. Knock it down yourself, then get back up top.'),
      L(35.0, 'PLAYER', 'Copy. Hose cache at the trailhead.'),
      L(39.0, 'BOSS', 'Walk the trail markers. Do not cut through the trees.'),
      L(56.5, 'BOSS', 'Kettle Base out.')], cue_markers: CUES(52) },
    sched: [{ at: 21 * 60 + 35, type: 'checkin', text: 'Elgo, Base... signal is breaking up... check in when you can.' }, { at: 22 * 60 + 20, type: 'deadfire' }], aggr: 0.6 },
  { n: 4, title: 'Night 4 \u2014 Dry Lightning', mood: 'stormy twilight', intro: { lines: [
      L(0.6, 'BOSS', 'Unit Four. A front is coming over the divide tonight. Dry lightning. Expect starts.'),
      L(7.4, 'PLAYER', 'Marsh, there is something scratched into the water tank leg. Deep. Like someone used a knife.'),
      L(14.8, 'BOSS', 'Old lookouts carve all kinds of things. Long nights.'),
      L(19.6, 'BOSS', 'Storm might knock the power out. Key, stairs, generator. You know it by now.'),
      L(26.4, 'BOSS', 'If something follows you down there, do not run. Turn around and make noise. A lot of noise.'),
      L(34.0, 'PLAYER', 'Make noise. With what?'),
      L(37.6, 'BOSS', 'You know with what.'),
      L(56.5, 'BOSS', 'Base out.')], cue_markers: CUES(52) },
    sched: [{ at: 21 * 60 + 50, type: 'outage' }, { at: 23 * 60 + 20, type: 'deadfire' }], aggr: 0.7 },
  { n: 5, title: 'Night 5 \u2014 Red Sky', mood: 'eerie red sunset', intro: { lines: [
      L(0.6, 'BOSS', 'Elgo. Base. Sky is red over the old burn this morning. Smoke from the east districts.'),
      L(7.2, 'PLAYER', 'There was a man in a forestry jacket down by the trail. Marsh, he has been dead a long time.'),
      L(15.0, 'BOSS', 'Do not touch anything. I will... I will send someone up.'),
      L(20.6, 'PLAYER', 'When?'),
      L(23.0, 'BOSS', 'When the road is clear. Until then you hold that tower. That is the job.'),
      L(29.6, 'BOSS', 'And Unit Four. If I call you and I sound wrong, you do not answer. You do not open that gate for anybody.'),
      L(56.5, 'BOSS', 'Base out.')], cue_markers: CUES(52) },
    sched: [{ at: 21 * 60 + 30, type: 'checkin', text: 'Elgo. Come down to the gate. I am at the bottom of the stairs.' }, { at: 22 * 60 + 10, type: 'deadfire' }, { at: 23 * 60 + 40, type: 'outage' }], aggr: 0.8 },
  { n: 6, title: 'Night 6 \u2014 Ashfall', mood: 'ashfall', intro: { lines: [
      L(0.6, 'BOSS', 'Unit Four, how copy.'),
      L(3.8, 'PLAYER', 'Loud and clear. Did you send anyone up? Nobody came.'),
      L(8.8, 'BOSS', 'The road crew turned back at Hale Creek. Said something was standing in the road. Would not say what.'),
      L(16.8, 'BOSS', 'Repeater is failing again. Power too. You are going to be on your own a lot tonight.'),
      L(23.8, 'PLAYER', 'I have been on my own the whole time.'),
      L(28.0, 'BOSS', 'Two more nights. Then the season closes and I drive up there myself.'),
      L(56.5, 'BOSS', 'Base out.')], cue_markers: CUES(52) },
    sched: [{ at: 21 * 60 + 45, type: 'outage' }, { at: 22 * 60 + 50, type: 'deadfire' }], aggr: 0.9 },
  { n: 7, title: 'Night 7 \u2014 Last Light', mood: 'blood twilight', intro: { lines: [
      L(0.6, 'BOSS', 'Last night of the season, Elgo. You did good. Better than most.'),
      L(6.0, 'PLAYER', 'Marsh. Okafor. Varga. Lindqvist. They were all lookouts here. All of them.'),
      L(12.6, 'BOSS', '...I know.'),
      L(15.4, 'BOSS', 'I signed every one of their transfer papers. I told myself they quit and walked out.'),
      L(22.4, 'BOSS', 'Tonight, whatever happens, you keep the fires out, keep the lights on, and you make it to two o\u2019clock.'),
      L(30.8, 'PLAYER', 'And then?'),
      L(33.4, 'BOSS', 'Then you come home. That is an order.'),
      L(56.5, 'BOSS', 'Kettle Base out.')], cue_markers: CUES(52) },
    sched: [{ at: 21 * 60 + 50, type: 'deadfire' }, { at: 23 * 60 + 10, type: 'outage' }, { at: 24 * 60 + 20, type: 'fire' }], aggr: 1 },
];
export const SHIFT_START = 21 * 60, SHIFT_END = 26 * 60, CLOCK_RATE = 1.25; // game minutes per second (~4 minutes a shift)
// sky + fog moods for the drive (applied on top of the morning preset) and a lighter touch at night
export const MOODS = {
  'hazy dawn':       { fog: 0xd6c3a6, dens: 1 / 2100, sun: 0xffc27a, sunI: 2.3, hemi: 0xb4c8e0, hemiI: 0.75, exp: 1.0, bg: 1.0 },
  'overcast dusk':   { fog: 0x7d8590, dens: 1 / 1300, sun: 0x9aa4b0, sunI: 0.9, hemi: 0x707a88, hemiI: 0.6, exp: 0.85, bg: 0.5 },
  'amber fog':       { fog: 0xc0844a, dens: 1 / 650, sun: 0xffa050, sunI: 1.5, hemi: 0xb08a60, hemiI: 0.6, exp: 0.95, bg: 0.65 },
  'stormy twilight': { fog: 0x3c4450, dens: 1 / 850, sun: 0x6a7a90, sunI: 0.55, hemi: 0x3a4658, hemiI: 0.45, exp: 0.8, bg: 0.32 },
  'eerie red sunset':{ fog: 0x9a3a22, dens: 1 / 1000, sun: 0xff4a20, sunI: 2.0, hemi: 0x8a4a40, hemiI: 0.5, exp: 0.9, bg: 0.55 },
  'ashfall':         { fog: 0x5a5a5e, dens: 1 / 750, sun: 0xb0a898, sunI: 0.8, hemi: 0x6a6a70, hemiI: 0.5, exp: 0.85, bg: 0.42 },
  'blood twilight':  { fog: 0x5a0e0a, dens: 1 / 850, sun: 0xd01a0a, sunI: 1.3, hemi: 0x501818, hemiI: 0.4, exp: 0.85, bg: 0.32 },
};
export const NIGHT_MOODS = { 1: null, 2: { fog: 0x0e1218, dens: 1 / 3800 }, 3: { fog: 0x1a140c, dens: 1 / 1500 }, 4: { fog: 0x0a0d12, dens: 1 / 1800, hemiI: 0.32 }, 5: { fog: 0x1a0c08, dens: 1 / 2600 }, 6: { fog: 0x111214, dens: 1 / 1700 }, 7: { fog: 0x1c0605, dens: 1 / 2000, hemi: 0x301218 } };
// anchors are resolved by the ground builder: tank, gen, out (outhouse), trail (0..1 along the trail), fire, bush, stairs
export const SECRETS = [
  { id: 's01', night: 1, type: 'scratch', anchor: 'tankLeg', title: 'Scratched into the water tank leg', text: 'DONT GO DOWN AFTER DARK. Cut deep into the timber with a knife, the letters gone grey with years of weather. Someone went over them again more recently.', carve: 'DONT GO DOWN\nAFTER DARK' },
  { id: 's02', night: 1, type: 'note', anchor: 'gen', off: [-1.3, 0.9], title: 'Generator log, torn page', text: 'Gen log - Sept 9. Refilled 01:40. Something on the stairs above me the whole time I poured. Did not look up. Could hear it breathing in time with me. - R.O.' },
  { id: 's03', night: 2, type: 'claw', anchor: 'trail', t: 0.42, side: 4.2, title: 'Claw-gouged snag', text: 'A dead pine stripped of bark, four parallel gouges dragged down it from higher than you can reach. The wood inside is still pale. These are fresh.' },
  { id: 's04', night: 2, type: 'radio', anchor: 'out', off: [1.2, -1.6], title: 'Cracked handheld radio', text: 'A Forest Service handheld, the case split down the middle. The push-to-talk button is crusted dark brown. The channel knob is still set to Kettle Base.' },
  { id: 's05', night: 3, type: 'body', anchor: 'fire', off: [5.5, -3.5], name: 'R. OKAFOR', year: 1987, title: 'Lookout R. Okafor (1987)', text: 'Slumped against a stump in a faded forestry jacket, the green bleached almost white. The ID tag on the zipper reads R. OKAFOR, ELGO TOWER, 1987. His sidearm holster is empty. He is facing the tower.' },
  { id: 's06', night: 3, type: 'logbook', anchor: 'trail', t: 0.7, side: -2.4, title: 'Okafor\u2019s logbook', text: 'Night 6. It learned the drill. It waits by the generator now because it knows I have to come down. Marsh says I am tired. Marsh has never stood at the bottom of those stairs.' },
  { id: 's07', night: 4, type: 'scratch', anchor: 'shedWall', title: 'Carved into the shed wall', text: 'IT WEARS HIS FACE. The letters are carved at knee height, fast and crooked, like someone did it sitting down with their back to the wall.', carve: 'IT WEARS\nHIS FACE' },
  { id: 's08', night: 4, type: 'note', anchor: 'bush', off: [0.6, 0.4], title: 'Torn shoulder patch', text: 'A Forest Service shoulder patch, ripped off a jacket. Long grey hairs are snagged in the stitching. Not human hair. Not deer hair either.' },
  { id: 's09', night: 5, type: 'body', anchor: 'tank', off: [-1.8, -2.6], name: 'E. VARGA', year: 1994, title: 'Lookout E. Varga (1994)', text: 'Behind the water tank, sitting in the dry needles with her knees drawn up. Faded forestry jacket, ID tag: E. VARGA, ELGO TOWER, 1994. A flashlight in her lap, the switch still pushed to ON.' },
  { id: 's10', night: 5, type: 'note', anchor: 'tank', off: [-0.8, -3.4], title: 'Varga\u2019s last note', text: 'If you are reading this you are the new one. It does not want the tower. It wants you to come down. Keep the lights on. Keep the fires out. Make it to two.' },
  { id: 's11', night: 6, type: 'body', anchor: 'genBack', name: 'T. LINDQVIST', year: 2009, title: 'Lookout T. Lindqvist (2009)', text: 'Against the back of the generator shed, a red fuel can still clutched in one hand. Faded jacket, ID tag: T. LINDQVIST, ELGO TOWER, 2009. The can is full. He never got to pour it.' },
  { id: 's12', night: 6, type: 'claw', anchor: 'stairs', off: [-1.2, -1.0], title: 'Gouges at the foot of the stairs', text: 'The bottom stringer of the stairs is clawed to splinters, the marks climbing three, four steps up. Then they stop, as if something stood here for a long time, looking up.' },
  { id: 's13', night: 7, type: 'logbook', anchor: 'fire', off: [-4.5, 4.0], title: 'Lookout badge: D. MARSH, 1979', text: 'A brass Forest Service lookout badge in the ash. Stamped on the back: D. MARSH - ELGO TOWER - 1979. Marsh sat this tower once. Marsh came down.' },
  { id: 's14', night: 7, type: 'note', anchor: 'stairs', off: [0.9, -1.3], title: 'Roster, 2026 season', text: 'The Elgo Tower roster, nailed to the stair post. The 2026 season has one name on it. Yours. Someone has already drawn a line through it.' },
];
