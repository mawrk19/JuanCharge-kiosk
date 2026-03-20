#!/usr/bin/env python3
"""
Comprehensive test for the scanning-to-JSON workflow
This simulates what happens when the camera detects items
"""

import os
import json
import time
from datetime import datetime

# Get the script directory
script_dir = os.path.dirname(os.path.abspath(__file__))
json_log_dir = os.path.join(script_dir, 'Tracked_json')

def get_points_for_item(item_class):
    """Returns points for an item based on its class name (case-insensitive)"""
    item_lower = item_class.lower()
    if any(x in item_lower for x in ['bottle', 'battles', 'bottles', 'pet', 'plastic']):
        return 1
    elif any(x in item_lower for x in ['tin', 'can', 'cans']):
        return 2
    else:
        return 0

def get_json_log_filename(date_obj):
    """Generate JSON log filename with date: tracked_items_YYYY-MM-DD.json"""
    date_str = date_obj.strftime("%Y-%m-%d")
    filename = f'tracked_items_{date_str}.json'
    return os.path.join(json_log_dir, filename)

def append_to_json_log(json_file_path, entry_data):
    """Append a new entry to the JSON log file"""
    try:
        if os.path.exists(json_file_path) and os.path.getsize(json_file_path) > 0:
            with open(json_file_path, 'r') as f:
                data = json.load(f)
        else:
            data = []
        
        data.append(entry_data)
        
        with open(json_file_path, 'w') as f:
            json.dump(data, f, indent=2)
        
        return True
    except Exception as e:
        print(f'Error writing to JSON log: {e}')
        return False

def simulate_camera_scan():
    """Simulate the camera detecting and tracking an item"""
    
    print("\n" + "=" * 70)
    print(" SIMULATING CAMERA SCAN WORKFLOW")
    print("=" * 70)
    
    # Simulate detected items (what the YOLO model would detect)
    detected_items = [
        {"class": "Pet Bottle", "confidence": 0.95},
        {"class": "Tin Can", "confidence": 0.88},
        {"class": "plastic bottle", "confidence": 0.92},
    ]
    
    current_datetime = datetime.now()
    json_log_file = get_json_log_filename(current_datetime)
    
    print(f"\n📁 Target file: {os.path.basename(json_log_file)}")
    print(f"📍 Full path: {json_log_file}")
    
    # Read existing entries
    entries_before = []
    if os.path.exists(json_log_file):
        with open(json_log_file, 'r') as f:
            entries_before = json.load(f)
    
    print(f"📊 Existing entries: {len(entries_before)}")
    
    print("\n" + "-" * 70)
    print(" PROCESSING SCANNED ITEMS")
    print("-" * 70)
    
    for i, item in enumerate(detected_items, 1):
        print(f"\n🎯 Item {i}: {item['class']}")
        print(f"   Confidence: {item['confidence']*100:.1f}%")
        
        # Simulate the tracking duration (1 second in real system)
        print("   ⏱️  Tracking for 1 second...")
        time.sleep(0.5)  # Shortened for test
        
        # Calculate points
        points = get_points_for_item(item['class'])
        print(f"   💰 Points awarded: {points}")
        
        # Create JSON entry (same format as rpi_tracker.py)
        date_str = current_datetime.strftime("%Y-%m-%d")
        time_str = current_datetime.strftime("%H:%M:%S")
        date_time_str = f"{date_str} {time_str}"
        
        json_entry = {
            "date": date_time_str,
            "item_type": item['class'],
            "points": points
        }
        
        # Save to JSON log
        print("   💾 Saving to tracked JSON...")
        if append_to_json_log(json_log_file, json_entry):
            print("   ✅ SAVED SUCCESSFULLY!")
        else:
            print("   ❌ FAILED TO SAVE!")
    
    # Verify final results
    print("\n" + "=" * 70)
    print(" VERIFICATION")
    print("=" * 70)
    
    with open(json_log_file, 'r') as f:
        entries_after = json.load(f)
    
    new_entries = len(entries_after) - len(entries_before)
    total_points = sum(entry.get('points', 0) for entry in entries_after[-new_entries:])
    
    print(f"\n✓ Entries before: {len(entries_before)}")
    print(f"✓ Entries after: {len(entries_after)}")
    print(f"✓ New entries added: {new_entries}")
    print(f"✓ Total points from new scans: {total_points}")
    
    print("\n📝 Latest entries in the file:")
    for entry in entries_after[-3:]:
        print(f"   • {entry['date']}: {entry['item_type']} = {entry['points']} points")
    
    print("\n" + "=" * 70)
    if new_entries == len(detected_items):
        print(" ✅ SUCCESS: All scanned items were saved to tracked JSON!")
    else:
        print(" ⚠️  WARNING: Some items may not have been saved correctly")
    print("=" * 70)
    
    return json_log_file

if __name__ == "__main__":
    json_file = simulate_camera_scan()
    print(f"\n💡 The electron app will read from: {json_file}")
    print("   and add points to the active transaction.\n")
