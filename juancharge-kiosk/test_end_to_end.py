#!/usr/bin/env python3
"""
END-TO-END TEST: Simulate hardware scanning and verify app can read it
This test simulates what happens when the camera detects an item
"""

import os
import json
import time
from datetime import datetime

# Hardware saves to /home/pi/my_model/Tracked_json (now symlinked)
# App reads from /home/pi/JuanCharge-kiosk/juancharge-kiosk/Tracked_json
hardware_json_dir = '/home/pi/my_model/Tracked_json'
app_json_dir = '/home/pi/JuanCharge-kiosk/juancharge-kiosk/Tracked_json'

def get_points_for_item(item_class):
    """Returns points for an item (same logic as hardware)"""
    item_lower = item_class.lower()
    if any(x in item_lower for x in ['bottle', 'battles', 'bottles', 'pet', 'plastic']):
        return 1
    elif any(x in item_lower for x in ['tin', 'can', 'cans']):
        return 2
    else:
        return 0

def get_json_log_filename(json_dir, date_obj):
    """Generate JSON log filename"""
    date_str = date_obj.strftime("%Y-%m-%d")
    filename = f'tracked_items_{date_str}.json'
    return os.path.join(json_dir, filename)

def append_to_json_log(json_file_path, entry_data):
    """Append entry to JSON (same logic as hardware)"""
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
        print(f'❌ Error: {e}')
        return False

def main():
    print("\n" + "=" * 70)
    print("🔬 END-TO-END TEST: Hardware Scan → App Detection")
    print("=" * 70)
    
    # Verify symlink is working
    print("\n1️⃣  VERIFYING SYMLINK...")
    if os.path.islink(hardware_json_dir):
        target = os.readlink(hardware_json_dir)
        print(f"   ✅ Symlink exists: {hardware_json_dir}")
        print(f"   → Points to: {target}")
    else:
        print(f"   ⚠️  Not a symlink, checking if directories match...")
        if os.path.realpath(hardware_json_dir) == os.path.realpath(app_json_dir):
            print(f"   ✅ Directories are the same")
        else:
            print(f"   ⚠️  Different directories - files may not sync!")
    
    # Count files before
    print("\n2️⃣  COUNTING EXISTING ITEMS...")
    current_datetime = datetime.now()
    json_file = get_json_log_filename(hardware_json_dir, current_datetime)
    
    entries_before = []
    if os.path.exists(json_file):
        with open(json_file, 'r') as f:
            entries_before = json.load(f)
    
    print(f"   📁 File: {os.path.basename(json_file)}")
    print(f"   📊 Current entries: {len(entries_before)}")
    
    # Simulate hardware scanning an item
    print("\n3️⃣  SIMULATING HARDWARE SCAN...")
    print("   🎥 Camera detected: Pet Bottle")
    print("   ⏱️  Tracking for 1 second...")
    time.sleep(1)
    
    # Create entry (same format as yolo_detect1.py)
    date_str = current_datetime.strftime("%Y-%m-%d")
    time_str = current_datetime.strftime("%H:%M:%S")
    date_time_str = f"{date_str} {time_str}"
    
    item_type = "Pet Bottle"
    points = get_points_for_item(item_type)
    
    json_entry = {
        "date": date_time_str,
        "item_type": item_type,
        "points": points
    }
    
    print(f"   💾 Saving to: {json_file}")
    if append_to_json_log(json_file, json_entry):
        print(f"   ✅ Hardware saved successfully!")
    else:
        print(f"   ❌ Hardware save failed!")
        return False
    
    # Verify app can read it
    print("\n4️⃣  VERIFYING APP CAN READ THE FILE...")
    app_json_file = get_json_log_filename(app_json_dir, current_datetime)
    
    if os.path.exists(app_json_file):
        print(f"   ✅ File exists at app location: {os.path.basename(app_json_file)}")
        
        with open(app_json_file, 'r') as f:
            app_entries = json.load(f)
        
        print(f"   📊 App sees {len(app_entries)} total entries")
        
        if len(app_entries) > len(entries_before):
            new_entries = app_entries[len(entries_before):]
            print(f"   ✅ App detected {len(new_entries)} new entry!")
            
            for entry in new_entries:
                print(f"\n   📦 New scanned item:")
                print(f"      Type: {entry.get('item_type', 'unknown')}")
                print(f"      Points: {entry.get('points', 0)}")
                print(f"      Date: {entry.get('date', 'unknown')}")
        else:
            print(f"   ⚠️  App didn't detect new entries")
            return False
    else:
        print(f"   ❌ File NOT found at app location!")
        return False
    
    # Verify they're the same file
    print("\n5️⃣  VERIFYING HARDWARE AND APP SEE SAME DATA...")
    
    hardware_file = json_file
    app_file = app_json_file
    
    with open(hardware_file, 'r') as f:
        hardware_data = json.load(f)
    
    with open(app_file, 'r') as f:
        app_data = json.load(f)
    
    if hardware_data == app_data:
        print(f"   ✅ Perfect match! Hardware and app see the same data")
        print(f"   📊 Both have {len(hardware_data)} entries")
    else:
        print(f"   ❌ Data mismatch!")
        print(f"      Hardware: {len(hardware_data)} entries")
        print(f"      App: {len(app_data)} entries")
        return False
    
    # Success summary
    print("\n" + "=" * 70)
    print("✅ TEST PASSED!")
    print("=" * 70)
    print("\n📋 Summary:")
    print(f"   • Hardware scans → Saves to: {hardware_json_dir}")
    print(f"   • App reads from → Reads from: {app_json_dir}")
    print(f"   • Symlink connects them → ✅ Working correctly")
    print(f"   • New item scanned → {item_type} (+{points} points)")
    print(f"   • App can detect it → ✅ Yes")
    print("\n💡 The electron app's 'get-latest-points' will process this file")
    print("   and add the points to the active transaction.\n")
    
    return True

if __name__ == "__main__":
    import sys
    success = main()
    sys.exit(0 if success else 1)
