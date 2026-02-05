import os
import sys
import argparse
import glob
import time
import json
from datetime import datetime

import cv2  # type: ignore
import numpy as np  # type: ignore
from ultralytics import YOLO  # type: ignore

# Servo control library for Raspberry Pi 5
try:
    import lgpio  # type: ignore
    SERVO_ENABLED = True
except ImportError:
    print("WARNING: lgpio library not found. Servo control will be disabled.")
    print("To enable servo control, install lgpio: sudo apt-get install python3-lgpio")
    SERVO_ENABLED = False

# Define and parse user input arguments

parser = argparse.ArgumentParser()
parser.add_argument('--model', help='Path to YOLO model file (example: "runs/detect/train/weights/best.pt")',
                    required=True)
parser.add_argument('--source', help='Image source, can be image file ("test.jpg"), \
                    image folder ("test_dir"), video file ("testvid.mp4"), or index of USB camera ("usb0")', 
                    required=True)
parser.add_argument('--thresh', help='Minimum confidence threshold for displaying detected objects (example: "0.4")',
                    default=0.2)
parser.add_argument('--resolution', help='Resolution in WxH to display inference results at (example: "640x480"), \
                    otherwise, match source resolution',
                    default=None)
parser.add_argument('--record', help='Record results from video or webcam and save it as "demo1.avi". Must specify --resolution argument to record.',
                    action='store_true')

args = parser.parse_args()


# Parse user inputs
model_path = args.model
img_source = args.source
min_thresh = args.thresh
user_res = args.resolution
record = args.record

# Check if model file exists and is valid
if (not os.path.exists(model_path)):
    print('ERROR: Model path is invalid or model was not found. Make sure the model filename was entered correctly.')
    sys.exit(0)

# Load the model into memory and get labemap
model = YOLO(model_path, task='detect')
labels = model.names

# Parse input to determine if image source is a file, folder, video, or USB camera
img_ext_list = ['.jpg','.JPG','.jpeg','.JPEG','.png','.PNG','.bmp','.BMP']
vid_ext_list = ['.avi','.mov','.mp4','.mkv','.wmv']

if os.path.isdir(img_source):
    source_type = 'folder'
elif os.path.isfile(img_source):
    _, ext = os.path.splitext(img_source)
    if ext in img_ext_list:
        source_type = 'image'
    elif ext in vid_ext_list:
        source_type = 'video'
    else:
        print(f'File extension {ext} is not supported.')
        sys.exit(0)
elif 'usb' in img_source:
    source_type = 'usb'
    usb_idx = int(img_source[3:])
elif 'picamera' in img_source:
    source_type = 'picamera'
    picam_idx = int(img_source[8:])
else:
    print(f'Input {img_source} is invalid. Please try again.')
    sys.exit(0)

# Parse user-specified display resolution
resize = False
if user_res:
    resize = True
    resW, resH = int(user_res.split('x')[0]), int(user_res.split('x')[1])

# Check if recording is valid and set up recording
if record:
    if source_type not in ['video','usb']:
        print('Recording only works for video and camera sources. Please try again.')
        sys.exit(0)
    if not user_res:
        print('Please specify resolution to record video at.')
        sys.exit(0)
    
    # Set up recording
    record_name = 'demo1.avi'
    record_fps = 30
    recorder = cv2.VideoWriter(record_name, cv2.VideoWriter_fourcc(*'MJPG'), record_fps, (resW,resH))

# Load or initialize image source
if source_type == 'image':
    imgs_list = [img_source]
elif source_type == 'folder':
    imgs_list = []
    filelist = glob.glob(img_source + '/*')
    for file in filelist:
        _, file_ext = os.path.splitext(file)
        if file_ext in img_ext_list:
            imgs_list.append(file)
elif source_type == 'video' or source_type == 'usb':

    if source_type == 'video': cap_arg = img_source
    elif source_type == 'usb': cap_arg = usb_idx
    cap = cv2.VideoCapture(cap_arg)

    # Set camera or video resolution if specified by user
    if user_res:
        ret = cap.set(3, resW)
        ret = cap.set(4, resH)

elif source_type == 'picamera':
    from picamera2 import Picamera2  # type: ignore
    cap = Picamera2()
    cap.configure(cap.create_video_configuration(main={"format": 'XRGB8888', "size": (resW, resH)}))
    cap.start()

# Set bounding box colors (using the Tableu 10 color scheme)
bbox_colors = [(164,120,87), (68,148,228), (93,97,209), (178,182,133), (88,159,106), 
              (96,202,231), (159,124,168), (169,162,241), (98,118,150), (172,176,184)]

# Initialize control and status variables
avg_frame_rate = 0
frame_rate_buffer = []
fps_avg_len = 200
img_count = 0

# Initialize tracking system for items with 70-100% confidence
tracked_objects = {}  # Dictionary to store tracked objects: {track_id: {'class': name, 'start_time': time, 'bbox': [xmin, ymin, xmax, ymax], 'last_seen': time, 'conf': confidence}}
next_track_id = 0
TRACKING_DURATION = 1.0  # Track for 1 second
MIN_CONFIDENCE = 0.70  # 70%
MAX_CONFIDENCE = 1.00  # 100%
TRACKING_DISTANCE_THRESHOLD = 100  # Maximum distance in pixels to match objects between frames

# ========== SERVO CONFIGURATION ==========
# Using ONLY Servo 1 (GPIO 12) for both ACCEPT and REJECT operations
# Accept: 0 degrees (one end)
# Reject: 180 degrees (other end)
SERVO_PINS = {
    1: 12,  # GPIO 12 (Pin 32) - Main sorting servo (Accept/Reject)
}

# Servo angle positions (in degrees, 0-180)
# MG996R has 180-degree rotation range
SERVO_POSITIONS = {
    'neutral': 90,   # Center/home position
    'accept': 0,     # ACCEPT position (0 degrees - one end)
    'reject': 180    # REJECT position (180 degrees - other end)
}

# Servo PWM configuration
SERVO_FREQUENCY = 50  # 50Hz standard for servos
SERVO_MIN_PULSE = 500   # Minimum pulse width in microseconds (0 degrees)
SERVO_MAX_PULSE = 2500  # Maximum pulse width in microseconds (180 degrees)

# Servo control variables
servo_chip_handle = None
servo_initialized = False

# ========== SERVO CONTROL FUNCTIONS ==========

def angle_to_duty_cycle(angle):
    """Convert servo angle (0-180) to duty cycle percentage for lgpio"""
    # Map angle to pulse width in microseconds
    pulse_width = SERVO_MIN_PULSE + (angle / 180.0) * (SERVO_MAX_PULSE - SERVO_MIN_PULSE)
    # Convert to duty cycle percentage (20ms period = 20000us)
    duty_cycle = (pulse_width / 20000.0) * 100.0
    return duty_cycle

def initialize_servos():
    """Initialize servo and set it to neutral position"""
    global servo_chip_handle, servo_initialized
    
    if not SERVO_ENABLED:
        print("Servo control disabled (lgpio not available)")
        return False
    
    try:
        # Open GPIO chip 0 (default for Raspberry Pi 5)
        servo_chip_handle = lgpio.gpiochip_open(0)
        print("Servo GPIO chip opened successfully")
        
        # Set servo to neutral position (90 degrees)
        gpio_pin = SERVO_PINS[1]
        
        # CRITICAL: Claim GPIO pin as output before using PWM
        lgpio.gpio_claim_output(servo_chip_handle, gpio_pin)
        print(f"GPIO {gpio_pin} claimed as output")
        
        # Set servo to neutral position using move_servo function
        print(f"Servo 1 (GPIO {gpio_pin}) initializing to neutral position (90°)")
        move_servo(1, SERVO_POSITIONS['neutral'], hold_time=0.5, stop_pwm=True)
        
        servo_initialized = True
        print("Servo initialized successfully\n")
        return True
        
    except Exception as e:
        print(f"ERROR: Failed to initialize servo: {e}")
        print("Make sure you're running with appropriate permissions (may need sudo)")
        servo_initialized = False
        return False

def move_servo(servo_num, angle, hold_time=1.0, stop_pwm=True):
    """
    Move servo to a specific angle.
    stop_pwm=True → stop PWM after hold_time (prevents jitter)
    stop_pwm=False → keep PWM active (needed for extreme positions like 0°/180°)
    """
    if not servo_initialized:
        print(f"[DEBUG] Servo not initialized, cannot move servo {servo_num}")
        return
    
    if not SERVO_ENABLED:
        print(f"[DEBUG] SERVO_ENABLED is False, servo control disabled")
        return
    
    try:
        gpio_pin = SERVO_PINS.get(servo_num)
        if gpio_pin is None:
            print(f"WARNING: Invalid servo number {servo_num}")
            return
        
        # Clamp angle to valid range
        angle = max(0, min(180, angle))
        duty_cycle = angle_to_duty_cycle(angle)
        
        print(f"[SERVO] Moving Servo {servo_num} (GPIO {gpio_pin}) to {angle}° (duty cycle: {duty_cycle:.2f}%)")
        lgpio.tx_pwm(servo_chip_handle, gpio_pin, SERVO_FREQUENCY, duty_cycle)
        time.sleep(hold_time)
        
        if stop_pwm:
            lgpio.tx_pwm(servo_chip_handle, gpio_pin, SERVO_FREQUENCY, 0)  # Stop PWM → servo stays still
            print(f"[SERVO] PWM stopped after hold time")
        else:
            print(f"[SERVO] PWM kept active (stop_pwm=False)")
        
    except Exception as e:
        print(f"ERROR: Failed to move servo {servo_num}: {e}")

def trigger_accept():
    """Activate Servo 1 to ACCEPT position (0 degrees) for single item detected"""
    print("\n" + "="*60)
    print("[TRIGGER] ACCEPT TRIGGERED")
    print("="*60)
    
    if not servo_initialized:
        print("[ERROR] Cannot trigger accept: Servo not initialized")
        return
    
    if not SERVO_ENABLED:
        print("[ERROR] Cannot trigger accept: SERVO_ENABLED is False")
        return
    
    try:
        print("[ACTION] ACCEPTED - Moving Servo 1 to ACCEPT position (0°)")
        # Move to 90° first (with stop_pwm=False to keep PWM active)
        move_servo(1, SERVO_POSITIONS['neutral'], hold_time=2.0, stop_pwm=False)
        # Then move to 0° (ACCEPT position) with stop_pwm=True
        move_servo(1, SERVO_POSITIONS['accept'], hold_time=0.5, stop_pwm=True)
        print("[ACTION] Returning to neutral (90°)...")
        move_servo(1, SERVO_POSITIONS['neutral'], hold_time=1.0, stop_pwm=True)
        print("[COMPLETE] Accept sequence finished")
        print("="*60 + "\n")
        
    except Exception as e:
        print(f"ERROR: Failed to trigger accept: {e}")

def trigger_rejection():
    """Activate Servo 1 to REJECT position (180 degrees) for multiple items detected"""
    print("\n" + "="*60)
    print("[TRIGGER] REJECT TRIGGERED")
    print("="*60)
    
    if not servo_initialized:
        print("[ERROR] Cannot trigger reject: Servo not initialized")
        return
    
    if not SERVO_ENABLED:
        print("[ERROR] Cannot trigger reject: SERVO_ENABLED is False")
        return
    
    try:
        print("[ACTION] REJECTED - Moving Servo 1 to REJECT position (180°)")
        # Move to 160° first (with stop_pwm=False to keep PWM active) to fully reach 180°
        move_servo(1, 160, hold_time=2.0, stop_pwm=False)
        # Then move to 180° (REJECT position) with stop_pwm=True
        move_servo(1, SERVO_POSITIONS['reject'], hold_time=0.5, stop_pwm=True)
        print("[ACTION] Returning to neutral (90°)...")
        move_servo(1, SERVO_POSITIONS['neutral'], hold_time=1.0, stop_pwm=True)
        print("[COMPLETE] Reject sequence finished")
        print("="*60 + "\n")
        
    except Exception as e:
        print(f"ERROR: Failed to trigger rejection: {e}")

def reset_servos():
    """Reset all servos to neutral position"""
    if not servo_initialized or not SERVO_ENABLED:
        return
    
    try:
        # Use move_servo to set neutral position for all servos
        for servo_num in SERVO_PINS.keys():
            move_servo(servo_num, SERVO_POSITIONS['neutral'], hold_time=1.0, stop_pwm=True)
        print("All servos reset to neutral position")
        
    except Exception as e:
        print(f"ERROR: Failed to reset servos: {e}")

def cleanup_servos():
    """Clean up servo resources and stop PWM signals"""
    global servo_chip_handle, servo_initialized
    
    if not servo_initialized or not SERVO_ENABLED:
        return
    
    try:
        # Stop all PWM signals
        for gpio_pin in SERVO_PINS.values():
            lgpio.tx_pwm(servo_chip_handle, gpio_pin, SERVO_FREQUENCY, 0)
        
        # Close GPIO chip
        if servo_chip_handle is not None:
            lgpio.gpiochip_close(servo_chip_handle)
            print("Servo GPIO chip closed")
        
        servo_initialized = False
        
    except Exception as e:
        print(f"ERROR: Failed to cleanup servos: {e}")

# Utility: build a stable key for an object using class + quantized centroid
# Using larger bin size to make key more stable with small movements
def compute_key_from_bbox(bbox, classname, bin_size=80):
    cx = (bbox[0] + bbox[2]) / 2.0
    cy = (bbox[1] + bbox[3]) / 2.0
    return (classname, int(cx // bin_size), int(cy // bin_size))

# Keep track of items that have already been logged and are still present in frame.
# We will only allow re-logging after they have been absent for a short period.
logged_present_keys = set()
key_last_seen = {}
# Store actual positions of logged items to verify if a new detection is the same object
logged_item_positions = {}  # {presence_key: (centroid_x, centroid_y, classname)}

# State for multi-item rejection timing (periodic logs while state persists)
multi_item_reject_active = False
multi_item_start_time = 0.0
multi_item_last_log_time = 0.0

# State for single-item acceptance timing (periodic logs while state persists)
single_item_active = False
single_item_start_time = 0.0
single_item_last_log_time = 0.0

# Identity/state memory for per-presence logging
last_single_presence_key = None
single_logged = False
last_multi_signature = set()
multi_logged = False

# UI notification state
notify_message = ''
notify_color = (0, 255, 0)
notify_until = 0.0

# Get the script's directory and set up log directories
# This works on both Windows and Raspberry Pi (Linux)
# Go up one level from script location (my_model) to yolo folder
script_dir = os.path.dirname(os.path.abspath(__file__))
yolo_dir = os.path.dirname(script_dir)  # Go up one level to yolo folder
txt_log_dir = os.path.join(yolo_dir, 'Tracked_txt')

# Set JSON log directory to be relative to this script
# This ensures it works on both dev machine and RPi without hardcoding absolute paths
json_log_dir = os.path.join(script_dir, 'Tracked_json')

# Create directories if they don't exist
os.makedirs(txt_log_dir, exist_ok=True)
os.makedirs(json_log_dir, exist_ok=True)

# Function to generate log filename based on date
def get_log_filename(date_obj):
    """Generate log filename with date: tracked_items_YYYY-MM-DD.txt"""
    date_str = date_obj.strftime("%Y-%m-%d")
    filename = f'tracked_items_{date_str}.txt'
    return os.path.join(txt_log_dir, filename)

# Function to generate JSON log filename based on date
def get_json_log_filename(date_obj):
    """Generate JSON log filename with date: tracked_items_YYYY-MM-DD.json"""
    date_str = date_obj.strftime("%Y-%m-%d")
    filename = f'tracked_items_{date_str}.json'
    return os.path.join(json_log_dir, filename)

# Initialize date-based log file system
# Note: All dates/times are fetched from the device system clock (Raspberry Pi)
startup_datetime = datetime.now()
current_log_date = startup_datetime.date()  # Track the current date for the log file
tracking_log_file = get_log_filename(startup_datetime)
tracking_log_path = os.path.abspath(tracking_log_file)
json_log_file = get_json_log_filename(startup_datetime)
json_log_path = os.path.abspath(json_log_file)

# Create or append to the tracking log file for today's date
# Use 'a' mode to append if file already exists (in case script is restarted on same day)
file_exists = os.path.exists(tracking_log_file)
with open(tracking_log_file, 'a') as f:
    # Only write header if file is new (file doesn't exist or is empty)
    if not file_exists or os.path.getsize(tracking_log_file) == 0:
        f.write('Tracked Items (70-100% confidence, tracked for 1 second)\n')
        f.write('=' * 60 + '\n')
        f.write(f'Log started on: {startup_datetime.strftime("%A, %B %d, %Y at %H:%M:%S")}\n')
        f.write(f'Device System Date: {startup_datetime.strftime("%Y-%m-%d")}\n')
        f.write('=' * 60 + '\n\n')
    else:
        # File exists, add a separator for new session
        f.write(f'\n--- New session started: {startup_datetime.strftime("%A, %B %d, %Y at %H:%M:%S")} ---\n\n')

# Initialize JSON log file
json_file_exists = os.path.exists(json_log_file)
if not json_file_exists or os.path.getsize(json_log_file) == 0:
    # Create new JSON file with empty array
    with open(json_log_file, 'w') as f:
        json.dump([], f)

# Helper function to calculate points based on item type
def get_points_for_item(item_class):
    """Returns points for an item based on its class name (case-insensitive)"""
    item_lower = item_class.lower()
    # Pet/plastic bottles = 1 point
    # Check for "bottle" or "battles" (handles typos) and "pet" or "plastic"
    if ('bottle' in item_lower or 'battles' in item_lower) and ('pet' in item_lower or 'plastic' in item_lower):
        return 1
    # Tin/cans = 2 points
    # Check for "tin", "can", "cans", or variations (handles "tin/cans", "tin can", etc.)
    elif 'tin' in item_lower or 'can' in item_lower:
        return 2
    else:
        return 0  # Default: no points for unrecognized items

# Helper function to append entry to JSON log file
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
    except Exception as e:
        print(f'Error writing to JSON log: {e}')

# Print startup information
print(f'Tracking system initialized')
print(f'Device System Date/Time: {startup_datetime.strftime("%A, %B %d, %Y at %H:%M:%S")}')
print(f'TXT log directory: {txt_log_dir}')
print(f'JSON log directory: {json_log_dir}')
print(f'Tracking log file: {tracking_log_file}')
print(f'Tracking log full path: {tracking_log_path}')
print(f'JSON log file: {json_log_file}')
print(f'JSON log full path: {json_log_path}')
print(f'Tracking confidence range: {MIN_CONFIDENCE*100:.0f}% - {MAX_CONFIDENCE*100:.0f}%')
print(f'Tracking duration: {TRACKING_DURATION} seconds')
print(f'Note: Log files will automatically switch to a new file when date changes\n')

# Initialize servo control system
print('=' * 60)
print('Initializing Servo Control System...')
print('=' * 60)
try:
    if SERVO_ENABLED:
        initialize_servos()
except Exception:
    print('Failed to init servo (might be desktop env)')
print('=' * 60 + '\n')

# Begin inference loop
try:
    while True:

        t_start = time.perf_counter()

        # Load frame from image source
        if source_type == 'image' or source_type == 'folder': # If source is image or image folder, load the image using its filename
            if img_count >= len(imgs_list):
                print('All images have been processed. Exiting program.')
                sys.exit(0)
            img_filename = imgs_list[img_count]
            frame = cv2.imread(img_filename)
            img_count = img_count + 1
        
        elif source_type == 'video': # If source is a video, load next frame from video file
            ret, frame = cap.read()
            if not ret:
                print('Reached end of the video file. Exiting program.')
                break
        
        elif source_type == 'usb': # If source is a USB camera, grab frame from camera
            ret, frame = cap.read()
            if (frame is None) or (not ret):
                print('Unable to read frames from the camera. This indicates the camera is disconnected or not working. Exiting program.')
                break

        elif source_type == 'picamera': # If source is a Picamera, grab frames using picamera interface
            frame_bgra = cap.capture_array()
            frame = cv2.cvtColor(np.copy(frame_bgra), cv2.COLOR_BGRA2BGR)
            if (frame is None):
                print('Unable to read frames from the Picamera. This indicates the camera is disconnected or not working. Exiting program.')
                break

        # Resize frame to desired display resolution
        if resize == True:
            frame = cv2.resize(frame,(resW,resH))

        # Run inference on frame
        results = model(frame, verbose=False)

        # Extract results
        detections = results[0].boxes

        # Get current time from device system clock for tracking (only for video/camera sources)
        # This uses the Raspberry Pi's system date/time
        if source_type == 'video' or source_type == 'usb' or source_type == 'picamera':
            current_time = time.time()  # Get system timestamp from device
            current_datetime = datetime.now()  # Get system date/time from device
            current_date = current_datetime.date()  # Get just the date part
            
            # Check if date has changed - if so, switch to a new log file
            if current_date != current_log_date:
                print(f'\nDate changed from {current_log_date} to {current_date}')
                print(f'Switching to new log file: {get_log_filename(current_datetime)}')
                print(f'Switching to new JSON log file: {get_json_log_filename(current_datetime)}')
                current_log_date = current_date
                tracking_log_file = get_log_filename(current_datetime)
                tracking_log_path = os.path.abspath(tracking_log_file)
                json_log_file = get_json_log_filename(current_datetime)
                json_log_path = os.path.abspath(json_log_file)
                
                # Create new log file for the new date
                new_file_exists = os.path.exists(tracking_log_file)
                with open(tracking_log_file, 'a') as f:
                    # Only write header if file is new
                    if not new_file_exists or os.path.getsize(tracking_log_file) == 0:
                        f.write('Tracked Items (70-100% confidence, tracked for 1 second)\n')
                        f.write('=' * 60 + '\n')
                        f.write(f'Log started on: {current_datetime.strftime("%A, %B %d, %Y at %H:%M:%S")}\n')
                        f.write(f'Device System Date: {current_datetime.strftime("%Y-%m-%d")}\n')
                        f.write('=' * 60 + '\n\n')
                    else:
                        # File exists, add a separator for new session
                        f.write(f'\n--- New session started: {current_datetime.strftime("%A, %B %d, %Y at %H:%M:%S")} ---\n\n')
                
                # Initialize new JSON log file
                new_json_file_exists = os.path.exists(json_log_file)
                if not new_json_file_exists or os.path.getsize(json_log_file) == 0:
                    with open(json_log_file, 'w') as f:
                        json.dump([], f)
        else:
            current_time = None
            current_datetime = None
            current_date = None

        # Initialize variable for basic object counting example
        object_count = 0

        # Filter detections with confidence between 70-100% for tracking (only for video/camera sources)
        tracking_candidates = []
        if current_time is not None:  # Only track for video/camera sources
            for i in range(len(detections)):
                # Get bounding box coordinates
                xyxy_tensor = detections[i].xyxy.cpu()
                xyxy = xyxy_tensor.numpy().squeeze()
                xmin, ymin, xmax, ymax = xyxy.astype(int)
                
                # Get bounding box class ID and name
                classidx = int(detections[i].cls.item())
                classname = labels[classidx]
                
                # Get bounding box confidence
                conf = detections[i].conf.item()
                
                # Check if confidence is in the tracking range (70-100%)
                if MIN_CONFIDENCE <= conf <= MAX_CONFIDENCE:
                    # Calculate centroid for tracking
                    centroid_x = (xmin + xmax) / 2
                    centroid_y = (ymin + ymax) / 2
                    # Generate a presence key and mark last seen time for this key
                    presence_key = compute_key_from_bbox([xmin, ymin, xmax, ymax], classname)
                    key_last_seen[presence_key] = current_time
                    tracking_candidates.append({
                        'bbox': [xmin, ymin, xmax, ymax],
                        'centroid': [centroid_x, centroid_y],
                        'class': classname,
                        'classidx': classidx,
                        'conf': conf,
                        'presence_key': presence_key,
                        'index': i
                    })

            # Build a list of ALL items above confidence (for state decision)
            all_items_info = []
            skip_tracking = False  # Initialize to False - allow tracking by default
            
            for candidate in tracking_candidates:
                all_items_info.append({
                    'class': candidate['class'],
                    'conf': candidate['conf'],
                    'bbox': candidate['bbox'],
                    'centroid': candidate['centroid'],
                    'presence_key': candidate['presence_key']
                })
            
            # If exactly 1 item detected, accept with 1s delay (periodic while state persists)
            if len(all_items_info) == 1:
                # Identify the single item info
                single_info = all_items_info[0]
                current_single_key = single_info['presence_key']
                if (not single_item_active) or (last_single_presence_key != current_single_key):
                    # New single item presence started
                    single_item_active = True
                    single_item_start_time = current_time
                    last_single_presence_key = current_single_key
                    single_logged = False
                else:
                    # Same single item; log only once after persistence
                    if (not single_logged) and ((current_time - single_item_start_time) >= TRACKING_DURATION):
                            dt = current_datetime
                            day_name = dt.strftime("%A")
                            month_name = dt.strftime("%B")
                            day = dt.day
                            month = dt.month
                            year = dt.year
                            time_str = dt.strftime("%H:%M:%S")
                            date_str = dt.strftime("%Y-%m-%d")
                            timestamp = dt.isoformat()
                            
                            # Write to text log file
                            with open(tracking_log_file, 'a') as f:
                                f.write(f'Date: {day_name}, {month_name} {day}, {year}\n')
                                f.write(f'Time: {time_str}\n')
                                f.write(f'Date (ISO): {date_str}\n')
                                f.write(f'Day: {day}, Month: {month}, Year: {year}\n')
                                f.write('Status: ACCEPTED\n')
                                f.write('Objects in frame: 1\n')
                                f.write(f'Item: {single_info["class"]} (Confidence: {single_info["conf"]*100:.2f}%)\n')
                                f.write(f'Bounding Box: ({single_info["bbox"][0]}, {single_info["bbox"][1]}) to ({single_info["bbox"][2]}, {single_info["bbox"][3]})\n')
                                f.write('-' * 60 + '\n\n')
                            
                            # Write to JSON log file (item types, points, and date with time)
                            item_points = get_points_for_item(single_info["class"])
                            date_time_str = f"{date_str} {time_str}"  # Combine date and time
                            json_entry = {
                                "date": date_time_str,
                                "item_type": single_info["class"],
                                "points": item_points
                            }
                            append_to_json_log(json_log_file, json_entry)
                            
                            single_logged = True
                            
                            # === SERVO TRIGGER: ACCEPTED ITEM ===
                            # Move Servo 1 to ACCEPT position (0 degrees)
                            trigger_accept()
                            
                            # Trigger UI notification for ACCEPTED (show for 1.5s)
                            notify_message = 'ACCEPTED (Objects in frame: 1)'
                            notify_color = (0, 200, 0)
                            notify_until = current_time + 1.5
                # Allow tracking/visuals to proceed when single item
                skip_tracking = False

            # If 2 or more items detected, reject with 1s delay (periodic while state persists)
            elif len(all_items_info) >= 2:
                # Build a signature of current items using presence_keys
                current_signature = set([info['presence_key'] for info in all_items_info])
                if (not multi_item_reject_active) or (current_signature != last_multi_signature):
                    multi_item_reject_active = True
                    multi_item_start_time = current_time
                    last_multi_signature = current_signature
                    multi_logged = False
                else:
                    # Same set of items; log only once after persistence
                    if (not multi_logged) and ((current_time - multi_item_start_time) >= TRACKING_DURATION):
                            dt = current_datetime
                            day_name = dt.strftime("%A")
                            month_name = dt.strftime("%B")
                            day = dt.day
                            month = dt.month
                            year = dt.year
                            time_str = dt.strftime("%H:%M:%S")
                            date_str = dt.strftime("%Y-%m-%d")
                            timestamp = dt.isoformat()
                            
                            # Write to text log file
                            with open(tracking_log_file, 'a') as f:
                                f.write(f'Date: {day_name}, {month_name} {day}, {year}\n')
                                f.write(f'Time: {time_str}\n')
                                f.write(f'Date (ISO): {date_str}\n')
                                f.write(f'Day: {day}, Month: {month}, Year: {year}\n')
                                f.write(f'Status: REJECTED\n')
                                f.write(f'Reason: Multiple items detected\n')
                                f.write(f'Objects in frame: {len(all_items_info)}\n')
                                f.write(f'Items detected:\n')
                                for idx, item_info in enumerate(all_items_info, 1):
                                    f.write(f'  Item {idx}: {item_info["class"]} (Confidence: {item_info["conf"]*100:.2f}%)\n')
                                    f.write(f'    Bounding Box: ({item_info["bbox"][0]}, {item_info["bbox"][1]}) to ({item_info["bbox"][2]}, {item_info["bbox"][3]})\n')
                                f.write('-' * 60 + '\n\n')
                            
                            # Write to JSON log file (item types, points, and date with time - rejected items get 0 points)
                            item_types = [item_info["class"] for item_info in all_items_info]
                            date_time_str = f"{date_str} {time_str}"  # Combine date and time
                            json_entry = {
                                "date": date_time_str,
                                "item_type": item_types,
                                "points": 0  # Rejected items earn no points
                            }
                            append_to_json_log(json_log_file, json_entry)
                            
                            multi_logged = True
                            
                            # === SERVO TRIGGER: REJECTED ITEMS ===
                            # Trigger reject gate for multiple items
                            trigger_rejection()
                            
                            # Trigger UI notification for REJECTED (show for 1.5s)
                            notify_message = f'REJECTED (Objects in frame: {len(all_items_info)})'
                            notify_color = (0, 0, 255)
                            notify_until = current_time + 1.5
                # Skip tracking while multi-item present
                skip_tracking = True

            # Reset timers if zero or switching states
            else:
                # No items or state changed from single/multi; reset timers and logged flags
                if single_item_active and len(all_items_info) != 1:
                    single_item_active = False
                    single_item_start_time = 0.0
                    single_item_last_log_time = 0.0
                    single_logged = False
                    last_single_presence_key = None
                if multi_item_reject_active and len(all_items_info) < 2:
                    multi_item_reject_active = False
                    multi_item_start_time = 0.0
                    multi_item_last_log_time = 0.0
                    multi_logged = False
                    last_multi_signature = set()
                skip_tracking = False

            # Match current detections to existing tracked objects (only if not rejected)
            if not skip_tracking:
                matched_track_ids = set()
                for candidate in tracking_candidates:
                    # Check if this candidate matches any already-logged item
                    # Use actual pixel distance to verify it's the same object
                    candidate_centroid = (candidate['centroid'][0], candidate['centroid'][1])
                    candidate_class = candidate['class']
                    is_logged_item = False
                    matched_logged_key = None
                    
                    # Check all logged items of the same class
                    for logged_key in logged_present_keys:
                        if logged_key[0] == candidate_class:  # Same class
                            if logged_key in logged_item_positions:
                                logged_pos = logged_item_positions[logged_key]
                                # Calculate distance between candidate and logged item
                                distance = np.sqrt(
                                    (candidate_centroid[0] - logged_pos[0])**2 +
                                    (candidate_centroid[1] - logged_pos[1])**2
                                )
                                # If within 150 pixels, consider it the same object
                                if distance < 150:
                                    is_logged_item = True
                                    matched_logged_key = logged_key
                                    # Update the logged item's position and last seen time
                                    logged_item_positions[logged_key] = candidate_centroid
                                    key_last_seen[logged_key] = current_time
                                    break
                    
                    # If this candidate matches a logged item, skip tracking to prevent re-logging
                    if is_logged_item:
                        continue  # Skip this candidate - it's already been logged and is still present
                    
                    best_match_id = None
                    best_distance = float('inf')
                    
                    # Find closest existing tracked object of the same class
                    for track_id, tracked_obj in tracked_objects.items():
                        if tracked_obj['class'] == candidate['class']:
                            # Calculate distance between centroids
                            tracked_centroid = [
                                (tracked_obj['bbox'][0] + tracked_obj['bbox'][2]) / 2,
                                (tracked_obj['bbox'][1] + tracked_obj['bbox'][3]) / 2
                            ]
                            distance = np.sqrt(
                                (candidate['centroid'][0] - tracked_centroid[0])**2 +
                                (candidate['centroid'][1] - tracked_centroid[1])**2
                            )
                            
                            if distance < TRACKING_DISTANCE_THRESHOLD and distance < best_distance:
                                best_distance = distance
                                best_match_id = track_id
                    
                    # Update existing tracked object or create new one
                    if best_match_id is not None:
                        tracked_objects[best_match_id]['bbox'] = candidate['bbox']
                        tracked_objects[best_match_id]['last_seen'] = current_time
                        tracked_objects[best_match_id]['conf'] = candidate['conf']
                        tracked_objects[best_match_id]['presence_key'] = candidate['presence_key']
                        matched_track_ids.add(best_match_id)
                    else:
                        # Only create new tracked object if it hasn't been logged yet
                        # Create new tracked object
                        tracked_objects[next_track_id] = {
                            'class': candidate['class'],
                            'start_time': current_time,
                            'bbox': candidate['bbox'],
                            'last_seen': current_time,
                            'conf': candidate['conf'],
                            'presence_key': candidate['presence_key']
                        }
                        matched_track_ids.add(next_track_id)
                        next_track_id += 1

                # Check for tracked objects that have been tracked for 5+ seconds and clean them up
                # Note: Frame-level logging handles ACCEPTED/REJECTED to avoid conflicts
                objects_to_remove = []
                for track_id, tracked_obj in tracked_objects.items():
                    tracking_duration = current_time - tracked_obj['start_time']
                    if tracking_duration >= TRACKING_DURATION:
                        objects_to_remove.append(track_id)
                
                # Remove logged objects from tracking
                for track_id in objects_to_remove:
                    del tracked_objects[track_id]
                
                # Remove objects that haven't been seen recently (not matched in this frame)
                for track_id in list(tracked_objects.keys()):
                    if track_id not in matched_track_ids:
                        # Give it a grace period - if not seen for 0.5 seconds, remove it
                        if current_time - tracked_objects[track_id]['last_seen'] > 0.5:
                            del tracked_objects[track_id]

            # Expire logged-present keys when the object has been absent long enough
            # This allows re-logging only after the object leaves the frame
            # This runs regardless of skip_tracking to clean up old logged items
            if current_time is not None:
                for presence_key in list(logged_present_keys):
                    last_seen_time = key_last_seen.get(presence_key, 0)
                    # If not seen for > 0.8s, consider it absent and allow future logging
                    if current_time - last_seen_time > 0.8:
                        logged_present_keys.discard(presence_key)
                        key_last_seen.pop(presence_key, None)
                        logged_item_positions.pop(presence_key, None)  # Clean up position data

        # Go through each detection and get bbox coords, confidence, and class
        for i in range(len(detections)):

            # Get bounding box coordinates
            # Ultralytics returns results in Tensor format, which have to be converted to a regular Python array
            xyxy_tensor = detections[i].xyxy.cpu() # Detections in Tensor format in CPU memory
            xyxy = xyxy_tensor.numpy().squeeze() # Convert tensors to Numpy array
            xmin, ymin, xmax, ymax = xyxy.astype(int) # Extract individual coordinates and convert to int

            # Get bounding box class ID and name
            classidx = int(detections[i].cls.item())
            classname = labels[classidx]

            # Get bounding box confidence
            conf = detections[i].conf.item()

            # Draw box if confidence threshold is high enough
            if conf > 0.5:

                color = bbox_colors[classidx % 10]
                cv2.rectangle(frame, (xmin,ymin), (xmax,ymax), color, 2)

                label = f'{classname}: {int(conf*100)}%'
                labelSize, baseLine = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1) # Get font size
                label_ymin = max(ymin, labelSize[1] + 10) # Make sure not to draw label too close to top of window
                cv2.rectangle(frame, (xmin, label_ymin-labelSize[1]-10), (xmin+labelSize[0], label_ymin+baseLine-10), color, cv2.FILLED) # Draw white box to put label text in
                cv2.putText(frame, label, (xmin, label_ymin-7), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1) # Draw label text

                # Basic example: count the number of objects in the image
                object_count = object_count + 1

        # Calculate and draw framerate (if using video, USB, or Picamera source)
        if source_type == 'video' or source_type == 'usb' or source_type == 'picamera':
            cv2.putText(frame, f'FPS: {avg_frame_rate:0.2f}', (10,20), cv2.FONT_HERSHEY_SIMPLEX, .7, (0,255,255), 2) # Draw framerate
        
        # Display detection results
        cv2.putText(frame, f'Number of objects: {object_count}', (10,40), cv2.FONT_HERSHEY_SIMPLEX, .7, (0,255,255), 2) # Draw total number of detected objects
        if current_time is not None:  # Only show tracking info for video/camera sources
            cv2.putText(frame, f'Tracking (70-100%): {len(tracked_objects)} objects', (10,60), cv2.FONT_HERSHEY_SIMPLEX, .7, (0,255,0), 2) # Draw number of tracked objects

        # Draw gating countdown UI (accept/reject timer) and notifications
        if current_time is not None:
            # Acceptance countdown when exactly 1 item and not yet logged (only if NOT in multi-item mode)
            if single_item_active and (last_single_presence_key is not None) and (not single_logged) and (not multi_item_reject_active):
                remaining = max(0.0, TRACKING_DURATION - (current_time - single_item_start_time))
                cv2.putText(frame, f'Accept in: {remaining:0.1f}s', (10, 90), cv2.FONT_HERSHEY_SIMPLEX, .7, (0,200,0), 2)
            # Rejection countdown when 2+ items and not yet logged
            if multi_item_reject_active and (len(last_multi_signature) >= 2) and (not multi_logged):
                remaining = max(0.0, TRACKING_DURATION - (current_time - multi_item_start_time))
                cv2.putText(frame, f'Reject in: {remaining:0.1f}s', (10, 120), cv2.FONT_HERSHEY_SIMPLEX, .7, (0,0,200), 2)
            # Ephemeral notification after a log
            if current_time < notify_until and notify_message:
                cv2.putText(frame, notify_message, (10, 150), cv2.FONT_HERSHEY_SIMPLEX, .8, notify_color, 2)
        cv2.imshow('YOLO detection results',frame) # Display image
        if record: recorder.write(frame)

        # If inferencing on individual images, wait for user keypress before moving to next image. Otherwise, wait 5ms before moving to next frame.
        if source_type == 'image' or source_type == 'folder':
            key = cv2.waitKey()
        elif source_type == 'video' or source_type == 'usb' or source_type == 'picamera':
            key = cv2.waitKey(5)
        
        if key == ord('q') or key == ord('Q'): # Press 'q' to quit
            break
        elif key == ord('s') or key == ord('S'): # Press 's' to pause inference
            cv2.waitKey()
        elif key == ord('p') or key == ord('P'): # Press 'p' to save a picture of results on this frame
            cv2.imwrite('capture.png',frame)
        
        # Calculate FPS for this frame
        t_stop = time.perf_counter()
        frame_rate_calc = float(1/(t_stop - t_start))

        # Append FPS result to frame_rate_buffer (for finding average FPS over multiple frames)
        if len(frame_rate_buffer) >= fps_avg_len:
            temp = frame_rate_buffer.pop(0)
            frame_rate_buffer.append(frame_rate_calc)
        else:
            frame_rate_buffer.append(frame_rate_calc)

        # Calculate average FPS for past frames
        avg_frame_rate = np.mean(frame_rate_buffer)

except ImportError:
    pass

# Clean up
print(f'Average pipeline FPS: {avg_frame_rate:.2f}')
# Show the current log file path (may have changed if date changed during execution)
print(f'Current tracking log file: {tracking_log_file}')
print(f'Current tracking log full path: {tracking_log_path}')
print(f'Current JSON log file: {json_log_file}')
print(f'Current JSON log full path: {json_log_path}')

# Clean up servo control
print('\nCleaning up servo control...')
cleanup_servos()

if source_type == 'video' or source_type == 'usb':
    cap.release()
elif source_type == 'picamera':
    cap.stop()
if record: recorder.release()
cv2.destroyAllWindows()
