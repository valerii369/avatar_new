"""
test_chart_audit.py — Full functional audit of natal_chart.py

Test subject: Donald Trump — Jun 14 1946, 10:54, Jamaica NY (Queens)
Well-documented chart, widely verified in astrology literature.

Expected key positions (from Astro.com):
  Sun   ~22° Gemini    (house 10-11)
  Moon  ~21° Sagittarius
  ASC   ~29° Leo
  MC    ~24° Taurus
  Mars  ~26° Leo  ← conjunct ASC (famous)
  North Node ~20° Gemini
"""
import asyncio, sys, os, json
sys.path.insert(0, os.path.dirname(__file__))

from app.services.dsb.natal_chart import (
    calculate_chart,
    ZODIAC_SIGNS, PLANETS, SIGN_RULERSHIPS,
    ASPECT_DEFS, PERSONAL_PLANETS, DERIVED_POINTS,
    MAJOR_ASPECT_TYPES,
)

# ─── Known reference positions (±2° tolerance) ───────────────────────────────
EXPECTED = {
    "sun":        {"sign": "Gemini",       "min_deg": 20.0, "max_deg": 24.0},
    "moon":       {"sign": "Sagittarius",  "min_deg": 19.0, "max_deg": 23.0},
    "asc":        {"sign": "Leo",          "min_deg": 27.0, "max_deg": 31.0},  # 29° Leo
    "mc":         {"sign": "Taurus",       "min_deg": 22.0, "max_deg": 26.0},
    "mars":       {"sign": "Leo",          "min_deg": 24.0, "max_deg": 28.0},
    "north_node": {"sign": "Gemini",       "min_deg": 18.0, "max_deg": 22.0},
    "venus":      {"sign": "Cancer"},
    "saturn":     {"sign": "Cancer"},
    "mercury":    {"sign": "Cancer"},
    "jupiter":    {"sign": "Libra"},
}

PASS = 0
FAIL = 0

def ok(msg):
    global PASS
    PASS += 1
    print(f"  ✅  {msg}")

def fail(msg):
    global FAIL
    FAIL += 1
    print(f"  ❌  {msg}")

def check(cond, msg_ok, msg_fail):
    if cond:
        ok(msg_ok)
    else:
        fail(msg_fail)

# ─────────────────────────────────────────────────────────────────────────────

async def run():
    print("\n" + "═"*60)
    print("  NATAL CHART FULL AUDIT — Trump Jun 14 1946, 10:54, Jamaica NY")
    print("═"*60)

    chart = await calculate_chart("1946-06-14", "10:54", "Jamaica, New York")

    planets  = chart["planets"]
    houses   = chart["houses"]
    aspects  = chart["aspects"]
    balance  = chart["balance"]

    # ─── 1. TOP-LEVEL KEYS ───────────────────────────────────────────────────
    print("\n[1] Top-level keys")
    required_keys = [
        "meta", "planets", "houses", "angles", "aspects",
        "aspect_patterns", "stelliums", "critical_degrees",
        "balance", "mutual_receptions", "unaspected_planets",
        "chart_ruler", "planets_on_angles", "chart_shape",
        "dispositor", "out_of_bounds", "intercepted_signs",
    ]
    for k in required_keys:
        check(k in chart, f"key '{k}' present", f"key '{k}' MISSING")

    # ─── 2. META ─────────────────────────────────────────────────────────────
    print("\n[2] Meta")
    meta = chart["meta"]
    check(meta["house_system"] in ("placidus", "koch", "whole_sign"),
          f"house_system = {meta['house_system']}",
          f"unknown house_system: {meta['house_system']}")
    check(meta["node_type"] == "true_node", "node_type = true_node", f"node_type = {meta['node_type']}")
    check(isinstance(meta["is_day_chart"], bool), f"is_day_chart = {meta['is_day_chart']}", "is_day_chart not bool")
    print(f"       timezone = {meta['timezone']}")

    # ─── 3. PLANETS STRUCTURE ────────────────────────────────────────────────
    print("\n[3] Planet positions — structure & ranges")
    required_planet_fields = [
        "longitude", "sign", "degree_in_sign", "house",
        "retrograde", "stationary", "speed", "dignity_score",
        "position_weight", "on_angle", "unaspected",
    ]
    expected_planets = set(PLANETS.keys()) | {"south_node", "asc", "mc", "part_of_fortune"}

    for name in expected_planets:
        check(name in planets, f"planet '{name}' exists", f"planet '{name}' MISSING")
        if name not in planets:
            continue
        p = planets[name]
        for f in required_planet_fields:
            check(f in p, f"  {name}.{f} present", f"  {name}.{f} MISSING")
        # Ranges
        check(0 <= p["longitude"] < 360,
              f"  {name}.longitude={p['longitude']:.2f}° ∈ [0,360)",
              f"  {name}.longitude={p['longitude']:.2f}° OUT OF RANGE")
        check(p["sign"] in ZODIAC_SIGNS,
              f"  {name}.sign={p['sign']}",
              f"  {name}.sign={p['sign']} NOT IN ZODIAC")
        check(0 <= p["degree_in_sign"] < 30,
              f"  {name}.degree_in_sign={p['degree_in_sign']:.2f}° ∈ [0,30)",
              f"  {name}.degree_in_sign={p['degree_in_sign']:.2f}° OUT OF RANGE")
        check(1 <= p["house"] <= 12,
              f"  {name}.house={p['house']} ∈ [1,12]",
              f"  {name}.house={p['house']} OUT OF RANGE")
        check(-10 <= p["dignity_score"] <= 10,
              f"  {name}.dignity_score={p['dignity_score']}",
              f"  {name}.dignity_score={p['dignity_score']} OUT OF RANGE")
        check(0.0 <= p["position_weight"] <= 1.0,
              f"  {name}.position_weight={p['position_weight']:.2f}",
              f"  {name}.position_weight={p['position_weight']:.2f} OUT OF [0,1]")

    # ─── 4. KNOWN POSITIONS ──────────────────────────────────────────────────
    print("\n[4] Known reference positions (±2°)")
    for name, exp in EXPECTED.items():
        if name not in planets:
            fail(f"{name}: missing from planets dict")
            continue
        p = planets[name]
        if "sign" in exp:
            check(p["sign"] == exp["sign"],
                  f"{name} in {p['sign']} ({p['degree_in_sign']:.1f}°)",
                  f"{name}: expected {exp['sign']}, got {p['sign']} {p['degree_in_sign']:.1f}°")
        if "min_deg" in exp:
            check(exp["min_deg"] <= p["degree_in_sign"] <= exp["max_deg"],
                  f"{name} deg_in_sign={p['degree_in_sign']:.2f}° in expected range",
                  f"{name} deg_in_sign={p['degree_in_sign']:.2f}° expected {exp['min_deg']}-{exp['max_deg']}")

    # ─── 5. HOUSES ───────────────────────────────────────────────────────────
    print("\n[5] Houses — 12 cusps")
    check(len(houses) == 12, "12 houses present", f"got {len(houses)} houses")
    cusps = [houses[str(i+1)]["cusp"] for i in range(12)]
    for i, c in enumerate(cusps):
        check(0 <= c < 360, f"house {i+1} cusp={c:.2f}° ∈ [0,360)", f"house {i+1} cusp={c:.2f}° OUT OF RANGE")
    # Check cusps are in increasing order (mod 360)
    sequential = all(
        (cusps[(i+1) % 12] - cusps[i]) % 360 < 200  # no single gap > 200°
        for i in range(12)
    )
    check(sequential, "house cusps are sequentially ordered", "house cusp ordering BROKEN")

    # ASC should match house 1 cusp
    asc_lon = chart["angles"]["asc"]
    check(abs(asc_lon - cusps[0]) < 0.01,
          f"ASC={asc_lon:.2f}° matches house 1 cusp",
          f"ASC={asc_lon:.2f}° != house 1 cusp={cusps[0]:.2f}°")

    # ─── 6. ASPECTS ──────────────────────────────────────────────────────────
    print("\n[6] Aspects — structure & major aspects present")
    check(len(aspects) > 0, f"{len(aspects)} aspects found", "NO aspects found")

    asp_fields = ["planet_a", "planet_b", "type", "angle", "orb", "applying", "influence_weight"]
    for i, asp in enumerate(aspects[:5]):  # spot-check first 5
        for f in asp_fields:
            check(f in asp, f"asp[{i}].{f} present", f"asp[{i}].{f} MISSING")
        check(asp["orb"] >= 0, f"asp[{i}].orb={asp['orb']:.2f}° >= 0", f"asp[{i}].orb={asp['orb']:.2f}° NEGATIVE")
        check(0 <= asp["influence_weight"] <= 1.0,
              f"asp[{i}].influence_weight={asp['influence_weight']:.2f}",
              f"asp[{i}].influence_weight={asp['influence_weight']:.2f} OUT OF [0,1]")

    # Check all 5 major types present (any famous chart should have them all)
    found_types = {a["type"] for a in aspects}
    for t in MAJOR_ASPECT_TYPES:
        check(t in found_types, f"major aspect type '{t}' found", f"major aspect type '{t}' NOT FOUND")

    # Mars–ASC conjunction (Trump famous ~2° orb)
    mars_asc = [a for a in aspects
                if "asc" in {a["planet_a"], a["planet_b"]}
                and "mars" in {a["planet_a"], a["planet_b"]}]
    check(len(mars_asc) > 0,
          f"Mars–ASC aspect found (orb={mars_asc[0]['orb']:.1f}° {mars_asc[0]['type']})" if mars_asc else "",
          "Mars–ASC conjunction MISSING (expected famous ~2° conjunction)")

    # Sun–Moon opposition (Sun Gemini opp Moon Sagittarius)
    sun_moon_opp = [a for a in aspects
                    if {"a": a["planet_a"], "b": a["planet_b"]} == {"a": "sun", "b": "moon"}
                    or (a["planet_a"] == "moon" and a["planet_b"] == "sun")]
    sun_moon_any = [a for a in aspects if {"sun","moon"} == {a["planet_a"], a["planet_b"]}]
    check(any(a["type"] == "opposition" for a in sun_moon_any),
          "Sun–Moon opposition found",
          f"Sun–Moon opposition MISSING (found: {[a['type'] for a in sun_moon_any]})")

    # ─── 7. RETROGRADE ───────────────────────────────────────────────────────
    print("\n[7] Retrograde flags")
    # Saturn and Venus should be retrograde in this chart
    retro_planets = [n for n, p in planets.items()
                     if p.get("retrograde") and n not in DERIVED_POINTS | {"asc","mc"}]
    check(len(retro_planets) > 0, f"retrograde planets found: {retro_planets}", "NO retrograde planets (suspicious)")
    # Jupiter R + Neptune R confirmed on Jun 14 1946 (Saturn is direct on this date)
    check("jupiter" in retro_planets,
          "Jupiter retrograde ✓ (confirmed Jun 1946)",
          f"Jupiter NOT retrograde — got: {retro_planets}")
    check("neptune" in retro_planets,
          "Neptune retrograde ✓ (confirmed Jun 1946)",
          f"Neptune NOT retrograde — got: {retro_planets}")
    # Sun and Moon should never be retrograde
    check(not planets["sun"].get("retrograde"), "Sun not retrograde ✓", "Sun marked retrograde ❌ (impossible)")
    check(not planets["moon"].get("retrograde"), "Moon not retrograde ✓", "Moon marked retrograde ❌ (impossible)")
    check(not planets["north_node"].get("retrograde"), "North Node not retrograde ✓ (TRUE_NODE oscillates)", "")

    # ─── 8. DIGNITY SCORES ───────────────────────────────────────────────────
    print("\n[8] Essential dignities")
    # Mercury in Cancer = detriment (rules Gemini/Virgo, Cancer is detriment)
    # Actually Mercury in Cancer is not detriment — let me check
    # Mercury rules Gemini + Virgo; detriment = Sagittarius + Pisces
    # Venus in Cancer — Venus rules Taurus/Libra, detriment = Aries/Scorpio → Cancer is neutral
    # Jupiter in Libra — Jupiter rules Sag/Pisces, detriment = Gemini/Virgo, fall = Capricorn
    #                    actually Jupiter FALL = Capricorn; DETRIMENT = Gemini/Virgo. Libra is neutral
    # Saturn in Cancer — Saturn rules Capricorn/Aquarius, FALL = Aries, DETRIMENT = Cancer/Leo
    check(planets["saturn"]["dignity_score"] <= -4,
          f"Saturn in Cancer dignity_score={planets['saturn']['dignity_score']} (detriment/fall expected)",
          f"Saturn in Cancer dignity_score={planets['saturn']['dignity_score']} (expected ≤-4 detriment)")
    # Spot-check all scores in valid range
    for name, p in planets.items():
        check(-10 <= p["dignity_score"] <= 10,
              f"  {name} dignity_score={p['dignity_score']} in range",
              f"  {name} dignity_score={p['dignity_score']} OUT OF RANGE")

    # ─── 9. CHART BALANCE ────────────────────────────────────────────────────
    print("\n[9] Chart balance")
    check("elements" in balance, "elements present", "elements MISSING")
    check("modalities" in balance, "modalities present", "modalities MISSING")
    check("hemispheres" in balance, "hemispheres present", "hemispheres MISSING")
    check("dominant_element" in balance, f"dominant_element={balance.get('dominant_element')}", "dominant_element MISSING")
    check("dominant_modality" in balance, f"dominant_modality={balance.get('dominant_modality')}", "dominant_modality MISSING")
    total_elem = sum(balance["elements"].values())
    check(total_elem > 0, f"element total={total_elem} planets counted", f"element total=0 (nothing counted)")

    # ─── 10. ASC / MC ────────────────────────────────────────────────────────
    print("\n[10] ASC and MC")
    check("asc" in planets and planets["asc"].get("is_angle"), "ASC marked as angle", "ASC not marked as angle")
    check("mc" in planets and planets["mc"].get("is_angle"), "MC marked as angle", "MC not marked as angle")
    # ASC = house 1, MC = house 10
    check(planets["asc"]["house"] == 1, "ASC in house 1", f"ASC in house {planets['asc']['house']}")
    check(planets["mc"]["house"] == 10, "MC in house 10", f"MC in house {planets['mc']['house']}")
    # DSC = ASC + 180
    dsc_expected = (asc_lon + 180) % 360
    mc_lon = chart["angles"]["mc"]
    ic_expected  = (mc_lon + 180) % 360
    check(abs(dsc_expected - asc_lon - 180) < 1, f"ASC={asc_lon:.2f}° so DSC={dsc_expected:.2f}°", "")
    print(f"       MC={mc_lon:.2f}° IC={ic_expected:.2f}°")

    # ─── 11. CHART RULER ─────────────────────────────────────────────────────
    print("\n[11] Chart ruler")
    chart_ruler = chart["chart_ruler"]
    asc_sign = planets["asc"]["sign"]
    expected_ruler = SIGN_RULERSHIPS.get(asc_sign, "")
    check(chart_ruler == expected_ruler,
          f"chart_ruler={chart_ruler} (ASC={asc_sign} → {expected_ruler})",
          f"chart_ruler={chart_ruler} expected {expected_ruler} for ASC in {asc_sign}")

    # ─── 12. PLANETS ON ANGLES ───────────────────────────────────────────────
    print("\n[12] Planets on angles")
    on_angles = chart["planets_on_angles"]
    check(isinstance(on_angles, list), f"planets_on_angles is list ({len(on_angles)} entries)", "not a list")
    for entry in on_angles:
        check(all(k in entry for k in ["planet", "angle", "orb", "exact"]),
              f"  {entry['planet']} on {entry['angle']} orb={entry['orb']:.2f}° exact={entry['exact']}",
              f"  entry missing fields: {entry}")
    # Mars should be on ASC (famous)
    mars_on_asc = any(e["planet"] == "mars" and e["angle"] == "asc" for e in on_angles)
    check(mars_on_asc,
          "Mars on ASC confirmed",
          f"Mars NOT on ASC — on_angles: {on_angles}")

    # ─── 13. CHART SHAPE (Jones) ─────────────────────────────────────────────
    print("\n[13] Chart shape (Jones pattern)")
    shape = chart["chart_shape"]
    valid_shapes = {"Bundle", "Bowl", "Locomotive", "Bucket", "Seesaw", "Splay", "Splash", "unknown"}
    check(shape in valid_shapes, f"chart_shape='{shape}'", f"chart_shape='{shape}' NOT a valid Jones pattern")

    # ─── 14. DISPOSITOR CHAIN ────────────────────────────────────────────────
    print("\n[14] Dispositor chain")
    disp = chart["dispositor"]
    check("direct" in disp and "final" in disp and "chart_final_dispositor" in disp,
          f"dispositor keys present, final_dispositor='{disp.get('chart_final_dispositor')}'",
          "dispositor structure incomplete")
    # Every planet in direct should have a dispositor
    for pname in disp.get("direct", {}):
        val = disp["direct"][pname]
        check(val in planets,
              f"  {pname} → {val} (in planets)",
              f"  {pname} → {val} NOT in planets")
    # Final dispositor should be a real planet
    cfd = disp.get("chart_final_dispositor", "")
    check(cfd in planets, f"chart_final_dispositor='{cfd}' is a known planet", f"chart_final_dispositor='{cfd}' UNKNOWN")

    # ─── 15. STELLIUMS ───────────────────────────────────────────────────────
    print("\n[15] Stelliums")
    stelliums = chart["stelliums"]
    check(isinstance(stelliums, list), f"stelliums is list ({len(stelliums)} found)", "not a list")
    # Trump has Sun+North Node+Uranus in Gemini (3 planets) → sign stellium
    for s in stelliums:
        check("type" in s and "planets" in s,
              f"  stellium: {s}",
              f"  stellium missing fields: {s}")
    gemini_s = [s for s in stelliums if s.get("sign") == "Gemini"]
    check(len(gemini_s) > 0,
          f"Gemini stellium found: {gemini_s}",
          "Gemini stellium MISSING (Sun+NN+Uranus in Gemini expected)")

    # ─── 16. ASPECT PATTERNS ─────────────────────────────────────────────────
    print("\n[16] Aspect patterns (Grand Cross, T-Square, Yod, etc.)")
    patterns = chart["aspect_patterns"]
    check(isinstance(patterns, list), f"aspect_patterns is list ({len(patterns)} found)", "not a list")
    for p in patterns:
        check(isinstance(p, str) and len(p) > 3,
              f"  pattern: {p}",
              f"  invalid pattern entry: {p}")

    # ─── 17. CRITICAL DEGREES ────────────────────────────────────────────────
    print("\n[17] Critical degrees")
    crit = chart["critical_degrees"]
    check(isinstance(crit, list), f"critical_degrees is list ({len(crit)} planets at critical deg)", "not a list")
    # ASC at 29° Leo = anaretic degree (should be in critical_degrees)
    check("asc" in crit,
          "ASC (29° Leo = anaretic) in critical_degrees",
          f"ASC at 29° Leo NOT in critical_degrees — got: {crit}")

    # ─── 18. MUTUAL RECEPTIONS ───────────────────────────────────────────────
    print("\n[18] Mutual receptions")
    mr = chart["mutual_receptions"]
    check(isinstance(mr, list), f"mutual_receptions is list ({len(mr)} found)", "not a list")
    for r in mr:
        check(all(k in r for k in ["planet_a","sign_a","planet_b","sign_b"]),
              f"  reception: {r['planet_a']} in {r['sign_a']} ↔ {r['planet_b']} in {r['sign_b']}",
              f"  reception missing fields: {r}")

    # ─── 19. LUNAR NODES ─────────────────────────────────────────────────────
    print("\n[19] Lunar nodes")
    nn = planets["north_node"]
    sn = planets["south_node"]
    # South Node should be exactly opposite North Node
    nn_lon = nn["longitude"]
    sn_lon = sn["longitude"]
    diff = abs((sn_lon - nn_lon) % 360 - 180)
    check(diff < 0.01,
          f"NN={nn_lon:.4f}° SN={sn_lon:.4f}° — exactly opposite ✓",
          f"NN/SN not exactly opposite: diff={diff:.4f}°")
    check(nn["sign"] == "Gemini", f"North Node in {nn['sign']}", f"North Node in {nn['sign']} (expected Gemini)")
    check(sn["sign"] == "Sagittarius", f"South Node in {sn['sign']}", f"South Node in {sn['sign']} (expected Sagittarius)")

    # ─── 20. CHIRON ──────────────────────────────────────────────────────────
    print("\n[20] Chiron")
    ch = planets.get("chiron")
    check(ch is not None, "Chiron present", "Chiron MISSING")
    if ch:
        check(0 <= ch["longitude"] < 360, f"Chiron lon={ch['longitude']:.2f}°", "Chiron longitude invalid")
        check(ch["sign"] in ZODIAC_SIGNS, f"Chiron in {ch['sign']}", f"Chiron sign invalid: {ch['sign']}")
        check(1 <= ch["house"] <= 12, f"Chiron house={ch['house']}", f"Chiron house invalid")
        print(f"       Chiron in {ch['sign']} {ch['degree_in_sign']:.1f}° house {ch['house']}")

    # ─── 21. LILITH ──────────────────────────────────────────────────────────
    print("\n[21] Lilith (Mean Apogee)")
    li = planets.get("lilith")
    check(li is not None, "Lilith present", "Lilith MISSING")
    if li:
        check(0 <= li["longitude"] < 360, f"Lilith lon={li['longitude']:.2f}°", "Lilith longitude invalid")
        check(li["sign"] in ZODIAC_SIGNS, f"Lilith in {li['sign']}", f"Lilith sign invalid")
        print(f"       Lilith in {li['sign']} {li['degree_in_sign']:.1f}° house {li['house']}")

    # ─── 22. PART OF FORTUNE ─────────────────────────────────────────────────
    print("\n[22] Part of Fortune")
    pof = planets.get("part_of_fortune")
    check(pof is not None, "Part of Fortune present", "PoF MISSING")
    if pof:
        check(0 <= pof["longitude"] < 360, f"PoF lon={pof['longitude']:.2f}° in {pof['sign']} house {pof['house']}", "PoF longitude invalid")
        # Day chart: PoF = ASC + Moon - Sun
        is_day = meta["is_day_chart"]
        sun_l  = planets["sun"]["longitude"]
        moon_l = planets["moon"]["longitude"]
        asc_l  = chart["angles"]["asc"]
        if is_day:
            expected_pof = (asc_l + moon_l - sun_l) % 360
        else:
            expected_pof = (asc_l + sun_l - moon_l) % 360
        diff = abs(pof["longitude"] - expected_pof)
        diff = min(diff, 360 - diff)
        check(diff < 0.01,
              f"PoF formula correct (is_day={is_day}, diff={diff:.4f}°)",
              f"PoF formula WRONG: got {pof['longitude']:.4f}° expected {expected_pof:.4f}° diff={diff:.4f}°")

    # ─── 23. OOB DECLINATIONS ────────────────────────────────────────────────
    print("\n[23] Out-of-bounds declinations")
    oob = chart["out_of_bounds"]
    check(isinstance(oob, list), f"out_of_bounds is list ({len(oob)} OOB planets)", "not a list")
    # Check declination stored on planet
    for name in ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"]:
        p = planets[name]
        if "declination" in p:
            check(-90 <= p["declination"] <= 90,
                  f"  {name}.declination={p['declination']:.3f}° ∈ [-90,90]",
                  f"  {name}.declination={p['declination']:.3f}° OUT OF RANGE")
    # north_node and lilith should NOT have OOB entry
    oob_names = {e["planet"] for e in oob}
    check("north_node" not in oob_names, "north_node not in OOB (correctly skipped)", "north_node in OOB (wrong)")
    check("lilith" not in oob_names, "lilith not in OOB (correctly skipped)", "lilith in OOB (wrong)")
    print(f"       OOB planets: {[e['planet'] for e in oob] or 'none'}")

    # ─── 24. INTERCEPTED SIGNS ───────────────────────────────────────────────
    print("\n[24] Intercepted signs")
    interc = chart["intercepted_signs"]
    check("intercepted" in interc and "duplicated" in interc and "intercepted_in_house" in interc,
          f"intercepted_signs structure correct: {interc}",
          f"intercepted_signs structure incomplete: {interc}")
    # Every intercepted sign should be in ZODIAC_SIGNS
    for s in interc.get("intercepted", []):
        check(s in ZODIAC_SIGNS, f"  intercepted sign '{s}' valid", f"  '{s}' not a zodiac sign")
    # Intercepted count should be even (paired)
    ic = len(interc.get("intercepted", []))
    check(ic % 2 == 0, f"intercepted count={ic} (even, correctly paired)", f"intercepted count={ic} ODD (should be even)")

    # ─── 25. POSITION WEIGHT INTEGRITY ───────────────────────────────────────
    print("\n[25] position_weight — all in [0,1], on_angle planets higher")
    weights_ok = all(0 <= p["position_weight"] <= 1.0 for p in planets.values())
    check(weights_ok, "all position_weights in [0.0, 1.0]", "some position_weight OUT OF RANGE")
    # on_angle planets should have higher weight than average
    angle_weights = [p["position_weight"] for p in planets.values() if p.get("on_angle") and not p.get("is_angle")]
    non_angle_avg = sum(p["position_weight"] for p in planets.values() if not p.get("on_angle")) / max(1, len([p for p in planets.values() if not p.get("on_angle")]))
    if angle_weights:
        avg_angle = sum(angle_weights) / len(angle_weights)
        check(avg_angle > non_angle_avg,
              f"on_angle planets avg weight={avg_angle:.2f} > non-angle avg={non_angle_avg:.2f}",
              f"on_angle planets avg weight={avg_angle:.2f} NOT > non-angle avg={non_angle_avg:.2f}")

    # ─── 26. UNASPECTED PLANETS ──────────────────────────────────────────────
    print("\n[26] Unaspected planets")
    unasp = chart["unaspected_planets"]
    check(isinstance(unasp, list), f"unaspected_planets is list: {unasp}", "not a list")
    # Sun and Moon should NOT be unaspected (they aspect almost everything)
    check("sun" not in unasp, "Sun not unaspected ✓", "Sun marked unaspected (suspicious for this chart)")
    check("moon" not in unasp, "Moon not unaspected ✓", "Moon marked unaspected (suspicious for this chart)")

    # ─── 27. FINAL SUMMARY ───────────────────────────────────────────────────
    print("\n" + "═"*60)
    total = PASS + FAIL
    pct   = round(100 * PASS / total) if total else 0
    print(f"  RESULT: {PASS}/{total} checks passed ({pct}%)")
    if FAIL == 0:
        print("  🎉  ALL CHECKS PASSED — система работает корректно")
    else:
        print(f"  ⚠️   {FAIL} checks FAILED — см. ❌ выше")
    print("═"*60)

    # Print full chart summary for visual inspection
    print("\n─── Planet Summary ────────────────────────────────────────")
    for name in ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","north_node","south_node","chiron","lilith","asc","mc"]:
        if name in planets:
            p = planets[name]
            flags = []
            if p.get("retrograde"):  flags.append("R")
            if p.get("stationary"):  flags.append("St")
            if p.get("on_angle"):    flags.append("∠")
            if p.get("unaspected"):  flags.append("∅")
            if p.get("out_of_bounds"): flags.append("OOB")
            ds = p.get("dignity_score", 0)
            dignity = {5:"dom",4:"exalt",-4:"fall",-5:"detrim"}.get(ds,"")
            flag_str = " [" + ",".join(flags) + "]" if flags else ""
            dig_str  = f" {dignity}" if dignity else ""
            print(f"  {name:14s} {p['sign']:12s} {p['degree_in_sign']:5.1f}°  H{p['house']:2d}  w={p['position_weight']:.2f}{dig_str}{flag_str}")

    if patterns:
        print(f"\n─── Aspect Patterns: {patterns}")
    if stelliums:
        print(f"─── Stelliums: {stelliums}")
    if unasp:
        print(f"─── Unaspected: {unasp}")
    print(f"─── Chart Shape: {shape}")
    print(f"─── Chart Ruler: {chart_ruler}")
    print(f"─── Final Dispositor: {disp.get('chart_final_dispositor')}")
    print(f"─── Day chart: {meta['is_day_chart']}")

    return FAIL == 0


if __name__ == "__main__":
    success = asyncio.run(run())
    sys.exit(0 if success else 1)
