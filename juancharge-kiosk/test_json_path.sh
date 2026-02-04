#!/bin/bash

echo "======================================================================"
echo " TESTING SCANNED ITEMS TO TRACKED JSON WORKFLOW"
echo "======================================================================"
echo ""

echo "1️⃣  CHECKING HARDWARE PYTHON SCRIPT LOCATION"
echo "----------------------------------------------------------------------"
if [ -f "/home/pi/my_model/yolo_detect1.py" ]; then
    echo "✅ Hardware script found: /home/pi/my_model/yolo_detect1.py"
else
    echo "❌ Hardware script NOT found at /home/pi/my_model/yolo_detect1.py"
fi
echo ""

echo "2️⃣  CHECKING WHERE HARDWARE SAVES TRACKED JSON"
echo "----------------------------------------------------------------------"
HARDWARE_JSON_DIR=$(grep "json_log_dir = " /home/pi/my_model/yolo_detect1.py | sed "s/.*'Tracked_json'.*/\/home\/pi\/my_model\/Tracked_json/")
echo "Hardware saves to: /home/pi/my_model/Tracked_json/"
echo ""

if [ -d "/home/pi/my_model/Tracked_json" ]; then
    echo "✅ Directory exists"
    echo "Files in hardware Tracked_json:"
    ls -lh /home/pi/my_model/Tracked_json/ 2>/dev/null | tail -n +2 || echo "  (empty or no files)"
else
    echo "❌ Directory does NOT exist"
    echo "📝 The hardware will create it when it runs"
fi
echo ""

echo "3️⃣  CHECKING WHERE ELECTRON APP READS TRACKED JSON"
echo "----------------------------------------------------------------------"
echo "Electron app reads from: /home/pi/JuanCharge-kiosk/juancharge-kiosk/Tracked_json/"
echo ""

if [ -d "/home/pi/JuanCharge-kiosk/juancharge-kiosk/Tracked_json" ]; then
    echo "✅ Directory exists"
    echo "Files in app Tracked_json:"
    ls -lh /home/pi/JuanCharge-kiosk/juancharge-kiosk/Tracked_json/ 2>/dev/null | tail -n +2
else
    echo "❌ Directory does NOT exist"
fi
echo ""

echo "4️⃣  CHECKING IF THEY ARE LINKED (SYMLINK)"
echo "----------------------------------------------------------------------"
if [ -L "/home/pi/my_model/Tracked_json" ]; then
    TARGET=$(readlink -f /home/pi/my_model/Tracked_json)
    echo "✅ /home/pi/my_model/Tracked_json is a symlink to:"
    echo "   → $TARGET"
    if [ "$TARGET" == "/home/pi/JuanCharge-kiosk/juancharge-kiosk/Tracked_json" ]; then
        echo "   ✅ CORRECT! Links to app's Tracked_json"
    else
        echo "   ⚠️  Links to different location"
    fi
elif [ -L "/home/pi/JuanCharge-kiosk/juancharge-kiosk/Tracked_json" ]; then
    TARGET=$(readlink -f /home/pi/JuanCharge-kiosk/juancharge-kiosk/Tracked_json)
    echo "✅ /home/pi/JuanCharge-kiosk/juancharge-kiosk/Tracked_json is a symlink to:"
    echo "   → $TARGET"
else
    echo "❌ NO SYMLINK DETECTED"
    echo ""
    echo "⚠️  PROBLEM IDENTIFIED:"
    echo "   The hardware saves to: /home/pi/my_model/Tracked_json/"
    echo "   The app reads from:    /home/pi/JuanCharge-kiosk/juancharge-kiosk/Tracked_json/"
    echo ""
    echo "   These are DIFFERENT locations!"
fi
echo ""

echo "5️⃣  SOLUTION"
echo "----------------------------------------------------------------------"
if [ ! -L "/home/pi/my_model/Tracked_json" ]; then
    echo "You need to create a symlink so hardware saves to the same location"
    echo "the app reads from:"
    echo ""
    echo "Run this command:"
    echo "  cd /home/pi/my_model"
    echo "  ln -s /home/pi/JuanCharge-kiosk/juancharge-kiosk/Tracked_json Tracked_json"
    echo ""
    echo "This will make the hardware save directly to the app's Tracked_json folder"
else
    echo "✅ Symlink already configured correctly!"
fi
echo ""

echo "======================================================================"
echo " TEST COMPLETE"
echo "======================================================================"
