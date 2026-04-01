"""Full-board hardware integration test for AIDriver RP2040.

Upload this to the Pico and run via Arduino MicroPython Lab or REPL.
It tests motors (L298N), ultrasonic sensor (HCSR04), and the AIDriver
class that ties them together.

Requirements:
  - Robot on a flat surface with an obstacle 100–1500mm in front
  - Battery power ON
  - hcsr04.py and aidriver.py in lib/

Each test section prints PASS/FAIL and a summary at the end.
"""

from time import sleep, sleep_ms

# ── Result tracking ──────────────────────────────────────────────
_results = []


def _record(name, passed, detail=""):
    tag = "PASS" if passed else "FAIL"
    _results.append((name, passed, detail))
    msg = "[{}] {}".format(tag, name)
    if detail:
        msg += " — " + detail
    print(msg)


def _print_summary():
    print("\n" + "=" * 50)
    total = len(_results)
    passed = sum(1 for _, p, _ in _results if p)
    failed = total - passed
    print("RESULTS: {} passed, {} failed, {} total".format(passed, failed, total))
    if failed:
        print("\nFailed tests:")
        for name, p, detail in _results:
            if not p:
                print("  - {} : {}".format(name, detail))
    else:
        print("All tests passed!")
    print("=" * 50)


# ══════════════════════════════════════════════════════════════════
# SECTION 1 — Raw HCSR04 sensor (no AIDriver)
# ══════════════════════════════════════════════════════════════════
print("\n── Section 1: Raw HCSR04 ultrasonic sensor ───────")

try:
    from hcsr04 import HCSR04
    _record("hcsr04 import", True)
except ImportError as e:
    _record("hcsr04 import", False, str(e))
    HCSR04 = None

if HCSR04 is not None:
    # Instantiate with default AIDriver pins
    sensor = HCSR04(trigger_pin=7, echo_pin=6)
    _record("HCSR04 instantiation", True)

    # Take 5 readings, expect at least 3 valid (non-negative)
    readings = []
    for i in range(5):
        try:
            d = sensor.distance_mm()
            readings.append(d)
        except OSError:
            readings.append(-1)
        sleep_ms(80)

    valid = [r for r in readings if r >= 0]
    _record(
        "HCSR04 raw readings",
        len(valid) >= 3,
        "{} valid of 5: {}".format(len(valid), readings),
    )

    # Sanity check range (20mm–4000mm is the HC-SR04 spec)
    if valid:
        in_range = all(20 <= r <= 4000 for r in valid)
        _record(
            "HCSR04 range sanity",
            in_range,
            "min={}mm max={}mm".format(min(valid), max(valid)),
        )
    else:
        _record("HCSR04 range sanity", False, "no valid readings to check")

    # Clean up — release pins
    del sensor
else:
    _record("HCSR04 instantiation", False, "skipped (import failed)")
    _record("HCSR04 raw readings", False, "skipped")
    _record("HCSR04 range sanity", False, "skipped")


# ══════════════════════════════════════════════════════════════════
# SECTION 2 — AIDriver import and initialisation
# ══════════════════════════════════════════════════════════════════
print("\n── Section 2: AIDriver initialisation ────────────")

try:
    import aidriver
    from aidriver import AIDriver, hold_state
    _record("aidriver import", True)
except ImportError as e:
    _record("aidriver import", False, str(e))
    AIDriver = None

robot = None
if AIDriver is not None:
    aidriver.DEBUG_AIDRIVER = True
    try:
        robot = AIDriver()
        _record("AIDriver() constructor", True)
    except Exception as e:
        _record("AIDriver() constructor", False, str(e))

    # Verify ultrasonic was bound
    if robot is not None:
        has_us = robot.ultrasonic_1 is not None
        _record("AIDriver ultrasonic attached", has_us)
    else:
        _record("AIDriver ultrasonic attached", False, "robot not created")


# ══════════════════════════════════════════════════════════════════
# SECTION 3 — AIDriver read_distance (wraps HCSR04)
# ══════════════════════════════════════════════════════════════════
print("\n── Section 3: AIDriver read_distance() ───────────")

if robot is not None:
    readings = []
    for i in range(5):
        d = robot.read_distance()
        readings.append(d)
        sleep_ms(80)

    valid = [r for r in readings if r >= 0]
    _record(
        "read_distance readings",
        len(valid) >= 3,
        "{} valid of 5: {}".format(len(valid), readings),
    )

    # Compare with -1 sentinel
    sentinel_works = all(r == -1 or r >= 0 for r in readings)
    _record("read_distance sentinel (-1)", sentinel_works)
else:
    _record("read_distance readings", False, "skipped (no robot)")
    _record("read_distance sentinel (-1)", False, "skipped")


# ══════════════════════════════════════════════════════════════════
# SECTION 4 — Motor control (brief pulses, robot should twitch)
#   ⚠ Robot will move briefly! Keep it on a surface with clearance.
# ══════════════════════════════════════════════════════════════════
print("\n── Section 4: Motor control ──────────────────────")
print("  ⚠  Robot will move in short bursts — keep clear!")

if robot is not None:
    # --- 4a: Drive forward 0.3s ---
    try:
        robot.drive_forward(180, 180)
        sleep(0.3)
        robot.brake()
        sleep(0.5)
        _record("drive_forward (0.3s)", True)
    except Exception as e:
        robot.brake()
        _record("drive_forward (0.3s)", False, str(e))

    # --- 4b: Drive backward 0.3s ---
    try:
        robot.drive_backward(180, 180)
        sleep(0.3)
        robot.brake()
        sleep(0.5)
        _record("drive_backward (0.3s)", True)
    except Exception as e:
        robot.brake()
        _record("drive_backward (0.3s)", False, str(e))

    # --- 4c: Rotate left 0.3s ---
    try:
        robot.rotate_left(180)
        sleep(0.3)
        robot.brake()
        sleep(0.5)
        _record("rotate_left (0.3s)", True)
    except Exception as e:
        robot.brake()
        _record("rotate_left (0.3s)", False, str(e))

    # --- 4d: Rotate right 0.3s ---
    try:
        robot.rotate_right(180)
        sleep(0.3)
        robot.brake()
        sleep(0.5)
        _record("rotate_right (0.3s)", True)
    except Exception as e:
        robot.brake()
        _record("rotate_right (0.3s)", False, str(e))

    # --- 4e: Brake and verify stopped ---
    try:
        robot.brake()
        moving = robot.is_moving()
        _record("brake + is_moving", not moving, "is_moving={}".format(moving))
    except Exception as e:
        _record("brake + is_moving", False, str(e))

    # --- 4f: Differential speed (arc test) 0.3s ---
    try:
        robot.drive_forward(200, 140)
        sleep(0.3)
        robot.brake()
        sleep(0.5)
        _record("differential arc (0.3s)", True)
    except Exception as e:
        robot.brake()
        _record("differential arc (0.3s)", False, str(e))
else:
    for name in [
        "drive_forward (0.3s)",
        "drive_backward (0.3s)",
        "rotate_left (0.3s)",
        "rotate_right (0.3s)",
        "brake + is_moving",
        "differential arc (0.3s)",
    ]:
        _record(name, False, "skipped (no robot)")


# ══════════════════════════════════════════════════════════════════
# SECTION 5 — Integrated: drive + ultrasonic together
#   Verifies sensor still works while motors are running
# ══════════════════════════════════════════════════════════════════
print("\n── Section 5: Motors + ultrasonic combined ───────")

if robot is not None:
    try:
        robot.drive_forward(160, 160)
        sleep(0.1)

        # Read sensor while driving
        dist_while_moving = robot.read_distance()
        sleep(0.1)
        robot.brake()
        sleep(0.3)

        # Read sensor while stopped
        dist_while_stopped = robot.read_distance()

        moving_ok = dist_while_moving != -1 or dist_while_stopped != -1
        _record(
            "ultrasonic while driving",
            moving_ok,
            "moving={}mm stopped={}mm".format(dist_while_moving, dist_while_stopped),
        )
    except Exception as e:
        robot.brake()
        _record("ultrasonic while driving", False, str(e))
else:
    _record("ultrasonic while driving", False, "skipped (no robot)")


# ══════════════════════════════════════════════════════════════════
# SECTION 6 — hold_state helper
# ══════════════════════════════════════════════════════════════════
print("\n── Section 6: hold_state helper ──────────────────")

if robot is not None:
    from time import ticks_ms, ticks_diff

    try:
        t0 = ticks_ms()
        hold_state(0.5)
        elapsed = ticks_diff(ticks_ms(), t0)
        # Allow 400–700ms tolerance
        ok = 400 <= elapsed <= 700
        _record("hold_state(0.5)", ok, "{}ms elapsed".format(elapsed))
    except Exception as e:
        _record("hold_state(0.5)", False, str(e))
else:
    _record("hold_state(0.5)", False, "skipped")


# ══════════════════════════════════════════════════════════════════
# SECTION 7 — Challenge 5 mini-scenario
#   Simulates the obstacle avoidance loop for 3 iterations
# ══════════════════════════════════════════════════════════════════
print("\n── Section 7: Challenge 5 obstacle avoidance ────")

if robot is not None:
    safe_distance = 300
    iterations = 0
    max_iterations = 6
    avoided = False

    try:
        while iterations < max_iterations:
            distance = robot.read_distance()
            print("  loop {}: distance={}mm".format(iterations, distance))

            if distance != -1 and distance < safe_distance:
                robot.brake()
                sleep(0.3)
                robot.rotate_left(180)
                sleep(0.3)
                robot.brake()
                sleep(0.3)
                avoided = True
                break
            else:
                robot.drive_forward(160, 160)
                sleep(0.2)

            iterations += 1

        robot.brake()

        if avoided:
            _record("Challenge 5 avoidance", True, "obstacle detected and avoided")
        elif iterations >= max_iterations:
            _record(
                "Challenge 5 avoidance",
                True,
                "no obstacle within {}mm in {} loops (still valid)".format(
                    safe_distance, max_iterations
                ),
            )
        else:
            _record("Challenge 5 avoidance", True, "loop completed normally")
    except Exception as e:
        robot.brake()
        _record("Challenge 5 avoidance", False, str(e))
else:
    _record("Challenge 5 avoidance", False, "skipped (no robot)")


# ══════════════════════════════════════════════════════════════════
# FINAL — Safety brake + summary
# ══════════════════════════════════════════════════════════════════
if robot is not None:
    robot.brake()

_print_summary()
