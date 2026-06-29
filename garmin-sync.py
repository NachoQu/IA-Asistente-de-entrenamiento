#!/usr/bin/env python3
import sys, json, os
from datetime import datetime, timedelta
from garminconnect import Garmin

email = os.environ.get('GARMIN_EMAIL')
password = os.environ.get('GARMIN_PASSWORD')
start_date = os.environ.get('GARMIN_START')
end_date = os.environ.get('GARMIN_END')

if not email or not password:
    print(json.dumps({"error": "GARMIN_EMAIL and GARMIN_PASSWORD required"}))
    sys.exit(1)

try:
    api = Garmin(email, password)
    api.login()

    now = datetime.now()
    end = datetime.strptime(end_date, '%Y-%m-%d') if end_date else now
    start = datetime.strptime(start_date, '%Y-%m-%d') if start_date else (now - timedelta(days=365*5))

    if start > end:
        start, end = end, start

    result = {
        "activities": [],
        "daily_stats": [],
        "body_composition": [],
        "count_activities": 0,
        "count_days": 0,
    }

    # --- ACTIVITIES ---
    try:
        activities = api.get_activities_by_date(start.isoformat()[:10], end.isoformat()[:10])
        for a in activities:
            result["activities"].append({
                "date": str(a.get("startTimeLocal", ""))[:10],
                "type": a.get("activityType", {}).get("typeKey", "unknown"),
                "name": a.get("activityName", ""),
                "duration": round(a.get("duration", 0) / 60, 1),
                "distance": round(a.get("distance", 0) / 1000, 2) if a.get("distance") else None,
                "calories": a.get("calories"),
                "avgHeartRate": a.get("averageHR"),
                "maxHeartRate": a.get("maxHR"),
                "elevation": round(a.get("elevationGain", 0), 1) if a.get("elevationGain") else None,
                "source": "garmin",
            })
    except Exception as e:
        result["activity_error"] = str(e)

    result["count_activities"] = len(result["activities"])

    # --- DAILY METRICS ---
    current = start
    while current <= end:
        ds = current.isoformat()[:10]
        day = {"date": ds}

        # Sleep
        try:
            s = api.get_sleep_data(ds)
            if s and "dailySleepDTO" in s:
                d = s["dailySleepDTO"]
                day["sleep_hours"] = round(d.get("sleepTimeSeconds", 0) / 3600, 1) if d.get("sleepTimeSeconds") else None
                day["sleep_quality"] = d.get("sleepQualityType", {}).get("qualityTypeCode") if isinstance(d.get("sleepQualityType"), dict) else None
                day["sleep_score"] = d.get("sleepScores", {}).get("overall", {}).get("value") if d.get("sleepScores") else None
                day["sleep_rem"] = round(d.get("remSleepSeconds", 0) / 60, 1) if d.get("remSleepSeconds") else None
                day["sleep_deep"] = round(d.get("deepSleepSeconds", 0) / 60, 1) if d.get("deepSleepSeconds") else None
                day["sleep_light"] = round(d.get("lightSleepSeconds", 0) / 60, 1) if d.get("lightSleepSeconds") else None
                day["sleep_awake"] = round(d.get("awakeSleepSeconds", 0) / 60, 1) if d.get("awakeSleepSeconds") else None
        except: pass

        # Stress
        try:
            stress = api.get_stress_data(ds)
            if stress:
                day["stress_avg"] = stress.get("avgStressLevel")
                day["stress_max"] = stress.get("maxStressLevel")
                day["stress_min"] = stress.get("minStressLevel")
        except: pass

        # Heart Rate
        try:
            hr = api.get_heart_rates(ds)
            if hr:
                day["hr_resting"] = hr.get("restingHeartRate")
                day["hr_min"] = hr.get("minHeartRate")
                day["hr_max"] = hr.get("maxHeartRate")
                day["hr_avg"] = hr.get("avgHeartRate")
                day["hr_zone_0"] = hr.get("heartRateValues", {}).get("zone0") if isinstance(hr.get("heartRateValues"), dict) else None
                day["hr_zone_1"] = hr.get("heartRateValues", {}).get("zone1") if isinstance(hr.get("heartRateValues"), dict) else None
                day["hr_zone_2"] = hr.get("heartRateValues", {}).get("zone2") if isinstance(hr.get("heartRateValues"), dict) else None
                day["hr_zone_3"] = hr.get("heartRateValues", {}).get("zone3") if isinstance(hr.get("heartRateValues"), dict) else None
        except: pass

        # Body Battery
        try:
            bb = api.get_body_battery(ds)
            if bb:
                day["body_battery_min"] = bb.get("min")
                day["body_battery_max"] = bb.get("max")
                day["body_battery_charged"] = bb.get("charged")
                day["body_battery_drained"] = bb.get("drained")
        except: pass

        # HRV
        try:
            hrv = api.get_hrv_data(ds)
            if hrv:
                day["hrv_avg"] = hrv.get("hrvSummary", {}).get("weeklyAverage") if isinstance(hrv.get("hrvSummary"), dict) else None
                day["hrv_status"] = hrv.get("hrvSummary", {}).get("status") if isinstance(hrv.get("hrvSummary"), dict) else None
        except: pass

        # Steps
        try:
            steps = api.get_daily_steps(ds)
            if steps:
                day["steps"] = steps.get("totalSteps") or steps.get("steps")
                if isinstance(steps, int):
                    day["steps"] = steps
        except: pass

        # Intensity minutes
        try:
            im = api.get_intensity_minutes_data(ds)
            if im:
                day["intensity_minutes_weekly"] = im.get("weeklyIntensityMinutes") or im.get("intensityMinutes")
        except: pass

        # Floors
        try:
            floors = api.get_floors(ds)
            if floors:
                day["floors"] = floors.get("totalFloors") or floors.get("floors")
        except: pass

        # SpO2
        try:
            spo2 = api.get_spo2_data(ds)
            if spo2:
                day["spo2_avg"] = spo2.get("avg") or spo2.get("average")
                day["spo2_min"] = spo2.get("min")
        except: pass

        # Respiration
        try:
            resp = api.get_respiration_data(ds)
            if resp:
                day["respiration_avg"] = resp.get("avg") or resp.get("average")
                day["respiration_max"] = resp.get("max")
        except: pass

        # Resting HR
        try:
            rhr = api.get_rhr_day(ds)
            if rhr:
                day["rhr"] = rhr.get("restingHeartRate") or rhr
        except: pass

        # Training Readiness
        try:
            tr = api.get_morning_training_readiness(ds)
            if tr:
                day["readiness_score"] = tr.get("trainingReadiness", {}).get("overall") if isinstance(tr.get("trainingReadiness"), dict) else None
        except: pass

        # Training Status
        try:
            ts = api.get_training_status(ds)
            if ts:
                day["training_status"] = ts.get("trainingStatus") if isinstance(ts, dict) else None
                day["vo2_max"] = ts.get("vO2Max") if isinstance(ts, dict) else None
                day["training_load"] = ts.get("trainingLoad") if isinstance(ts, dict) else None
        except: pass

        # Hydration
        try:
            hyd = api.get_hydration_data(ds)
            if hyd:
                day["hydration_ml"] = hyd.get("valueInMilliliters") if isinstance(hyd, dict) else None
        except: pass

        # Only include days with at least some data
        has_data = any(v is not None for k, v in day.items() if k != 'date')
        if has_data:
            result["daily_stats"].append(day)

        current += timedelta(days=1)

    result["count_days"] = len(result["daily_stats"])

    # --- BODY COMPOSITION ---
    try:
        bc = api.get_body_composition(start.isoformat()[:10], end.isoformat()[:10])
        if bc:
            for entry in (bc if isinstance(bc, list) else bc.get("dateWeightList", bc.get("weight", []))):
                if isinstance(entry, dict) and entry.get("date"):
                    result["body_composition"].append({
                        "date": entry["date"][:10],
                        "weight": entry.get("weight"),
                        "bmi": entry.get("bmi"),
                        "body_fat": entry.get("bodyFat"),
                        "body_water": entry.get("bodyWater"),
                        "bone_mass": entry.get("boneMass"),
                        "muscle_mass": entry.get("muscleMass"),
                    })
    except: pass

    result["_summary"] = {
        "from": start.isoformat()[:10],
        "to": end.isoformat()[:10],
        "activities": result["count_activities"],
        "days_with_data": result["count_days"],
        "body_measurements": len(result["body_composition"]),
    }

    print(json.dumps(result, default=str))

except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
