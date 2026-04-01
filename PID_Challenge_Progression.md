# PID Challenge Progression

Students have already completed Challenges 0–5 (syntax, straight line, circle, detect-and-stop, square, obstacle avoidance) using the **front sensor only**. This series builds towards a fully autonomous maze-following robot by introducing PID control one term at a time.

---

## Challenge 6A — Wall Following with P Control (Straight Corridor)

### New Concepts

- Side ultrasonic sensor (`read_distance_2()`)
- `drive()` method with signed speeds
- Motor dead zone (`MIN_MOTOR_SPEED = 120`)
- Proportional error correction

### Arena

Long straight corridor with a wall on one side. No turns.

### Goal

Follow the wall at a target distance from start to end zone using **P (Proportional) control only**.

### What Students Learn

| Concept        | Detail                                               |
| -------------- | ---------------------------------------------------- |
| Error          | `error = wall_distance - TARGET_DISTANCE`            |
| Kp             | Proportional gain — bigger error = bigger correction |
| `drive()`      | Signed speeds, automatic dead zone handling          |
| `BASE_SPEED`   | Must stay above 120 so wheels keep moving            |
| `MAX_STEERING` | Limits how much wheels can differ                    |
| Dead zone rule | `BASE_SPEED - MAX_STEERING >= 120`                   |

### Key Code Pattern

```python
error = my_robot.read_distance_2() - TARGET_WALL_DISTANCE
steering = Kp * error

right_speed = BASE_SPEED - steering
left_speed  = BASE_SPEED + steering

my_robot.drive(int(right_speed), int(left_speed))
```

### Success Criteria

Reach the end zone without hitting the wall.

### Maze

New `straight_corridor` — simple walled lane, no turns.

### Tuning Activity

| Symptom                         | Cause                             | Fix                                            |
| ------------------------------- | --------------------------------- | ---------------------------------------------- |
| Robot barely corrects           | Kp too low                        | Increase Kp                                    |
| Robot oscillates back and forth | Kp too high                       | Decrease Kp                                    |
| One wheel stops                 | `BASE_SPEED - MAX_STEERING < 120` | Increase `BASE_SPEED` or reduce `MAX_STEERING` |

---

## Challenge 6B — Wall Following with PD Control (Off-Centre Start)

### New Concepts

- Derivative term to dampen oscillations
- Tracking `previous_error`

### Arena

Same straight corridor but the robot starts **off-centre and/or angled** so that a P-only controller oscillates visibly before settling.

### Goal

Follow the wall **smoothly** to the end zone — fewer oscillations than P-only.

### What Students Learn

| Concept          | Detail                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| Derivative       | `derivative = error - previous_error`                                  |
| Kd               | Dampens oscillations — reacts to _rate of change_ of error             |
| Why P oscillates | Large initial error causes overshoot, then correction overshoots again |
| Why D helps      | As error shrinks quickly, D opposes the correction, slowing approach   |

### Key Code Addition (on top of 6A)

```python
derivative = error - previous_error

steering = (Kp * error) + (Kd * derivative)

previous_error = error
```

### Success Criteria

Reach end zone without hitting the wall.

### Maze

Reuse `straight_corridor` with a different start position (offset from the wall centreline, slight heading angle).

### Tuning Activity

| Symptom                             | Cause                     | Fix                  |
| ----------------------------------- | ------------------------- | -------------------- |
| Still oscillating                   | Kd too low                | Increase Kd          |
| Jerky movement, overreacts to noise | Kd too high               | Decrease Kd          |
| Sluggish initial response           | Kp too low relative to Kd | Increase Kp slightly |

---

## Challenge 6C — Wall Following with PID (L-Shaped Corridor)

### New Concepts

- Integral term for steady-state error
- Anti-windup (`INTEGRAL_MAX`)
- Resetting integral on sensor loss

### Arena

An L-shaped corridor — a long straight, then a 90° bend. After the turn, P-only drifts away from the wall because the error is small but persistent.

### Goal

Follow the wall around the L corner to the end zone without losing it.

### What Students Learn

| Concept        | Detail                                                           |
| -------------- | ---------------------------------------------------------------- |
| Integral       | `integral = integral + error` — accumulates over time            |
| Ki             | Fixes steady-state error — tiny persistent offset gets corrected |
| Anti-windup    | Cap integral to `INTEGRAL_MAX` so it doesn't explode             |
| Reset integral | When sensor returns -1 (lost the wall), reset to 0               |

### Key Code Addition (on top of 6B)

```python
integral = integral + error
if integral > INTEGRAL_MAX:
    integral = INTEGRAL_MAX
elif integral < -INTEGRAL_MAX:
    integral = -INTEGRAL_MAX

steering = (Kp * error) + (Ki * integral) + (Kd * derivative)
```

### Success Criteria

Reach end zone around the L corner without collision.

### Maze

Existing `simple` maze (L-shaped corridor).

### Tuning Activity

| Symptom                               | Cause                               | Fix                    |
| ------------------------------------- | ----------------------------------- | ---------------------- |
| Drifts after the turn                 | No integral, small persistent error | Add Ki (start at 0.01) |
| Slow oscillation that grows           | Ki too high                         | Decrease Ki            |
| Sudden acceleration after being stuck | Integral windup                     | Reduce `INTEGRAL_MAX`  |

---

## Challenge 6D — Front + Side Sensors (Dead End Detection)

### New Concepts

- Combining front sensor (`read_distance()`) with side PID
- Decision logic: "follow wall" vs "obstacle ahead — turn"
- State machine thinking

### Arena

A corridor that dead-ends into a wall. The robot must detect the dead end with the front sensor, stop, turn 90° or 180°, then continue wall-following.

### Goal

Follow the wall, detect the dead end, turn, and reach the end zone on the other side.

### What Students Learn

| Concept             | Detail                                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| Sensor fusion       | Front sensor for "stop/turn" decisions, side sensor for "follow" control  |
| Threshold distance  | If `read_distance() < FRONT_THRESHOLD` → obstacle ahead                   |
| Turn and re-acquire | After turning, the side sensor must re-detect the wall before PID resumes |
| State-based logic   | `if obstacle_ahead: turn() else: wall_follow()`                           |

### Key Code Pattern (wrapping the PID loop from 6C)

```python
while True:
    front_distance = my_robot.read_distance()

    if front_distance != -1 and front_distance < FRONT_THRESHOLD:
        # Dead end detected — stop and turn
        my_robot.brake()
        hold_state(0.3)
        my_robot.rotate_left(180)
        hold_state(TURN_TIME)
        my_robot.brake()
        hold_state(0.3)
        integral = 0  # Reset PID after turn
        previous_error = 0
    else:
        # Normal wall following (PID from Challenge 6C)
        wall_distance = my_robot.read_distance_2()
        # ... PID steering ...

    hold_state(0.05)
```

### Success Criteria

Navigate past at least one dead end to reach the end zone.

### Maze

New `dead_end` — T-shaped or U-shaped corridor.

### Tuning Activity

| Symptom                        | Cause                       | Fix                                |
| ------------------------------ | --------------------------- | ---------------------------------- |
| Crashes into dead end          | `FRONT_THRESHOLD` too small | Increase threshold (try 200–300mm) |
| Turns too early                | `FRONT_THRESHOLD` too large | Decrease threshold                 |
| Loses the wall after turning   | Integral not reset          | Add `integral = 0` after turn      |
| Turn overshoots or undershoots | `TURN_TIME` wrong           | Adjust turn duration               |

---

## Challenge 6E — Full Maze Solving (Hand-on-Wall)

### New Concepts

- Hand-on-wall algorithm (left-hand or right-hand rule)
- Combining all previous: PID wall following + front detection + turn decisions
- Systematic maze-solving strategy

### Arena

Full maze — student selects from `zigzag`, `spiral`, `classic`, or `obstacles`.

### Goal

Navigate the complete maze from start to exit using the hand-on-wall rule.

### What Students Learn

| Concept           | Detail                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Hand-on-wall rule | Keep one hand touching the wall and follow it — guaranteed to solve any simply-connected maze |
| Right-hand rule   | Always prefer turning right; follow the right wall                                            |
| Left-hand rule    | Always prefer turning left; follow the left wall                                              |
| Algorithm design  | Structured decision tree: wall ahead? → turn. Open side? → turn into it. Otherwise → follow.  |

### Algorithm Flowchart

```
┌──────────────────────┐
│ Read front distance   │
│ Read side distance    │
└────────┬─────────────┘
         │
    ┌────▼─────────────────┐
    │ Wall ahead?          │
    │ (front < threshold)  │
    └────┬────────┬────────┘
         │ YES    │ NO
    ┌────▼────┐   │
    │ Stop &  │   │
    │ Turn    │   │
    │ away    │   │
    └────┬────┘   │
         │        │
    ┌────▼────────▼────────┐
    │ Side wall visible?    │
    │ (side != -1)          │
    └────┬────────┬────────┘
         │ YES    │ NO
    ┌────▼────┐  ┌▼─────────┐
    │ PID     │  │ Lost wall │
    │ wall    │  │ → turn    │
    │ follow  │  │ toward it │
    └─────────┘  └───────────┘
```

### Key Code Pattern (full hand-on-wall)

```python
while True:
    front = my_robot.read_distance()
    side = my_robot.read_distance_2()

    # Priority 1: Wall ahead — must turn
    if front != -1 and front < FRONT_THRESHOLD:
        my_robot.brake()
        hold_state(0.3)
        my_robot.rotate_left(180)   # Turn away from wall
        hold_state(TURN_TIME)
        my_robot.brake()
        hold_state(0.3)
        integral = 0
        previous_error = 0

    # Priority 2: Lost the wall — turn toward it to re-acquire
    elif side == -1:
        # Gentle turn toward the wall side
        if WALL_SIDE == "right":
            my_robot.drive(BASE_SPEED, int(BASE_SPEED * 0.6))
        else:
            my_robot.drive(int(BASE_SPEED * 0.6), BASE_SPEED)

    # Priority 3: Normal wall following with PID
    else:
        error = side - TARGET_WALL_DISTANCE
        integral = integral + error
        # ... (full PID from Challenge 6C) ...
        my_robot.drive(int(right_speed), int(left_speed))

    previous_error = error if side != -1 else 0
    hold_state(0.05)
```

### Success Criteria

Reach the exit zone without hitting walls. Time limit: 60 seconds.

### Maze Options

| Maze        | Difficulty | Description                                  |
| ----------- | ---------- | -------------------------------------------- |
| `zigzag`    | Medium     | Alternating walls from opposite sides        |
| `spiral`    | Hard       | Spiral inward to the centre                  |
| `classic`   | Hard       | Dead ends and multiple paths                 |
| `obstacles` | Medium     | Scattered obstacles and wall-attached blocks |

### Tuning Activity

Students now tune the **complete system**:

| Parameter              | Purpose                    | Suggested Start |
| ---------------------- | -------------------------- | --------------- |
| `BASE_SPEED`           | Forward speed              | 160             |
| `TARGET_WALL_DISTANCE` | Desired gap from wall      | 150mm           |
| `FRONT_THRESHOLD`      | When to stop and turn      | 250mm           |
| `TURN_TIME`            | Duration of 90° turn       | Tune by trial   |
| `Kp`                   | Proportional steering      | 0.5             |
| `Ki`                   | Integral correction        | 0.01            |
| `Kd`                   | Derivative damping         | 0.3             |
| `MAX_STEERING`         | Max wheel speed difference | 40              |

---

## Challenge 7 — Gamepad Control (Unchanged)

BLE gamepad manual driving via HM-10 module. No changes.

---

## Progression Summary

| Challenge | PID Terms            | Sensors      | Arena Shape                 | Core Concept                    |
| --------- | -------------------- | ------------ | --------------------------- | ------------------------------- |
| **6A**    | P                    | Side         | Straight corridor           | Error, Kp, dead zone, `drive()` |
| **6B**    | P + D                | Side         | Straight (off-centre start) | Damping oscillations            |
| **6C**    | P + I + D            | Side         | L-shaped corridor           | Steady-state error, anti-windup |
| **6D**    | PID + front          | Side + Front | Dead-end corridor           | Sensor fusion, turn logic       |
| **6E**    | Full PID + algorithm | Both         | Full maze                   | Hand-on-wall rule               |

Each challenge adds ~5–10 lines of code on top of the previous solution.

---

## Suggested Starting PID Values

| Application               | Kp  | Ki   | Kd  | BASE_SPEED | MAX_STEERING |
| ------------------------- | --- | ---- | --- | ---------- | ------------ |
| Wall following (straight) | 0.5 | 0    | 0   | 160        | 40           |
| Wall following (with D)   | 0.5 | 0    | 0.3 | 160        | 40           |
| Wall following (full PID) | 0.5 | 0.01 | 0.3 | 160        | 40           |
| Maze navigation           | 0.5 | 0.01 | 0.3 | 160        | 40           |

**Dead zone rule:** `BASE_SPEED - MAX_STEERING >= 120`
