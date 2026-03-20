#!/usr/bin/env python3
"""
Test script to verify if tracked items are being saved to JSON files
"""

import os
import json
import sys
from datetime import datetime

# Get the script directory (same as rpi_tracker.py)
script_dir = os.path.dirname(os.path.abspath(__file__))
json_log_dir = os.path.join(script_dir, 'Tracked_json')

def get_json_log_filename(date_obj):
    """Generate JSON log filename with date: tracked_items_YYYY-MM-DD.json"""
    date_str = date_obj.strftime("%Y-%m-%d")
    filename = f'tracked_items_{date_str}.json'
    return os.path.join(json_log_dir, filename)

def append_to_json_log(json_file_path, entry_data):
    """Append a new entry to the JSON log file"""
    try:
        # Read existing data
        if os.path.exists(json_file_path) and os.path.getsize(json_file_path) > 0:
            with open(json_file_path, 'r') as f:
                data = json.load(f)
        else:
            data = []
        
        # Append new entry
        data.append(entry_data)
        
        # Write back to file
        with open(json_file_path, 'w') as f:
            json.dump(data, f, indent=2)
        
        return True
    except Exception as e:
        print(f'Error writing to JSON log: {e}')
        return False

def test_tracking_save():
    """Test if items can be saved to tracked JSON"""
    
    print("=" * 60)
    print("Testing Tracked JSON Save Functionality")
    print("=" * 60)
    
    # Check if Tracked_json directory exists
    if not os.path.exists(json_log_dir):
        print(f"❌ ERROR: Tracked_json directory not found at: {json_log_dir}")
        return False
    else:
        print(f"✓ Tracked_json directory exists: {json_log_dir}")
    
    # Get the test file path
    test_datetime = datetime.now()
    test_json_file = get_json_log_filename(test_datetime)
    
    print(f"✓ Test file will be: {os.path.basename(test_json_file)}")
    
    # Read existing entries (if any)
    entries_before = []
    if os.path.exists(test_json_file):
        try:
            with open(test_json_file, 'r') as f:
                entries_before = json.load(f)
            print(f"✓ File exists with {len(entries_before)} existing entries")
        except:
            print(f"✓ File exists but is empty or invalid JSON")
    else:
        print(f"✓ File does not exist yet (will be created)")
    
    # Create test entries
    test_items = [
        {
            "date": test_datetime.strftime("%Y-%m-%d %H:%M:%S"),
            "item_type": "Pet Bottle",
            "points": 1
        },
        {
            "date": test_datetime.strftime("%Y-%m-%d %H:%M:%S"),
            "item_type": "Tin Can",
            "points": 2
        }
    ]
    
    print("\n" + "=" * 60)
    print("Attempting to save test items...")
    print("=" * 60)
    
    success_count = 0
    for i, test_item in enumerate(test_items, 1):
        print(f"\nTest {i}: Saving {test_item['item_type']} ({test_item['points']} points)...")
        
        if append_to_json_log(test_json_file, test_item):
            print(f"  ✓ Successfully saved!")
            success_count += 1
        else:
            print(f"  ❌ Failed to save!")
    
    # Verify the saves
    print("\n" + "=" * 60)
    print("Verifying saved data...")
    print("=" * 60)
    
    try:
        with open(test_json_file, 'r') as f:
            entries_after = json.load(f)
        
        print(f"\n✓ Total entries in file: {len(entries_after)}")
        print(f"✓ Entries before test: {len(entries_before)}")
        print(f"✓ New entries added: {len(entries_after) - len(entries_before)}")
        
        # Show last few entries
        print(f"\nLast {min(3, len(entries_after))} entries in the file:")
        for entry in entries_after[-3:]:
            print(f"  - {entry['date']}: {entry['item_type']} ({entry['points']} points)")
        
        if success_count == len(test_items):
            print("\n" + "=" * 60)
            print("✅ TEST PASSED: All items were successfully saved!")
            print("=" * 60)
            return True
        else:
            print("\n" + "=" * 60)
            print(f"⚠️  TEST PARTIAL: {success_count}/{len(test_items)} items saved")
            print("=" * 60)
            return False
            
    except Exception as e:
        print(f"\n❌ ERROR verifying saved data: {e}")
        return False

if __name__ == "__main__":
    success = test_tracking_save()
    sys.exit(0 if success else 1)
