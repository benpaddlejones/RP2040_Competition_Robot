"""
AIDriver MicroPython Library for RP2040
A unified 2-wheel robot library with ultrasonic sensor

Converted from Arduino C++ library by Ben Jones @ Tempe High School
Original licenses maintained: GNU GPL for code, Creative Commons for content

Dependencies: machine, time modules (built into MicroPython)
"""

from machine import Pin, PWM, time_pulse_us
from time import sleep_us, sleep_ms, sleep as _sleep, ticks_ms, ticks_diff

try:
    import eventlog
except Exception:
    eventlog = None


def _speed_band(speed_value):
    """Return a human label for a motor speed using agreed classroom bands."""
    if speed_value <= 80:
        return "stopped"
    if speed_value <= 120:
        return "very slow"
    if speed_value <= 180:
        return "slow"
    if speed_value <= 220:
        return "normal"
    return "very fast"


def _describe_drive(direction, right_speed, left_speed):
    """Build an event-log sentence for forward/backward movement commands."""
    max_speed = max(right_speed, left_speed)
    if max_speed <= 80:
        return (
            f"{direction} requested with R={right_speed}, L={left_speed} – "
            "speeds are in the stopped range so the robot may not move"
        )

    band = _speed_band(max_speed)
    message = f"{direction} at {band} speed" f" (R={right_speed}, L={left_speed})"

    speed_diff = right_speed - left_speed
    if abs(speed_diff) > 20:
        arc_direction = "right" if speed_diff > 0 else "left"
        message += f"; expect an arc toward the {arc_direction}"

    return message


def _describe_rotation(direction, turn_speed):
    """Build an event-log sentence for rotate commands."""
    if turn_speed <= 80:
        return (
            f"Rotate {direction} requested with speed {turn_speed} – "
            "speed is in the stopped range so the robot may not turn"
        )

    band = _speed_band(turn_speed)
    return f"Rotate {direction} on the spot at {band} speed ({turn_speed})"


# Global debug flag for AIDriver library
DEBUG_AIDRIVER = False


# Onboard status LED – use GPIO 25 (Raspberry Pi Pico onboard LED).
# GPIO 13 cannot be used here because it is the left-motor direction pin.
# Using PWM for heartbeat - runs entirely in hardware with zero CPU impact.
_STATUS_LED_PIN = 25
_STATUS_LED_PWM = None  # Initialized lazily in AIDriver.__init__()


# Internal state for non-blocking heartbeat timing (legacy, kept for compatibility)
_last_heartbeat_ms = 0


# Ultrasonic sensor inline warning state
_ultrasonic_fail_count = 0
_ultrasonic_warned = False  # Have we printed the initial warning?


def _ultrasonic_warn_inline(message):
    """Print a warning once, then add dots for each subsequent failure.

    This approach works in all terminals including Arduino Lab which
    doesn't support carriage return for in-place updates.
    """
    global _ultrasonic_fail_count, _ultrasonic_warned

    _ultrasonic_fail_count += 1

    # Print the initial warning (no newline)
    if not _ultrasonic_warned:
        # Use separate print to ensure message appears
        print()  # newline first to separate from previous output
        print("[AIDriver] " + message, end="")
        _ultrasonic_warned = True
    else:
        # Just add a dot for each subsequent failure
        print(".", end="")


def _ultrasonic_warn_clear():
    """End the warning line and reset the failure counter."""
    global _ultrasonic_fail_count, _ultrasonic_warned

    if _ultrasonic_warned:
        # End the line with newline
        print()  # newline

    _ultrasonic_fail_count = 0
    _ultrasonic_warned = False
    _ultrasonic_last_warn_ms = 0


def _start_pwm_heartbeat():
    """Start PWM-based heartbeat on the onboard LED.

    Uses hardware PWM at ~1Hz with 50% duty cycle - runs entirely in
    hardware with zero CPU interrupts or blocking.
    """
    global _STATUS_LED_PWM
    if _STATUS_LED_PWM is not None:
        return  # Already running

    try:
        _STATUS_LED_PWM = PWM(Pin(_STATUS_LED_PIN))
        _STATUS_LED_PWM.freq(8)  # RP2040 minimum PWM freq is ~8Hz
        _STATUS_LED_PWM.duty_u16(32768)  # 50% duty cycle
        _d("PWM heartbeat started (8Hz, hardware-driven)")
    except Exception as exc:
        _d("Failed to start PWM heartbeat:", exc)
        _STATUS_LED_PWM = None


def heartbeat(period_ms=1000):
    """Adjust the PWM heartbeat frequency.

    With PWM-based heartbeat, this adjusts the blink rate.
    The LED blinks automatically in hardware - no need to call this
    from a loop. Use it only if you want to change the blink speed.

    Args:
        period_ms: Blink period in milliseconds (default 1000 = 1Hz)
    """
    if _STATUS_LED_PWM is None:
        return

    try:
        # Convert period to frequency (Hz)
        freq = max(1, 1000 // period_ms)
        _STATUS_LED_PWM.freq(freq)
    except Exception:
        pass


def _explain_error(exc):
    """Internal helper to add student-friendly hints for common exceptions.

    This is automatically used around key AIDriver methods when DEBUG_AIDRIVER
    is True. It never changes the actual exception behaviour; it only prints
    extra guidance before the normal traceback.
    """

    if not DEBUG_AIDRIVER:
        return

    msg = str(exc)
    print("[AIDriver] Extra help for error:")

    # NameError hints – usually missing or mis-typed my_robot / AIDriver
    if isinstance(exc, NameError):
        if "my_robot" in msg:
            print(" - You are using 'my_robot' but have not created it.")
            print("   Make sure you have 'my_robot = AIDriver()' near the top.")
        elif "AIDriver" in msg:
            print(" - Python cannot find 'AIDriver'.")
            print("   Check you wrote 'from aidriver import AIDriver' exactly.")
        else:
            print(" - A name in your code does not exist.")
            print("   Check for spelling differences from the example code.")

    # AttributeError hints – often wrong method name on AIDriver
    elif isinstance(exc, AttributeError):
        if "AIDriver" in msg or "object has no attribute" in msg:
            print(" - You likely called a method that is not in AIDriver.")
            print("   Valid AIDriver methods include:")
            print("     drive_forward, drive_backward, rotate_left,")
            print("     rotate_right, brake, read_distance")
            print("   Compare your code with the challenge notes.")

    # ImportError hints – aidriver not found
    elif isinstance(exc, ImportError):
        if "aidriver" in msg:
            print(" - Python cannot import 'aidriver'.")
            print("   Ensure 'aidriver.py' is in the 'lib/' folder ")
            print("   in the Arduino MicroPython Lab workspace.")

    # ValueError hints – often wrong speed ranges, etc.
    elif isinstance(exc, ValueError):
        print(" - A value passed into a function is not acceptable.")
        print("   Check speed values are between 0 and 255,")
        print("   and that distances or times are sensible.")

    else:
        print(" -", type(exc).__name__, msg)

    print("[AIDriver] See 'Common_Errors.md' for more examples.")


def _d(*args):
    """Internal debug logger for the AIDriver library.

    When DEBUG_AIDRIVER is True, messages are printed with an [AIDriver] prefix.
    This is intended for teachers or advanced students diagnosing issues.
    """
    if DEBUG_AIDRIVER:
        print("[AIDriver]", *args)


def hold_state(seconds):
    """Pause the robot while recording the pause in the event log.

    This is a classroom-friendly helper that replaces raw ``sleep(seconds)``.

    Example usage in ``main.py``::

        from aidriver import AIDriver, hold_state

        my_robot = AIDriver()

        my_robot.drive_forward(200, 200)
        hold_state(1)  # robot keeps doing the same thing for 1 second
        my_robot.brake()

    The helper uses the built-in time.sleep under the hood, so timing
    behaviour is the same as calling ``sleep(seconds)`` directly.
    """

    try:
        seconds_float = float(seconds)
    except (TypeError, ValueError):
        # Fall back to 0 seconds if a bad value is passed; let MicroPython
        # handle any deeper issues rather than raising here.
        seconds_float = 0

    if eventlog is not None:
        try:
            if seconds_float == 1:
                msg = "Robot holding state for 1 second"
            else:
                msg = "Robot holding state for {:.2f} second(s)".format(seconds_float)
            eventlog.log_event(msg)
        except Exception:
            # Never let logging break student programs.
            pass

    _d("hold_state:", seconds_float, "second(s)")
    _sleep(seconds_float)


def _led_heartbeat_ok():
    """Legacy function - heartbeat is now automatic via PWM.

    The onboard LED now blinks automatically using hardware PWM when
    AIDriver is instantiated. This function is kept for compatibility
    but does nothing.
    """
    pass


class UltrasonicSensor:
    """
    HC-SR04 Ultrasonic Sensor class for distance measurement.
    """

    def __init__(self, trig_pin, echo_pin):
        """
        Initialize ultrasonic sensor.

        Args:
            trig_pin: GPIO pin for trigger signal.
            echo_pin: GPIO pin for echo signal.
        """
        self.trig_pin = Pin(trig_pin, Pin.OUT)
        self.echo_pin = Pin(echo_pin, Pin.IN)
        self.trig_pin.off()

        # Sensor configuration
        self.max_distance_mm = 2000  # Max sensor range in mm
        # Timeout: 30,000μs allows ~2x longer echo wait (500 * 2 * 30)
        self.timeout_us = 30000

    def read_distance_mm(self):
        """
        Read distance from the sensor and return it in millimeters.

        Returns:
            int: Distance in millimeters, or -1 if the reading is out of range or fails.
        """
        # Pre-check: ensure echo pin is LOW (not stuck high from wiring issue)
        if self.echo_pin.value() != 0:
            _ultrasonic_warn_inline("Echo pin stuck HIGH – check wiring")
            if _ultrasonic_fail_count <= 3 and eventlog is not None:
                try:
                    eventlog.log_event("ultrasonic echo pin stuck high")
                except Exception:
                    pass
            return -1

        # Send a 10μs trigger pulse with 5μs stabilization
        self.trig_pin.off()
        sleep_us(5)
        self.trig_pin.on()
        sleep_us(10)
        self.trig_pin.off()

        try:
            # Measure the duration of the echo pulse (with retry on failure)
            duration = time_pulse_us(self.echo_pin, 1, self.timeout_us)

            # time_pulse_us returns -1 on timeout and -2 on invalid state
            if duration < 0:
                # Retry once after brief delay to handle transient issues
                sleep_ms(20)  # Let sensor settle
                self.trig_pin.off()
                sleep_us(5)
                self.trig_pin.on()
                sleep_us(10)
                self.trig_pin.off()
                duration = time_pulse_us(self.echo_pin, 1, self.timeout_us)
                
                # If still failing after retry, report error
                if duration < 0:
                    _ultrasonic_warn_inline("Sensor error – check wiring")
                    # Only log to eventlog on first few failures to avoid log spam
                    if _ultrasonic_fail_count <= 3 and eventlog is not None:
                        try:
                            eventlog.log_event("ultrasonic timeout or invalid echo")
                        except Exception:
                            pass
                    return -1

            # Calculate distance in mm using integer math (avoids floating point)
            # Sound speed: 343.2 m/s = 0.3432 mm/μs
            # distance = (time * speed) / 2, so: time * 100 // 582
            distance_mm = duration * 100 // 582

            # Check if the reading is within the valid range (20mm to 2000mm)
            if 20 <= distance_mm <= self.max_distance_mm:
                # Clear any inline warning since we got a good reading
                _ultrasonic_warn_clear()
                result = int(distance_mm)
                
                # Log AFTER timing-sensitive measurement is complete
                if eventlog is not None:
                    try:
                        eventlog.log_event(
                            "distance reading: {} mm".format(result)
                        )
                    except Exception:
                        pass
                return result

            # Out of range – likely too close, too far, or pointing into open space
            _ultrasonic_warn_inline("Out of range ({}mm)".format(int(distance_mm)))
            # Only log to eventlog on first few failures to avoid log spam
            if _ultrasonic_fail_count <= 3 and eventlog is not None:
                try:
                    eventlog.log_event(
                        "ultrasonic out of range: {} mm".format(int(distance_mm))
                    )
                except Exception:
                    pass
            return -1

        except OSError as exc:
            # This can occur if there's an issue with time_pulse_us or pin configuration
            _ultrasonic_warn_inline("OSError – check pins & power")
            # Only log to eventlog on first few failures to avoid log spam
            if _ultrasonic_fail_count <= 3 and eventlog is not None:
                try:
                    eventlog.log_event("ultrasonic OSError: {}".format(exc))
                except Exception:
                    pass
            return -1


class L298N:
    """
    L298N Motor Driver class for controlling a single motor
    """

    # Direction constants
    FORWARD = 0
    BACKWARD = 1
    STOP = -1

    def __init__(self, pin_enable, pin_direction, pin_brake):
        """
        Initialize L298N motor controller

        Args:
            pin_enable: PWM pin for speed control (0-65535)
            pin_direction: Digital pin for direction control
            pin_brake: Digital pin for brake control
        """
        self._pin_enable = PWM(Pin(pin_enable))
        self._pin_enable.freq(1000)  # 1kHz PWM frequency
        self._pin_direction = Pin(pin_direction, Pin.OUT)
        self._pin_brake = Pin(pin_brake, Pin.OUT)

        self._pwm_val = 65535  # Max speed (16-bit PWM)
        self._is_moving = False
        self._can_move = True
        self._direction = self.STOP

        # Initialize pins to stopped state
        self.stop()

    def set_speed(self, speed):
        """
        Set motor speed

        Args:
            speed: Speed value 0-255 (Arduino compatible) or 0-65535 (full RP2040 range)
        """
        # Convert Arduino 0-255 range to RP2040 0-65535 range if needed
        if speed <= 255:
            self._pwm_val = int(speed * 257)  # 257 = 65535/255
        else:
            self._pwm_val = min(speed, 65535)

            _d("L298N set_speed: raw=", speed, "pwm=", self._pwm_val)

    def get_speed(self):
        """
        Get current motor speed

        Returns:
            Current speed (0 if stopped, otherwise the set PWM value)
        """
        return self._pwm_val if self._is_moving else 0

    def forward(self):
        """Move motor forward"""
        self._pin_brake.off()
        self._pin_direction.on()
        self._pin_enable.duty_u16(self._pwm_val)
        self._direction = self.FORWARD
        self._is_moving = True
        _d("L298N forward: pwm=", self._pwm_val)

    def backward(self):
        """Move motor backward"""
        self._pin_brake.off()
        self._pin_direction.off()
        self._pin_enable.duty_u16(self._pwm_val)
        self._direction = self.BACKWARD
        self._is_moving = True
        _d("L298N backward: pwm=", self._pwm_val)

    def stop(self):
        """Stop motor with brake"""
        self._pin_direction.on()
        self._pin_brake.on()
        self._pin_enable.duty_u16(65535)  # Short motor terminals for brake
        self._direction = self.STOP
        self._is_moving = False
        _d("L298N stop (brake engaged)")

    def is_moving(self):
        """Check if motor is currently moving"""
        return self._is_moving

    def get_direction(self):
        """Get current direction"""
        return self._direction


class AIDriver:
    """
    Unified robot driver class with L298NH motor control and SR-HC04 ultrasonic sensors
    The L298NH requires L298N channels to be called simultaneously.
    """

    def __init__(
        self,
        right_speed_pin=3,  # GP3 (PWM capable)
        left_speed_pin=11,  # GP11 (PWM capable)
        right_dir_pin=12,  # GP12
        right_brake_pin=9,  # GP9
        left_dir_pin=13,  # GP13
        left_brake_pin=8,  # GP8
        trig_pin=6,  # GP6 (front sensor)
        echo_pin=7,  # GP7 (front sensor)
        trig_pin_2=4,  # GP4 (second sensor)
        echo_pin_2=5,  # GP5 (second sensor)
    ):
        """Initialize RP2040 based AIDriver differential drive robot.

        Args:
            right_speed_pin: PWM pin for right motor speed (default GP3)
            left_speed_pin: PWM pin for left motor speed (default GP11)
            right_dir_pin: Digital pin for right motor direction (default GP12)
            right_brake_pin: Digital pin for right motor brake (default GP9)
            left_dir_pin: Digital pin for left motor direction (default GP13)
            left_brake_pin: Digital pin for left motor brake (default GP8)
            trig_pin: Ultrasonic sensor 1 trigger pin (default GP6)
            echo_pin: Ultrasonic sensor 1 echo pin (default GP7)
            trig_pin_2: Ultrasonic sensor 2 trigger pin (default GP4)
            echo_pin_2: Ultrasonic sensor 2 echo pin (default GP5)
        """

        # Library-side preflight: log pin config and attempt a quick sensor ping
        _d(
            "Initialising AIDriver with pins:",
            "R_EN=",
            right_speed_pin,
            "L_EN=",
            left_speed_pin,
            "R_DIR=",
            right_dir_pin,
            "R_BRK=",
            right_brake_pin,
            "L_DIR=",
            left_dir_pin,
            "L_BRK=",
            left_brake_pin,
            "TRIG=",
            trig_pin,
            "ECHO=",
            echo_pin,
            "TRIG_2=",
            trig_pin_2,
            "ECHO_2=",
            echo_pin_2,
        )

        # Initialize motor controllers
        self.motor_right = L298N(right_speed_pin, right_dir_pin, right_brake_pin)
        self.motor_left = L298N(left_speed_pin, left_dir_pin, left_brake_pin)

        # Initialize ultrasonic sensors
        self.ultrasonic_1 = UltrasonicSensor(trig_pin, echo_pin)
        self.ultrasonic_2 = UltrasonicSensor(trig_pin_2, echo_pin_2)

        # Silent hardware sanity ping for sensor 1 (only visible if DEBUG_AIDRIVER is True)
        try:
            d = self.ultrasonic_1.read_distance_mm()
            if d == -1:
                _d(
                    "Ultrasonic 1 preflight: reading -1. Check wiring, aim at object 2–200cm.",
                )
        except Exception as exc:
            _d(
                "Ultrasonic 1 preflight error:",
                type(exc).__name__,
                str(exc),
                "– check TRIG/ECHO pins and sensor power.",
            )

        # Silent hardware sanity ping for sensor 2
        try:
            d = self.ultrasonic_2.read_distance_mm()
            if d == -1:
                _d(
                    "Ultrasonic 2 preflight: reading -1. Check wiring, aim at object 2–200cm.",
                )
        except Exception as exc:
            _d(
                "Ultrasonic 2 preflight error:",
                type(exc).__name__,
                str(exc),
                "– check TRIG_2/ECHO_2 pins and sensor power.",
            )

        _d("AIDriver initialized - debug logging active")

        # Start PWM-based heartbeat - runs entirely in hardware
        # with zero CPU interrupts or impact on motor control.
        _start_pwm_heartbeat()

    def read_distance(self):
        """
        Read distance from ultrasonic sensor 1 (front sensor).

        Returns:
            Distance in millimeters, or -1 if invalid reading.
        """
        distance_mm = self.ultrasonic_1.read_distance_mm()
        if distance_mm == -1:
            # Don't print debug here - inline warning handles user feedback
            return -1
        _d("read_distance:", distance_mm, "mm")
        return int(distance_mm)

    def read_distance_2(self):
        """
        Read distance from ultrasonic sensor 2 (second sensor on GP4/GP5).

        Returns:
            Distance in millimeters, or -1 if invalid reading.
        """
        distance_mm = self.ultrasonic_2.read_distance_mm()
        if distance_mm == -1:
            # Don't print debug here - inline warning handles user feedback
            return -1
        _d("read_distance_2:", distance_mm, "mm")
        return int(distance_mm)

    def brake(self):
        """Stop both motors"""
        _d("AIDriver.brake()")
        if eventlog is not None:
            try:
                eventlog.log_event("Brake applied; motors stopping")
            except Exception:
                pass
        try:
            self.motor_right.stop()
            self.motor_left.stop()
        except Exception as exc:
            _explain_error(exc)
            raise

    def service(self):
        """Run background housekeeping tasks for the robot.

        Currently this just advances the onboard LED heartbeat in a
        non-blocking way when ``self._heartbeat_enabled`` is True. It is
        safe to call frequently from a main loop and is optional for
        simple student programs.
        """

        if not getattr(self, "_heartbeat_enabled", False):
            return

        try:
            heartbeat()
        except Exception as exc:
            _explain_error(exc)

    def drive_forward(self, right_wheel_speed, left_wheel_speed):
        """
        Drive robot forward

        Args:
            right_wheel_speed: Speed for right wheel (0-255)
            left_wheel_speed: Speed for left wheel (0-255)
        """
        _d("AIDriver.drive_forward: R=", right_wheel_speed, "L=", left_wheel_speed)
        if eventlog is not None:
            try:
                eventlog.log_event(
                    _describe_drive(
                        "Drive forward", right_wheel_speed, left_wheel_speed
                    )
                )
            except Exception:
                pass
        try:
            self.motor_right.set_speed(right_wheel_speed)
            self.motor_left.set_speed(left_wheel_speed)
            self.motor_right.backward()
            self.motor_left.forward()
        except Exception as exc:
            _explain_error(exc)
            raise

    def drive_backward(self, right_wheel_speed, left_wheel_speed):
        """
        Drive robot backward

        Args:
            right_wheel_speed: Speed for right wheel (0-255)
            left_wheel_speed: Speed for left wheel (0-255)
        """
        _d("AIDriver.drive_backward: R=", right_wheel_speed, "L=", left_wheel_speed)
        if eventlog is not None:
            try:
                eventlog.log_event(
                    _describe_drive(
                        "Drive backward", right_wheel_speed, left_wheel_speed
                    )
                )
            except Exception:
                pass
        try:
            self.motor_right.set_speed(right_wheel_speed)
            self.motor_left.set_speed(left_wheel_speed)
            self.motor_right.forward()
            self.motor_left.backward()
        except Exception as exc:
            _explain_error(exc)
            raise

    def rotate_right(self, turn_speed):
        """
        Rotate robot right (clockwise)

        Args:
            turn_speed: Speed for rotation (0-255)
        """
        _d("AIDriver.rotate_right: speed=", turn_speed)
        if eventlog is not None:
            try:
                eventlog.log_event(_describe_rotation("right", turn_speed))
            except Exception:
                pass
        try:
            self.motor_right.set_speed(turn_speed)
            self.motor_left.set_speed(turn_speed)
            self.motor_right.forward()
            self.motor_left.forward()
        except Exception as exc:
            _explain_error(exc)
            raise

    def rotate_left(self, turn_speed):
        """
        Rotate robot left (counter-clockwise)

        Args:
            turn_speed: Speed for rotation (0-255)
        """
        _d("AIDriver.rotate_left: speed=", turn_speed)
        if eventlog is not None:
            try:
                eventlog.log_event(_describe_rotation("left", turn_speed))
            except Exception:
                pass
        try:
            self.motor_right.set_speed(turn_speed)
            self.motor_left.set_speed(turn_speed)
            self.motor_right.backward()
            self.motor_left.backward()
        except Exception as exc:
            _explain_error(exc)
            raise

    # Minimum reliable motor speed - motors stutter below this due to undervoltage
    MIN_MOTOR_SPEED = 120

    def drive(self, right_speed, left_speed):
        """
        Drive robot with signed speeds for PID control.

        This is a convenience method for control loops where positive speeds
        mean forward and negative speeds mean backward. It handles the
        direction logic and motor dead zone internally.

        Dead Zone Handling:
            Motors don't work reliably below speed 120. This method applies:
            - If |speed| < MIN_MOTOR_SPEED: that wheel stops (speed too low)
            - If |speed| >= MIN_MOTOR_SPEED: wheel drives at requested speed

        Args:
            right_speed: Speed for right wheel (-255 to 255)
                         Positive = forward, Negative = backward
            left_speed: Speed for left wheel (-255 to 255)
                        Positive = forward, Negative = backward

        Example for PID control::

            # Simple - just call drive with signed speeds
            my_robot.drive(speed, speed)

            # For wall following with differential steering:
            my_robot.drive(BASE_SPEED + correction, BASE_SPEED - correction)
        """
        # Clamp speeds to valid range
        right_speed = max(-255, min(255, int(right_speed)))
        left_speed = max(-255, min(255, int(left_speed)))

        # Apply dead zone: speeds below MIN_MOTOR_SPEED don't work reliably
        if abs(right_speed) < self.MIN_MOTOR_SPEED:
            right_speed = 0
        if abs(left_speed) < self.MIN_MOTOR_SPEED:
            left_speed = 0

        _d("AIDriver.drive: R=", right_speed, "L=", left_speed)

        # If both speeds are zero, brake
        if right_speed == 0 and left_speed == 0:
            self.brake()
            return

        # Handle right motor
        if right_speed > 0:
            self.motor_right.set_speed(right_speed)
            self.motor_right.backward()  # backward() = forward motion for right wheel
        elif right_speed < 0:
            self.motor_right.set_speed(abs(right_speed))
            self.motor_right.forward()   # forward() = backward motion for right wheel
        else:
            self.motor_right.stop()

        # Handle left motor
        if left_speed > 0:
            self.motor_left.set_speed(left_speed)
            self.motor_left.forward()    # forward() = forward motion for left wheel
        elif left_speed < 0:
            self.motor_left.set_speed(abs(left_speed))
            self.motor_left.backward()   # backward() = backward motion for left wheel
        else:
            self.motor_left.stop()

        # Log the movement
        if eventlog is not None:
            try:
                if right_speed >= 0 and left_speed >= 0:
                    direction = "forward"
                elif right_speed <= 0 and left_speed <= 0:
                    direction = "backward"
                else:
                    direction = "mixed"
                eventlog.log_event(
                    "drive {} R={}, L={}".format(direction, right_speed, left_speed)
                )
            except Exception:
                pass

    def set_motor_speeds(self, right_speed, left_speed):
        """
        Set individual motor speeds without changing direction

        Args:
            right_speed: Speed for right motor (0-255)
            left_speed: Speed for left motor (0-255)
        """
        _d("AIDriver.set_motor_speeds: R=", right_speed, "L=", left_speed)
        try:
            self.motor_right.set_speed(right_speed)
            self.motor_left.set_speed(left_speed)
        except Exception as exc:
            _explain_error(exc)
            raise

    def get_motor_speeds(self):
        """
        Get current motor speeds

        Returns:
            Tuple of (right_speed, left_speed)
        """
        speeds = (self.motor_right.get_speed(), self.motor_left.get_speed())
        _d("AIDriver.get_motor_speeds:", speeds)
        return speeds

    def is_moving(self):
        """
        Check if robot is moving

        Returns:
            True if either motor is moving
        """
        moving = self.motor_right.is_moving() or self.motor_left.is_moving()
        _d("AIDriver.is_moving:", moving)
        return moving
