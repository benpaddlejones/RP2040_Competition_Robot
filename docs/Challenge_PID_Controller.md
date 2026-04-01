# Challenge: PID Controller for Distance and Wall Following

In this challenge you will learn to implement a **PID controller** — a fundamental control algorithm used in robotics, drones, cruise control, and industrial automation. You will build it in phases, starting simple and adding complexity.

---

## What is a PID Controller?

A PID controller continuously calculates an **error** (the difference between where you want to be and where you are) and adjusts the output to minimise that error.

**PID** stands for:

| Term | What it does |
|------|--------------|
| **P** – Proportional | Reacts to the *current* error. Bigger error = bigger correction. |
| **I** – Integral | Reacts to *accumulated* error over time. Fixes steady-state drift. |
| **D** – Derivative | Reacts to *rate of change* of error. Dampens oscillations. |

The formula:

```
output = (Kp × error) + (Ki × integral) + (Kd × derivative)
```

---

## Hardware Constraints — IMPORTANT!

Before coding, you **must** understand your motor limits:

| Speed Value | Behaviour |
|-------------|-----------|
| **0** | ✅ Stopped (motor off) |
| **1–119** | ⚠️ **Dead zone** — motors stutter or don't move (not enough voltage) |
| **120–200** | ✅ Good working range |
| **200–255** | ⚡ Fast — use carefully |

### Why This Matters for PID

The AIDriver library has a special `drive()` method designed for PID control:

```python
my_robot.drive(right_speed, left_speed)
```

**How `drive()` works:**

| Input Speed | What Happens |
|-------------|--------------|
| `150` | Drive forward at speed 150 |
| `-150` | Drive backward at speed 150 |
| `80` | **Stops** (below 120, can't work) |
| `-80` | **Stops** (below 120, can't work) |
| `0` | Stops |

The `drive()` method:
1. Accepts **signed speeds** (-255 to +255)
2. Positive = forward, Negative = backward
3. **Automatically handles the dead zone** — speeds between -120 and 120 become 0
4. Handles direction changes internally (you don't need `drive_forward` / `drive_backward`)

### The Dead Zone Strategy

Because of the dead zone, your PID needs to work in one of two ways:

**Strategy A: High BASE_SPEED (Recommended for wall following)**
- Set `BASE_SPEED = 150` or higher
- PID corrections adjust around this base
- Robot always moves, just steers left/right

**Strategy B: Allow Stopping (For front distance control)**
- When PID output is small (robot near target), it stops
- When PID output is large, it moves
- Natural "stop when close enough" behaviour

---

## Part 1: Front Distance Controller

**Goal:** Make the robot maintain a fixed distance from an obstacle in front.

The robot will:
- Drive forward if too far away
- Drive backward if too close
- Stop when at the target distance (within the dead zone)

### Phase 1A: Proportional Only (P Controller)

Start with just the P term to understand the basics.

```python
from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = True

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION — Adjust these values
# ═══════════════════════════════════════════════════════════════

TARGET_DISTANCE_MM = 200  # Distance to maintain from obstacle (mm)

# PID Gains — Start with these, then tune
Kp = 1.0                  # Proportional gain

# ═══════════════════════════════════════════════════════════════
# MAIN PROGRAM
# ═══════════════════════════════════════════════════════════════

my_robot = AIDriver()
print("Front Distance P Controller")
print("Target:", TARGET_DISTANCE_MM, "mm")
print("Minimum motor speed:", my_robot.MIN_MOTOR_SPEED)

while True:
    # 1. Read sensor
    distance = my_robot.read_distance()
    
    # Skip if sensor error
    if distance == -1:
        my_robot.brake()
        hold_state(0.1)
        continue
    
    # 2. Calculate error
    #    Positive error = too far away (need to drive forward)
    #    Negative error = too close (need to drive backward)
    error = distance - TARGET_DISTANCE_MM
    
    # 3. Calculate P output (this IS our speed)
    speed = int(Kp * error)
    
    # 4. Clamp to motor limits
    if speed > 255:
        speed = 255
    elif speed < -255:
        speed = -255
    
    # 5. Drive! The drive() method handles:
    #    - Positive speed = forward
    #    - Negative speed = backward
    #    - Dead zone (|speed| < 120 becomes 0 = stop)
    my_robot.drive(speed, speed)
    
    # 6. Small delay for stability
    hold_state(0.05)
```

#### Understanding the Code

Let's trace through what happens at different distances:

| Distance | Error | Speed (Kp=1.0) | Result |
|----------|-------|----------------|--------|
| 400mm | +200 | 200 | Drive forward fast |
| 300mm | +100 | 100 | **Stop** (dead zone) |
| 200mm | 0 | 0 | Stop (at target) |
| 150mm | -50 | -50 | **Stop** (dead zone) |
| 50mm | -150 | -150 | Drive backward |

Notice: The robot stops when within ~120mm of the target. This is the dead zone acting as a natural "close enough" zone!

#### Tuning the P Controller

1. **Start with `Kp = 1.0`**
2. If the robot **responds too slowly** → **increase Kp** (try 1.5, 2.0)
3. If the robot **oscillates wildly** → **decrease Kp** (try 0.5, 0.3)
4. The dead zone means you'll always have a "close enough" stopping range

| Symptom | Cause | Fix |
|---------|-------|-----|
| Robot barely moves | Kp too low, error × Kp < 120 | Increase Kp |
| Robot overshoots and bounces | Kp too high | Decrease Kp |
| Robot stops 120mm from target | Dead zone (this is normal!) | Increase Kp or accept it |

---

### Phase 1B: Add Derivative (PD Controller)

The D term reduces oscillations by slowing down when approaching the target quickly.

```python
from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = True

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════

TARGET_DISTANCE_MM = 200

# PID Gains
Kp = 1.0
Kd = 0.5                  # Derivative gain — dampens oscillations

# ═══════════════════════════════════════════════════════════════
# MAIN PROGRAM
# ═══════════════════════════════════════════════════════════════

my_robot = AIDriver()
print("Front Distance PD Controller")

previous_error = 0

while True:
    distance = my_robot.read_distance()
    
    if distance == -1:
        my_robot.brake()
        hold_state(0.1)
        continue
    
    # Calculate error
    error = distance - TARGET_DISTANCE_MM
    
    # Calculate derivative (how fast is the error changing?)
    # If error is decreasing quickly, derivative is negative → slows us down
    derivative = error - previous_error
    
    # PD output
    p_output = Kp * error
    d_output = Kd * derivative
    
    speed = int(p_output + d_output)
    
    # Clamp to motor limits
    if speed > 255:
        speed = 255
    elif speed < -255:
        speed = -255
    
    # Drive! (handles direction and dead zone automatically)
    my_robot.drive(speed, speed)
    
    # Save error for next loop
    previous_error = error
    
    hold_state(0.05)
```

#### Understanding the Derivative Term

| Situation | Error | Derivative | Effect |
|-----------|-------|------------|--------|
| Approaching target slowly | Decreasing | Small negative | Slight slowdown |
| Approaching target fast | Decreasing | Large negative | Strong slowdown |
| Moving away from target | Increasing | Positive | Speeds up response |
| Holding steady | Constant | Zero | No effect |

**Tuning Kd:**
1. **Start with `Kd = 0.5`**
2. If oscillations persist → **increase Kd** (try 1.0, 2.0)
3. If robot becomes **jerky** or **oversensitive** → **decrease Kd**

---

### Phase 1C: Full PID Controller

Add the I term to eliminate steady-state error (when the robot settles but not exactly at the target).

```python
from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = True

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════

TARGET_DISTANCE_MM = 200

# PID Gains
Kp = 1.0
Ki = 0.02                 # Integral gain — keep this SMALL!
Kd = 0.5

# Anti-windup limit for integral term
INTEGRAL_MAX = 5000

# ═══════════════════════════════════════════════════════════════
# MAIN PROGRAM
# ═══════════════════════════════════════════════════════════════

my_robot = AIDriver()
print("Front Distance PID Controller")

previous_error = 0
integral = 0

while True:
    distance = my_robot.read_distance()
    
    if distance == -1:
        my_robot.brake()
        integral = 0  # Reset integral when sensor fails
        hold_state(0.1)
        continue
    
    # Calculate error
    error = distance - TARGET_DISTANCE_MM
    
    # Calculate integral (accumulated error over time)
    integral = integral + error
    
    # Anti-windup: limit how big integral can get
    if integral > INTEGRAL_MAX:
        integral = INTEGRAL_MAX
    elif integral < -INTEGRAL_MAX:
        integral = -INTEGRAL_MAX
    
    # Calculate derivative
    derivative = error - previous_error
    
    # Full PID output
    p_output = Kp * error
    i_output = Ki * integral
    d_output = Kd * derivative
    
    speed = int(p_output + i_output + d_output)
    
    # Clamp to motor limits
    if speed > 255:
        speed = 255
    elif speed < -255:
        speed = -255
    
    # Drive! (handles direction and dead zone automatically)
    my_robot.drive(speed, speed)
    
    previous_error = error
    
    hold_state(0.05)
```

#### Understanding the Integral Term

The I term fixes **steady-state error** — when the robot settles close to the target but not exactly on it.

| Situation | Integral Value | Effect |
|-----------|---------------|--------|
| Robot stuck slightly too far | Slowly grows positive | Gradually increases speed |
| Robot stuck slightly too close | Slowly grows negative | Gradually increases reverse speed |
| Robot at target | Stays near zero | No extra push |

**⚠️ Warning: Integral Windup**

If the robot can't reach the target (e.g., blocked by a wall), the integral keeps growing. When the obstacle is removed, the robot overshoots badly! The `INTEGRAL_MAX` limit prevents this.

**Tuning Ki:**
1. **Start with `Ki = 0.02`** (very small!)
2. If robot still settles away from target → **slightly increase Ki**
3. If robot slowly oscillates or suddenly shoots off → **decrease Ki**

---

## Part 2: Side Wall Following Controller

**Goal:** Make the robot follow a wall at a fixed distance using the side-mounted ultrasonic sensor (sensor 2).

**Key difference from front distance control:**
- The robot always drives **forward** at a fixed BASE_SPEED
- The PID controls **steering** (speed difference between wheels)
- We must stay **above the dead zone** on both wheels

### Phase 2A: P Controller for Wall Following

```python
from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = True

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════

BASE_SPEED = 160          # Forward speed — must be > 120!
TARGET_WALL_DISTANCE = 150  # Distance to maintain from wall (mm)

# PID Gain for steering
Kp = 0.5

# Limit how much the wheels can differ
MAX_STEERING = 40         # Maximum speed difference between wheels

# Which side is the wall on?
WALL_SIDE = "right"       # Change to "left" if wall is on left

# ═══════════════════════════════════════════════════════════════
# MAIN PROGRAM
# ═══════════════════════════════════════════════════════════════

my_robot = AIDriver()
print("Wall Following P Controller")
print("Wall on:", WALL_SIDE, "| Target:", TARGET_WALL_DISTANCE, "mm")

while True:
    # Read side sensor (sensor 2)
    wall_distance = my_robot.read_distance_2()
    
    if wall_distance == -1:
        # Lost the wall - drive straight
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        hold_state(0.05)
        continue
    
    # Calculate error (positive = too far, negative = too close)
    error = wall_distance - TARGET_WALL_DISTANCE
    
    # Calculate steering correction
    steering = Kp * error
    
    # Limit steering to avoid wild turns
    if steering > MAX_STEERING:
        steering = MAX_STEERING
    elif steering < -MAX_STEERING:
        steering = -MAX_STEERING
    
    # Apply differential steering
    # Wall on RIGHT: positive steering turns right (toward wall)
    # Wall on LEFT: positive steering turns left (toward wall)
    if WALL_SIDE == "right":
        right_speed = BASE_SPEED - steering  # Slow right to turn right
        left_speed = BASE_SPEED + steering   # Speed up left to turn right
    else:  # wall on left
        right_speed = BASE_SPEED + steering
        left_speed = BASE_SPEED - steering
    
    # drive() handles the dead zone: if either wheel drops below 120, it stops
    # That's why BASE_SPEED should be high enough that BASE_SPEED - MAX_STEERING >= 120
    my_robot.drive(int(right_speed), int(left_speed))
    
    hold_state(0.05)
```

#### Important: Keeping Both Wheels Above Dead Zone

For wall following to work smoothly, **both wheels must stay above 120**.

```
Minimum wheel speed = BASE_SPEED - MAX_STEERING

If BASE_SPEED = 160 and MAX_STEERING = 40:
    Minimum = 160 - 40 = 120  ✅ Just above dead zone

If BASE_SPEED = 150 and MAX_STEERING = 50:
    Minimum = 150 - 50 = 100  ❌ Wheel will stop!
```

**Rule:** `BASE_SPEED - MAX_STEERING >= 120`

#### Understanding Wall Following Steering

When following a wall on the **right side**:

| Situation | Error | Steering | Right Wheel | Left Wheel | Result |
|-----------|-------|----------|-------------|------------|--------|
| Too far from wall | +50 | +25 | Slower | Faster | Turn right toward wall |
| Too close to wall | -50 | -25 | Faster | Slower | Turn left away from wall |
| Perfect distance | 0 | 0 | Same | Same | Straight ahead |

---

### Phase 2B: Full PID Wall Following

```python
from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = True

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════

BASE_SPEED = 160          # Must be > 120 + MAX_STEERING
TARGET_WALL_DISTANCE = 150

# PID Gains for steering
Kp = 0.5
Ki = 0.01
Kd = 0.3

# Limits
MAX_STEERING = 40         # Keep BASE_SPEED - MAX_STEERING >= 120
INTEGRAL_MAX = 500

# Wall side
WALL_SIDE = "right"

# ═══════════════════════════════════════════════════════════════
# MAIN PROGRAM
# ═══════════════════════════════════════════════════════════════

my_robot = AIDriver()
print("Wall Following PID Controller")
print("Wall on:", WALL_SIDE)
print("Target distance:", TARGET_WALL_DISTANCE, "mm")
print("Speed range:", BASE_SPEED - MAX_STEERING, "to", BASE_SPEED + MAX_STEERING)

previous_error = 0
integral = 0

while True:
    wall_distance = my_robot.read_distance_2()
    
    if wall_distance == -1:
        # Lost the wall - drive straight, reset integral
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        integral = 0
        hold_state(0.05)
        continue
    
    # Calculate error
    error = wall_distance - TARGET_WALL_DISTANCE
    
    # Calculate PID terms
    integral = integral + error
    if integral > INTEGRAL_MAX:
        integral = INTEGRAL_MAX
    elif integral < -INTEGRAL_MAX:
        integral = -INTEGRAL_MAX
    
    derivative = error - previous_error
    
    p_output = Kp * error
    i_output = Ki * integral
    d_output = Kd * derivative
    
    steering = p_output + i_output + d_output
    
    # Limit steering
    if steering > MAX_STEERING:
        steering = MAX_STEERING
    elif steering < -MAX_STEERING:
        steering = -MAX_STEERING
    
    # Apply differential steering based on wall side
    if WALL_SIDE == "right":
        right_speed = BASE_SPEED - steering
        left_speed = BASE_SPEED + steering
    else:
        right_speed = BASE_SPEED + steering
        left_speed = BASE_SPEED - steering
    
    my_robot.drive(int(right_speed), int(left_speed))
    
    previous_error = error
    
    hold_state(0.05)
```

---

## Tuning Guide Summary

### Step-by-Step Tuning Process

1. **Set Ki = 0, Kd = 0** (start with P only)
2. **Increase Kp** until the robot responds quickly but oscillates
3. **Decrease Kp slightly** to reduce oscillation
4. **Add Kd** to dampen remaining oscillation
5. **Add small Ki** only if there's persistent steady-state error

### Quick Reference Table

| Gain | Too Low | Too High |
|------|---------|----------|
| **Kp** | Sluggish, doesn't reach target | Wild oscillations |
| **Ki** | Steady-state error | Slow oscillation, windup |
| **Kd** | Oscillations persist | Jerky, oversensitive to noise |

### Suggested Starting Values

| Application | Kp | Ki | Kd | Notes |
|-------------|-----|-----|-----|-------|
| Front Distance | 1.0 | 0.02 | 0.5 | Output is speed directly |
| Wall Following | 0.5 | 0.01 | 0.3 | Output is steering adjustment |

---

## The `drive()` Method Explained

The `drive(right_speed, left_speed)` method simplifies PID control:

```python
# Positive = forward, Negative = backward
my_robot.drive(150, 150)   # Forward at speed 150
my_robot.drive(-150, -150) # Backward at speed 150
my_robot.drive(150, 120)   # Forward, slight right turn
my_robot.drive(80, 80)     # STOPS (below dead zone)
my_robot.drive(0, 0)       # STOPS (explicit)
```

**Dead zone handling:**
- Any speed from -119 to +119 becomes 0 (motor stops)
- This is automatic — you don't need helper functions!

**Why this matters for PID:**
- Front distance: When error is small, speed drops into dead zone → robot stops naturally
- Wall following: Keep BASE_SPEED high enough that wheels stay above 120

---

## Troubleshooting

| Problem | Possible Cause | Solution |
|---------|----------------|----------|
| Robot stops unexpectedly | Wheel speed dropped below 120 | Increase BASE_SPEED or reduce MAX_STEERING |
| Motors stutter | Speed bouncing around 120 | Increase Kp to make movements more decisive |
| Robot doesn't move | Sensor returning -1 | Check ultrasonic wiring, aim at flat surface |
| Wild oscillations | Kp too high | Reduce Kp, add Kd |
| Robot drifts off target | Steady-state error | Add small Ki |
| Robot suddenly accelerates | Integral windup | Reduce `INTEGRAL_MAX` or Ki |
| Jerky movement | Kd too high or noisy sensor | Reduce Kd |
| One wheel stops in turns | BASE_SPEED - MAX_STEERING < 120 | Increase BASE_SPEED or reduce MAX_STEERING |

---

## Extension Challenges

Once you have wall following working:

1. **Corner Detection:** Stop or turn when the front sensor detects an obstacle
2. **Maze Solving:** Combine front and side PID controllers
3. **Speed Adaptation:** Slow down in tight spaces, speed up in open areas
4. **Two-Wall Following:** Use both sensors to stay centred in a corridor

---

## Glossary

| Term | Definition |
|------|------------|
| **Error** | Difference between target and actual value |
| **Proportional** | Response proportional to current error |
| **Integral** | Accumulated error over time |
| **Derivative** | Rate of change of error |
| **Setpoint** | The target value (e.g., target distance) |
| **Steady-state error** | Persistent offset when settled |
| **Overshoot** | Going past the target before settling |
| **Oscillation** | Bouncing back and forth around target |
| **Windup** | Integral accumulating to extreme values |
| **Dead zone** | Speed range (1-119) where motors can't work reliably |
| **Differential steering** | Turning by running wheels at different speeds |
