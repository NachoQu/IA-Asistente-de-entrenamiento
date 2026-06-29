#!/usr/bin/env python3
import sys, json, os
from datetime import datetime, timedelta
from garminconnect import Garmin

email = os.environ.get('GARMIN_EMAIL')
password = os.environ.get('GARMIN_PASSWORD')
days_back = int(os.environ.get('GARMIN_DAYS', 30))

if not email or not password:
    print(json.dumps({"error": "GARMIN_EMAIL and GARMIN_PASSWORD required"}))
    sys.exit(1)

try:
    api = Garmin(email, password)
    api.login()

    end = datetime.now()
    start = end - timedelta(days=days_back)
    activities = api.get_activities_by_date(start.isoformat()[:10], end.isoformat()[:10])

    result = []
    for a in activities:
        result.append({
            "date": str(a.get("startTimeLocal", ""))[:10],
            "type": a.get("activityType", {}).get("typeKey", "unknown"),
            "duration": round(a.get("duration", 0) / 60, 1),
            "distance": round(a.get("distance", 0) / 1000, 2) if a.get("distance") else None,
            "calories": a.get("calories"),
            "avgHeartRate": a.get("averageHR"),
            "maxHeartRate": a.get("maxHR"),
            "elevation": round(a.get("elevationGain", 0), 1) if a.get("elevationGain") else None,
            "name": a.get("activityName", ""),
            "notes": "",
            "source": "garmin",
        })

    print(json.dumps({"ok": True, "count": len(result), "activities": result}))

except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
