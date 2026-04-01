/**
 * AIDriver Simulator - Python Runner Module
 * Skulpt Python interpreter configuration and execution control
 */

const PythonRunner = {
  // Execution state
  isRunning: false,
  isPaused: false,
  shouldStop: false,
  currentSuspension: null,
  executionId: 0, // Track current execution to ignore stale callbacks

  // Step mode with trace collection
  stepMode: false,
  stepDelay: 750, // Delay between steps in playback (ms)
  stepPaused: false, // Is playback paused?
  stepResumeResolve: null, // Promise resolver for resuming
  sourceCode: "", // Store source code for line display
  sourceLines: [], // Source code split by lines

  // Trace collection for step mode
  executionTrace: [], // Collected trace: [{line, code}, ...]
  traceOutputs: [], // Robot outputs during trace
  currentTraceStep: 0, // Current position in trace playback
  isCollectingTrace: false, // True during trace collection phase
  isPlayingTrace: false, // True during trace playback phase
  maxTraceSteps: 1000, // Limit to prevent infinite loops
  maxTraceTime: 5000, // 5 second timeout for trace collection

  // Execution promise
  executionPromise: null,

  /**
   * Configure the Skulpt runtime with simulator-specific IO handlers and timeouts.
   * Registers MicroPython shims before configuration to ensure imports succeed.
   * @returns {void}
   */
  init() {
    console.log(
      "[PythonRunner] Before Sk.configure - Sk.setTimeout:",
      typeof Sk.setTimeout,
    );

    // Configure Skulpt FIRST, then register modules (configure may reset builtinFiles)
    Sk.configure({
      output: this.handleOutput.bind(this),
      read: this.handleRead.bind(this),
      inputfun: this.handleInput.bind(this),
      inputfunTakesPrompt: true,
      __future__: Sk.python3,
      execLimit: null, // No time limit (we control via shouldStop)
      killableWhile: true,
      killableFor: true,
      // CRITICAL: Provide setTimeout for time.sleep() to work properly
      setTimeout: function (fn, delay) {
        console.log("[Skulpt] setTimeout called with delay:", delay);
        return setTimeout(fn, delay);
      },
    });

    // Register external modules AFTER configure so entries are not lost
    this.registerMicroPythonModules();

    console.log(
      "[PythonRunner] After Sk.configure - Sk.setTimeout:",
      typeof Sk.setTimeout,
    );
    console.log(
      "[PythonRunner] Sk.setTimeout function:",
      Sk.setTimeout ? Sk.setTimeout.toString().substring(0, 100) : "undefined",
    );
    console.log("[PythonRunner] Initialized with MicroPython module mocks");
  },

  /**
   * Register JavaScript-backed modules that emulate the MicroPython environment.
   * Injects the aidriver stub as a JS builtin file so Skulpt's import mechanism
   * finds the .js module before falling through to the .py shim.
   * Must be called AFTER Sk.configure() since configure may reset builtinFiles.
   * @returns {void}
   */
  registerMicroPythonModules() {
    // Initialize builtin files (preserves stdlib entries from skulpt-stdlib.js)
    Sk.builtinFiles = Sk.builtinFiles || { files: {} };

    // Register aidriver as a JS builtin file so Skulpt's .js path search finds it.
    // Skulpt 1.2.0 does NOT have Sk.builtinModules - it only checks builtinFiles.
    // The $builtinmodule function is called by Skulpt with the module dict.
    // We store the factory on a global so the eval'd string can reference it.
    window.__aidriverModuleFactory = AIDriverStub.getModule();
    Sk.builtinFiles["files"]["src/lib/aidriver.js"] =
      "var $builtinmodule = function() { return window.__aidriverModuleFactory('aidriver'); };";

    console.log(
      "[PythonRunner] Registered aidriver JS builtin module in builtinFiles",
    );
  },

  /**
   * Generate the Python shim for the aidriver module consumed by user code.
   * Embeds optional tracing utilities when collecting execution traces.
   * @param {boolean} [forTraceCollection=false] Toggle trace-enhanced implementation.
   * @returns {string} Python source string defining the aidriver module.
   */
  getAIDriverPythonModule(forTraceCollection = false) {
    // Get speed multiplier from App (default to 1)
    const speedMult =
      typeof App !== "undefined" && App.speedMultiplier
        ? App.speedMultiplier
        : 1;
    const maxSteps = this.maxTraceSteps;

    // During trace collection, skip delays. During normal run, no step debug.
    const stepDebugCode = forTraceCollection
      ? `
# Trace collection mode - collect execution trace with commands, no delays
_trace = []
_max_steps = ${maxSteps}
_pending_commands = []  # Commands issued since last step

def _step_debug(line_num, line_code):
    """Collect trace entry with any pending commands"""
    global _trace, _pending_commands, _command_queue
    if len(_trace) >= _max_steps:
        raise Exception("MAX_STEPS_EXCEEDED: Trace limit reached")
    # Capture any commands that were queued and add to trace
    cmds = _command_queue[:]
    _command_queue = []
    _trace.append({
        "line": line_num,
        "code": line_code,
        "commands": cmds
    })

def _get_trace():
    global _trace, _command_queue
    # Capture any final commands
    if len(_command_queue) > 0:
        _trace.append({
            "line": 0,
            "code": "[final commands]",
            "commands": _command_queue[:]
        })
        _command_queue = []
    return _trace

def _clear_trace():
    global _trace
    _trace = []
`
      : `
# Normal run mode - step debug just prints marker
def _step_debug(line_num, line_code):
    print("__STEP_DEBUG__:" + str(line_num) + ":" + line_code)

def _get_trace():
    return []

def _clear_trace():
    pass
`;

    return `
# AIDriver module for browser simulator
# This is a Python implementation that works with Skulpt

DEBUG_AIDRIVER = False
_SPEED_MULTIPLIER = ${speedMult}

# Command queue - will be read by JavaScript
_command_queue = []

import time

${stepDebugCode}

def _queue_command(cmd_type, params=None):
    """Queue a command for the JavaScript simulator"""
    global _command_queue
    if params is None:
        params = {}
    _command_queue.append({"type": cmd_type, "params": params})

def _get_commands():
    """Get all queued commands and clear the queue"""
    global _command_queue
    cmds = _command_queue[:]
    _command_queue = []
    return cmds

class AIDriver:
    """AIDriver robot controller for the simulator"""
    
    def __init__(self):
        """Initialize the robot"""
        global DEBUG_AIDRIVER
        self._right_speed = 0
        self._left_speed = 0
        self._is_moving = False
        _queue_command("init")
        if DEBUG_AIDRIVER:
            print("[AIDriver] Robot initialized")
    
    def drive_forward(self, right_speed, left_speed):
        """Drive the robot forward with specified wheel speeds"""
        global DEBUG_AIDRIVER
        self._right_speed = int(right_speed)
        self._left_speed = int(left_speed)
        self._is_moving = True
        _queue_command("drive_forward", {
            "rightSpeed": self._right_speed,
            "leftSpeed": self._left_speed
        })
        if DEBUG_AIDRIVER:
            print("[AIDriver] drive_forward:", right_speed, left_speed)
    
    def drive_backward(self, right_speed, left_speed):
        """Drive the robot backward with specified wheel speeds"""
        global DEBUG_AIDRIVER
        self._right_speed = int(right_speed)
        self._left_speed = int(left_speed)
        self._is_moving = True
        _queue_command("drive_backward", {
            "rightSpeed": self._right_speed,
            "leftSpeed": self._left_speed
        })
        if DEBUG_AIDRIVER:
            print("[AIDriver] drive_backward:", right_speed, left_speed)
    
    def rotate_left(self, turn_speed):
        """Rotate the robot left"""
        global DEBUG_AIDRIVER
        self._is_moving = True
        _queue_command("rotate_left", {"turnSpeed": int(turn_speed)})
        if DEBUG_AIDRIVER:
            print("[AIDriver] rotate_left:", turn_speed)
    
    def rotate_right(self, turn_speed):
        """Rotate the robot right"""
        global DEBUG_AIDRIVER
        self._is_moving = True
        _queue_command("rotate_right", {"turnSpeed": int(turn_speed)})
        if DEBUG_AIDRIVER:
            print("[AIDriver] rotate_right:", turn_speed)
    
    def brake(self):
        """Stop the robot"""
        global DEBUG_AIDRIVER
        self._right_speed = 0
        self._left_speed = 0
        self._is_moving = False
        _queue_command("brake")
        if DEBUG_AIDRIVER:
            print("[AIDriver] brake")
    
    def read_distance(self):
        """Read front ultrasonic sensor distance in mm"""
        global DEBUG_AIDRIVER
        # This will be overridden by JavaScript
        _queue_command("read_distance")
        distance_mm = 1000  # Placeholder, JS overrides actual value
        if DEBUG_AIDRIVER:
            print("[AIDriver] read_distance:", distance_mm, "mm")
        return distance_mm
    
    def read_distance_2(self):
        """Read side ultrasonic sensor distance in mm"""
        global DEBUG_AIDRIVER
        # This will be overridden by JavaScript
        _queue_command("read_distance_2")
        distance_mm = 1000  # Placeholder, JS overrides actual value
        if DEBUG_AIDRIVER:
            print("[AIDriver] read_distance_2:", distance_mm, "mm")
        return distance_mm
    
    # Minimum reliable motor speed - motors stutter below this due to undervoltage
    MIN_MOTOR_SPEED = 120

    def drive(self, right_speed, left_speed):
        """Drive robot with signed speeds for PID control.

        Positive = forward, negative = backward.
        Speeds with magnitude below MIN_MOTOR_SPEED are treated as zero.

        Args:
            right_speed: -255 to 255
            left_speed:  -255 to 255
        """
        global DEBUG_AIDRIVER
        right_speed = max(-255, min(255, int(right_speed)))
        left_speed  = max(-255, min(255, int(left_speed)))
        if abs(right_speed) < self.MIN_MOTOR_SPEED:
            right_speed = 0
        if abs(left_speed) < self.MIN_MOTOR_SPEED:
            left_speed = 0
        if right_speed == 0 and left_speed == 0:
            self.brake()
            return
        self._right_speed = right_speed
        self._left_speed = left_speed
        self._is_moving = True
        _queue_command("drive", {
            "rightSpeed": right_speed,
            "leftSpeed": left_speed
        })
        if DEBUG_AIDRIVER:
            print("[AIDriver] drive:", right_speed, left_speed)

    def service(self):
        """Run background housekeeping tasks (no-op in simulator)"""
        # In real robot this handles LED heartbeat
        # In simulator we don't need it but provide for API compatibility
        pass
    
    def set_motor_speeds(self, right_speed, left_speed):
        """Set motor speeds directly"""
        global DEBUG_AIDRIVER
        self._right_speed = int(right_speed)
        self._left_speed = int(left_speed)
        if right_speed != 0 or left_speed != 0:
            self._is_moving = True
        else:
            self._is_moving = False
        _queue_command("set_motor_speeds", {
            "rightSpeed": self._right_speed,
            "leftSpeed": self._left_speed
        })
        if DEBUG_AIDRIVER:
            print("[AIDriver] set_motor_speeds:", right_speed, left_speed)
    
    def is_moving(self):
        """Check if robot is moving"""
        return self._is_moving
    
    def get_motor_speeds(self):
        """Get current motor speeds as tuple (right, left)"""
        return (self._right_speed, self._left_speed)


def hold_state(seconds):
    """Hold the current state for specified seconds (adjusted by speed multiplier)"""
    global DEBUG_AIDRIVER
    import time
    print("[Python] hold_state called with seconds:", seconds)
    if DEBUG_AIDRIVER:
        print("[AIDriver] hold_state:", seconds, "seconds")
    _queue_command("hold_state", {"seconds": float(seconds)})
    # Divide sleep time by speed multiplier so faster speeds = shorter real time
    actual_sleep = float(seconds) / _SPEED_MULTIPLIER
    print("[Python] calling time.sleep with actual_sleep:", actual_sleep)
    time.sleep(actual_sleep)
    print("[Python] time.sleep returned for hold_state:", seconds)
`;
  },

  /**
   * Provide a Skulpt module factory emulating MicroPython's machine module.
   * Includes basic Pin, PWM, and Timer mocks used by learner scripts.
   * @returns {(name:string)=>object|undefined} Module factory consumed by Skulpt.
   */
  getMachineModule() {
    return function (name) {
      if (name !== "machine") return undefined;

      const mod = {};

      // Pin class mock
      mod.Pin = Sk.misceval.buildClass(
        mod,
        function ($gbl, $loc) {
          $loc.__init__ = new Sk.builtin.func(function (self, pin, mode) {
            self.pin = Sk.ffi.remapToJs(pin);
            self.mode = mode ? Sk.ffi.remapToJs(mode) : 0;
            self.value_ = 0;
            return Sk.builtin.none.none$;
          });

          $loc.on = new Sk.builtin.func(function (self) {
            self.value_ = 1;
            return Sk.builtin.none.none$;
          });

          $loc.off = new Sk.builtin.func(function (self) {
            self.value_ = 0;
            return Sk.builtin.none.none$;
          });

          $loc.value = new Sk.builtin.func(function (self, val) {
            if (val !== undefined) {
              self.value_ = Sk.ffi.remapToJs(val);
              return Sk.builtin.none.none$;
            }
            return new Sk.builtin.int_(self.value_);
          });

          $loc.toggle = new Sk.builtin.func(function (self) {
            self.value_ = self.value_ ? 0 : 1;
            return Sk.builtin.none.none$;
          });
        },
        "Pin",
        [],
      );

      // Pin constants
      mod.Pin.OUT = new Sk.builtin.int_(1);
      mod.Pin.IN = new Sk.builtin.int_(0);
      mod.Pin.PULL_UP = new Sk.builtin.int_(1);
      mod.Pin.PULL_DOWN = new Sk.builtin.int_(2);

      // PWM class mock
      mod.PWM = Sk.misceval.buildClass(
        mod,
        function ($gbl, $loc) {
          $loc.__init__ = new Sk.builtin.func(function (self, pin) {
            self.freq_ = 1000;
            self.duty_ = 0;
            return Sk.builtin.none.none$;
          });

          $loc.freq = new Sk.builtin.func(function (self, f) {
            if (f !== undefined) {
              self.freq_ = Sk.ffi.remapToJs(f);
            }
            return new Sk.builtin.int_(self.freq_);
          });

          $loc.duty_u16 = new Sk.builtin.func(function (self, d) {
            if (d !== undefined) {
              self.duty_ = Sk.ffi.remapToJs(d);
            }
            return new Sk.builtin.int_(self.duty_);
          });
        },
        "PWM",
        [],
      );

      // Timer class mock
      mod.Timer = Sk.misceval.buildClass(
        mod,
        function ($gbl, $loc) {
          $loc.__init__ = new Sk.builtin.func(function (self, id) {
            return Sk.builtin.none.none$;
          });

          $loc.init = new Sk.builtin.func(function (self, kwargs) {
            // Timer callbacks are not supported in browser
            return Sk.builtin.none.none$;
          });

          $loc.deinit = new Sk.builtin.func(function (self) {
            return Sk.builtin.none.none$;
          });
        },
        "Timer",
        [],
      );

      mod.Timer.PERIODIC = new Sk.builtin.int_(1);
      mod.Timer.ONE_SHOT = new Sk.builtin.int_(0);

      // time_pulse_us mock - returns simulated pulse duration
      mod.time_pulse_us = new Sk.builtin.func(function (pin, level, timeout) {
        // Return a simulated pulse based on robot's distance to wall
        let distance = 1000; // default 1 meter
        if (
          typeof Simulator !== "undefined" &&
          typeof App !== "undefined" &&
          App.robot
        ) {
          distance = Simulator.simulateUltrasonic(App.robot);
        }
        // Convert distance to pulse duration (microseconds)
        // distance = (duration * 0.343) / 2, so duration = distance * 2 / 0.343
        const duration = Math.round((distance * 2) / 0.343);
        return new Sk.builtin.int_(duration);
      });

      return mod;
    };
  },

  /**
   * Inject MicroPython-specific time helpers into Skulpt's builtin filesystem.
   * Provides ticks_* and sleep_* functions expected by learner code.
   * @returns {void}
   */
  extendTimeModule() {
    // We'll add these via builtinFiles as Python code that works with Skulpt
    const timeExtensions = `
# MicroPython time module extensions for browser simulation
import time as _time

def sleep_ms(ms):
    """Sleep for given number of milliseconds"""
    _time.sleep(ms / 1000.0)

def sleep_us(us):
    """Sleep for given number of microseconds"""
    _time.sleep(us / 1000000.0)

_start_ticks = 0

def ticks_ms():
    """Return increasing millisecond counter"""
    return int(_time.time() * 1000) & 0x3FFFFFFF

def ticks_us():
    """Return increasing microsecond counter"""
    return int(_time.time() * 1000000) & 0x3FFFFFFF

def ticks_diff(t1, t2):
    """Return difference between two ticks values"""
    diff = t1 - t2
    if diff < -0x20000000:
        diff += 0x40000000
    elif diff > 0x1FFFFFFF:
        diff -= 0x40000000
    return diff
`;

    // Register as a module that can be imported
    Sk.builtinFiles = Sk.builtinFiles || { files: {} };
    Sk.builtinFiles["files"]["src/lib/micropython_time.py"] = timeExtensions;
  },

  /**
   * Route Skulpt stdout to the debug panel while filtering step debug markers.
   * @param {string} text Output emitted by Skulpt.
   * @returns {void}
   */
  handleOutput(text) {
    const trimmed = text.trimEnd();

    // Check for step debug marker
    if (trimmed.startsWith("__STEP_DEBUG__:")) {
      const parts = trimmed.substring(15).split(":");
      const lineNum = parts[0];
      const lineCode = parts.slice(1).join(":"); // Rejoin in case line has colons

      if (typeof DebugPanel !== "undefined") {
        DebugPanel.info(`Step mode - ${lineNum} ${lineCode}`);
      }
      return; // Don't log the raw debug message
    }

    // Normal output
    if (typeof DebugPanel !== "undefined") {
      DebugPanel.log(trimmed, "output");
    } else {
      console.log("[Python]", text);
    }
  },

  /**
   * Resolve module imports originating from learner code.
   * @param {string} filename Path of the requested module.
   * @returns {string} Module source contents.
   */
  handleRead(filename) {
    console.log("[PythonRunner] handleRead called for:", filename);

    // Handle aidriver module - return the Python module
    if (
      filename === "src/lib/aidriver.py" ||
      filename === "./aidriver.py" ||
      filename === "aidriver.py" ||
      filename === "src/lib/aidriver/__init__.py"
    ) {
      console.log(
        "[PythonRunner] *** RETURNING PYTHON MODULE for aidriver ***",
      );
      console.log(
        "[PythonRunner] This uses time.sleep() - not the JS builtin module!",
      );
      return this.getAIDriverPythonModule();
    }

    // Check builtin files
    if (Sk.builtinFiles && Sk.builtinFiles["files"][filename]) {
      console.log("[PythonRunner] Returning builtin file:", filename);
      return Sk.builtinFiles["files"][filename];
    }

    throw new Sk.builtin.ImportError("No module named " + filename);
  },

  /**
   * Reject input() usage because interactive stdin is unsupported in the browser environment.
   * @param {string} prompt Prompt text supplied by Skulpt.
   * @throws {Error} Always throws to halt execution.
   */
  handleInput(prompt) {
    if (typeof DebugPanel !== "undefined") {
      DebugPanel.log(
        "[Error] input() is not supported in the simulator",
        "error",
      );
    }
    throw new Error("input() is not supported in the simulator");
  },

  /**
   * Execute learner code inside Skulpt with pre-run validation, simulator
   * wiring, and cooperative scheduling hooks. Manages shouldStop signalling,
   * command queue flushing, and DebugPanel output for the duration of the run.
   *
   * @param {string} code Python source code to execute.
   * @returns {Promise<void>} Resolves when execution finishes; rejects only for pre-run validation errors.
   */
  async run(code) {
    if (this.isRunning) {
      console.warn("[PythonRunner] Already running");
      return;
    }

    // Store source code for line display
    this.sourceCode = code;
    this.sourceLines = code.split("\n");

    // Validate code first
    if (typeof Validator !== "undefined") {
      const validation = Validator.validate(code);
      if (!validation.valid) {
        if (typeof DebugPanel !== "undefined") {
          DebugPanel.error(
            "Code has errors that must be fixed before running:",
          );
          for (const error of validation.errors) {
            DebugPanel.error(`  Line ${error.line}: ${error.message}`);
          }
        }
        throw new Error("Validation failed - fix errors before running");
      }
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.executionId++; // Increment to invalidate stale callbacks

    // Clear command queue
    AIDriverStub.clearQueue();

    // Set DEBUG_AIDRIVER based on code
    AIDriverStub.DEBUG_AIDRIVER = code.includes("DEBUG_AIDRIVER = True");

    if (typeof DebugPanel !== "undefined") {
      DebugPanel.log("[Python] Starting execution...", "info");
    }

    try {
      // Store reference to this for callbacks
      const self = this;

      console.log(
        "[PythonRunner] run() - Before Sk.configure, Sk.setTimeout:",
        typeof Sk.setTimeout,
      );

      // Configure Skulpt FIRST, then re-register modules
      Sk.configure({
        output: this.handleOutput.bind(this),
        read: this.handleRead.bind(this),
        yieldLimit: 100, // Yield every 100 ops to prevent blocking
        execLimit: Number.MAX_SAFE_INTEGER,
        killableFor: true,
        killableWhile: true,
        __future__: Sk.python3,
        // CRITICAL: Provide setTimeout for time.sleep() to work
        setTimeout: function (fn, delay) {
          console.log(
            "[Skulpt run()] setTimeout called with delay:",
            delay,
            "ms",
          );
          return setTimeout(fn, delay);
        },
      });

      // Re-register external modules AFTER configure (configure may reset builtinFiles)
      this.registerMicroPythonModules();

      console.log(
        "[PythonRunner] run() - After Sk.configure, Sk.setTimeout:",
        typeof Sk.setTimeout,
      );
      console.log(
        "[PythonRunner] run() - Sk.setTimeout:",
        Sk.setTimeout ? Sk.setTimeout.toString().substring(0, 80) : "undefined",
      );

      // Compile and run
      const promise = Sk.misceval.asyncToPromise(
        () => Sk.importMainWithBody("<stdin>", false, code, true),
        {
          // Handle time.sleep promises with pause support
          "Sk.promise": function (susp) {
            console.log(
              "[PythonRunner] Sk.promise handler called, susp.data:",
              susp.data,
            );
            console.log("[PythonRunner] susp.data.promise:", susp.data.promise);

            if (self.shouldStop) {
              const err = new Error("Execution stopped");
              err.isStopExecution = true;
              throw err;
            }

            // Process any queued commands BEFORE the sleep starts
            self.processCommandQueue();

            // If paused in step mode, wait for resume
            if (self.stepMode && self.stepPaused) {
              return new Promise((resolve, reject) => {
                self.stepResumeResolve = () => {
                  // After resume, continue with original promise then call resume()
                  susp.data.promise
                    .then((result) => {
                      susp.data.result = result;
                      try {
                        resolve(susp.resume());
                      } catch (e) {
                        reject(e);
                      }
                    })
                    .catch(reject);
                };
              });
            }

            // Return a promise that waits for the sleep, then calls resume()
            // to continue Python execution. This is critical - per Skulpt docs:
            // "A suspension handler should return a Promise yielding the
            // return value of susp.resume()"
            console.log(
              "[PythonRunner] Returning promise from Sk.promise handler",
            );
            return susp.data.promise.then((result) => {
              console.log(
                "[PythonRunner] Sleep promise resolved with:",
                result,
              );
              // CRITICAL: Set the result and call resume() to continue Python
              susp.data.result = result;
              console.log(
                "[PythonRunner] Calling susp.resume() to continue Python execution",
              );
              return susp.resume();
            });
          },
          "*": function () {
            // Check if we should stop
            if (self.shouldStop) {
              const err = new Error("Execution stopped");
              err.isStopExecution = true;
              throw err;
            }
            // Process commands on each yield
            self.processCommandQueue();

            // Trigger render if robot is moving
            if (typeof App !== "undefined" && App.robot && App.robot.isMoving) {
              if (typeof render === "function") {
                render();
              }
            }
          },
        },
      );

      this.executionPromise = promise;
      await promise;

      console.log(
        "[PythonRunner] Execution promise resolved successfully - this is unexpected for infinite loops!",
      );

      if (typeof DebugPanel !== "undefined") {
        DebugPanel.log("[Python] Execution completed", "success");
      }
    } catch (error) {
      console.log("[PythonRunner] Execution threw error:", error);
      this.handleError(error);
    } finally {
      console.log("[PythonRunner] Stopped (finally block)");
      this.isRunning = false;
      this.stepMode = false;
      this.executionPromise = null;
    }
  },

  /**
   * Instrument learner code by inserting _step_debug markers ahead of executable lines.
   * @param {string} code Original Python source.
   * @returns {string} Transformed source with debug hooks.
   */
  injectDebugCalls(code) {
    const lines = code.split("\n");
    const result = [];

    // Add imports at the very beginning (includes _get_trace for trace collection)
    result.push("from aidriver import _step_debug, _get_trace");
    result.push("");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      // Skip empty lines and pure comments
      if (trimmed === "" || trimmed.startsWith("#")) {
        result.push(line);
        continue;
      }

      // Skip import statements (already processed by the added import)
      if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) {
        result.push(line);
        continue;
      }

      // Skip structural keywords that can't have code before them
      if (
        trimmed.startsWith("else:") ||
        trimmed.startsWith("elif ") ||
        trimmed.startsWith("except") ||
        trimmed.startsWith("finally:")
      ) {
        result.push(line);
        continue;
      }

      // Get indentation
      const indent = line.match(/^(\s*)/)[1];

      // Escape the line code for Python string
      const escapedLine = trimmed
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/'/g, "\\'");

      // Add debug call before the line (same indentation)
      result.push(`${indent}_step_debug(${lineNum}, "${escapedLine}")`);
      result.push(line);
    }

    return result.join("\n");
  },

  /**
   * Execute code through trace collection and controlled playback phases for
   * step mode. Resets trace state, captures a deterministic execution log, and
   * then replays it with UI highlights so the learner can step through their
   * program without re-running Python code.
   *
   * @param {string} code Learner Python source.
   * @returns {Promise<void>} Resolves after playback finishes or the run is cancelled.
   */
  async runStepMode(code) {
    this.sourceCode = code;
    this.sourceLines = code.split("\n");
    this.stepMode = true;
    this.stepPaused = false;
    this.shouldStop = false;
    this.executionTrace = [];
    this.traceOutputs = [];
    this.currentTraceStep = 0;

    // Phase 1: Collect execution trace
    if (typeof DebugPanel !== "undefined") {
      DebugPanel.info("Collecting execution trace...");
    }

    const traceCollected = await this.collectTrace(code);

    if (!traceCollected || this.shouldStop) {
      return;
    }

    if (typeof DebugPanel !== "undefined") {
      DebugPanel.info(`Trace collected: ${this.executionTrace.length} steps`);
      DebugPanel.info("Starting step-by-step playback...");
    }

    // Phase 2: Play back the trace with delays
    await this.playTrace();
  },

  /**
   * Collect an execution trace by running the program without delays. Swaps in
   * a tracing variant of the aidriver module so each Python line emits command
   * metadata, making it possible to replay the run deterministically.
   *
   * @param {string} code Learner Python source.
   * @returns {Promise<boolean>} Resolves true when a trace (even partial) is gathered, false on fatal errors.
   */
  async collectTrace(code) {
    this.isCollectingTrace = true;
    this.executionTrace = [];
    this.traceOutputs = [];

    // Get the trace collection version of the module
    const traceModule = this.getAIDriverPythonModule(true);

    // Temporarily remove the JS module so Skulpt falls through to the Python trace module
    Sk.builtinFiles = Sk.builtinFiles || { files: {} };
    const savedJsModule = Sk.builtinFiles["files"]["src/lib/aidriver.js"];
    delete Sk.builtinFiles["files"]["src/lib/aidriver.js"];
    Sk.builtinFiles["files"]["src/lib/aidriver.py"] = traceModule;

    // Clear any cached aidriver module to force reimport with trace version
    if (Sk.sysmodules && Sk.sysmodules.mp$ass_subscript) {
      try {
        Sk.sysmodules.mp$del_subscript(new Sk.builtin.str("aidriver"));
      } catch (e) {
        // Ignore if not found
      }
    }

    // Custom read function for trace collection
    const self = this;
    const traceRead = function (filename) {
      if (
        filename === "src/lib/aidriver.py" ||
        filename === "./aidriver.py" ||
        filename === "aidriver.py" ||
        filename === "src/lib/aidriver/__init__.py"
      ) {
        return traceModule;
      }
      if (Sk.builtinFiles && Sk.builtinFiles["files"][filename]) {
        return Sk.builtinFiles["files"][filename];
      }
      throw new Sk.builtin.ImportError("No module named " + filename);
    };

    // Reconfigure Skulpt with timeout for infinite loop protection
    Sk.configure({
      output: (text) => {
        const trimmed = text.trimEnd();
        if (trimmed) {
          this.traceOutputs.push(trimmed);
        }
      },
      read: traceRead,
      inputfunTakesPrompt: true,
      __future__: Sk.python3,
      execLimit: this.maxTraceTime, // Timeout for infinite loops
      killableWhile: true,
      killableFor: true,
      // CRITICAL: Provide setTimeout for time.sleep() to work
      setTimeout: function (fn, delay) {
        return setTimeout(fn, delay);
      },
    });

    // Inject debug calls and add trace retrieval
    const instrumentedCode =
      this.injectDebugCalls(code) + "\n_final_trace = _get_trace()";
    console.log("[PythonRunner] Trace collection code:", instrumentedCode);

    try {
      const module = await Sk.misceval.asyncToPromise(() =>
        Sk.importMainWithBody("<stdin>", false, instrumentedCode, true),
      );

      // Get the trace from Python - now includes commands
      const traceVar = module.$d._final_trace;
      console.log("[PythonRunner] traceVar:", traceVar);
      if (traceVar) {
        const traceList = Sk.ffi.remapToJs(traceVar);
        console.log("[PythonRunner] traceList from Python:", traceList);
        this.executionTrace = traceList.map((item) => {
          // New format: {line, code, commands}
          return {
            line: item.line || 0,
            code: item.code || "",
            commands: item.commands || [],
          };
        });
        console.log(
          "[PythonRunner] executionTrace after mapping:",
          this.executionTrace,
        );
      }

      this.isCollectingTrace = false;
      return true;
    } catch (error) {
      this.isCollectingTrace = false;
      const errStr = error.toString();

      if (errStr.includes("MAX_STEPS_EXCEEDED")) {
        if (typeof DebugPanel !== "undefined") {
          DebugPanel.warn(
            `Trace limit reached (${this.maxTraceSteps} steps) - possible infinite loop`,
          );
          DebugPanel.info("Partial trace will be played back");
        }
        return true; // Still play back what we collected
      } else if (
        errStr.includes("time limit") ||
        errStr.includes("TimeLimitError")
      ) {
        if (typeof DebugPanel !== "undefined") {
          DebugPanel.error(
            `Execution timeout (${
              this.maxTraceTime / 1000
            }s) - infinite loop detected`,
          );
        }
        return false;
      } else {
        if (typeof DebugPanel !== "undefined") {
          DebugPanel.error("Error during trace collection: " + errStr);
        }
        console.error("[PythonRunner] Trace collection error:", error);
        return false;
      }
    } finally {
      // Restore the JS module registration for normal run mode
      if (savedJsModule) {
        Sk.builtinFiles["files"]["src/lib/aidriver.js"] = savedJsModule;
      }
      delete Sk.builtinFiles["files"]["src/lib/aidriver.py"];
    }
  },

  /**
   * Phase 2: Replay the collected execution trace, highlighting source lines and
   * dispatching any queued robot commands for each step. The trace is generated
   * by collectTrace() and is played back sequentially until exhausted, paused,
   * or forcibly stopped.
   *
   * @returns {Promise<void>} Resolves after playback completes, pauses, or a stop request occurs.
   */
  async playTrace() {
    this.isPlayingTrace = true;
    this.currentTraceStep = 0;

    console.log(
      "[PythonRunner] playTrace starting with",
      this.executionTrace.length,
      "steps",
    );

    while (
      this.currentTraceStep < this.executionTrace.length &&
      !this.shouldStop
    ) {
      console.log(
        "[PythonRunner] Loop iteration:",
        this.currentTraceStep,
        "shouldStop:",
        this.shouldStop,
        "stepPaused:",
        this.stepPaused,
      );

      // Check for pause
      while (this.stepPaused && !this.shouldStop) {
        await new Promise((resolve) => {
          this.stepResumeResolve = resolve;
        });
      }

      if (this.shouldStop) break;

      const step = this.executionTrace[this.currentTraceStep];

      // Skip the "[final commands]" step for display
      if (step.line > 0) {
        // Highlight the line in the editor
        if (typeof Editor !== "undefined" && Editor.highlightLine) {
          Editor.highlightLine(step.line);
        }

        // Display the step in debug panel
        if (typeof DebugPanel !== "undefined") {
          DebugPanel.info(`Step mode - ${step.line} ${step.code}`);
        }
      }

      // Execute any robot commands from this step
      if (step.commands && step.commands.length > 0) {
        for (const cmd of step.commands) {
          this.executeRobotCommand(cmd);
        }
        // Trigger a render to show robot movement
        if (typeof render === "function") {
          render();
        }
      }

      this.currentTraceStep++;

      // Wait before next step
      console.log(
        "[PythonRunner] Waiting",
        this.stepDelay,
        "ms before next step",
      );
      await new Promise((resolve) => setTimeout(resolve, this.stepDelay));
      console.log("[PythonRunner] Delay complete, continuing");
    }

    // Clear line highlight
    if (typeof Editor !== "undefined" && Editor.clearHighlight) {
      Editor.clearHighlight();
    }

    // Show any robot outputs that were collected (filter out step debug messages)
    const filteredOutputs = this.traceOutputs.filter(
      (output) => !output.startsWith("__STEP_DEBUG__:"),
    );
    if (filteredOutputs.length > 0 && typeof DebugPanel !== "undefined") {
      DebugPanel.info("--- Robot outputs ---");
      filteredOutputs.forEach((output) => {
        DebugPanel.log(output, "output");
      });
    }

    this.isPlayingTrace = false;

    if (this.currentTraceStep >= this.executionTrace.length) {
      if (typeof DebugPanel !== "undefined") {
        DebugPanel.success("Step mode playback completed");
      }
    }
  },

  /**
   * Pause step mode playback. Playback remains idle until resumeStep() is
   * invoked or stop() aborts execution.
   */
  pauseStep() {
    this.stepPaused = true;
    if (typeof DebugPanel !== "undefined") {
      DebugPanel.info(
        `Paused at step ${this.currentTraceStep} of ${this.executionTrace.length}`,
      );
    }
  },

  /**
   * Resume step mode playback if previously paused. Resolves any outstanding
   * promise created while waiting in playTrace().
   */
  resumeStep() {
    this.stepPaused = false;
    if (this.stepResumeResolve) {
      this.stepResumeResolve();
      this.stepResumeResolve = null;
    }
    if (typeof DebugPanel !== "undefined") {
      DebugPanel.info("Step mode resumed");
    }
  },

  /**
   * Execute a single robot command emitted by the Python aidriver module during
   * trace playback. Updates the simulator robot state immediately and triggers a
   * render to show the new pose.
   *
   * @param {{type: string, params: object}} cmd Command describing the robot action to perform.
   */
  executeRobotCommand(cmd) {
    if (typeof App === "undefined" || !App.robot) {
      console.log("[PythonRunner] Cannot execute command - no App.robot");
      return;
    }

    console.log("[PythonRunner] Step executing command:", cmd.type, cmd.params);

    switch (cmd.type) {
      case "drive_forward":
        App.robot.leftSpeed = cmd.params.leftSpeed;
        App.robot.rightSpeed = cmd.params.rightSpeed;
        App.robot.isMoving = true;
        break;

      case "drive_backward":
        App.robot.leftSpeed = -cmd.params.leftSpeed;
        App.robot.rightSpeed = -cmd.params.rightSpeed;
        App.robot.isMoving = true;
        break;

      case "rotate_left":
        // Left wheel forward, right wheel backward → counter-clockwise
        App.robot.leftSpeed = cmd.params.turnSpeed;
        App.robot.rightSpeed = -cmd.params.turnSpeed;
        App.robot.isMoving = true;
        break;

      case "rotate_right":
        // Left wheel backward, right wheel forward → clockwise
        App.robot.leftSpeed = -cmd.params.turnSpeed;
        App.robot.rightSpeed = cmd.params.turnSpeed;
        App.robot.isMoving = true;
        break;

      case "brake":
        App.robot.leftSpeed = 0;
        App.robot.rightSpeed = 0;
        App.robot.isMoving = false;
        break;

      case "init":
        // Robot initialized
        break;

      case "hold_state":
        // Hold current state - physics handled by startAnimationLoop()
        break;

      case "drive":
        // Signed-speed PID method: positive = forward, negative = backward
        App.robot.leftSpeed = cmd.params.leftSpeed;
        App.robot.rightSpeed = cmd.params.rightSpeed;
        App.robot.isMoving = true;
        break;

      case "read_distance":
      case "read_distance_2":
        // Sensor reads are handled inline by the stub; no state change needed
        break;

      default:
        console.log("[PythonRunner] Unknown command type:", cmd.type);
    }

    // Note: Physics updates are handled by startAnimationLoop() which calls Simulator.step()
    // Just trigger a render to show the updated state
    if (typeof render === "function") {
      render();
    }
  },

  /**
   * Lookup source text for a given 1-based line number previously supplied by
   * Skulpt during trace playback or error reporting.
   *
   * @param {number} lineNum Line number to inspect. Values outside the source range are tolerated.
   * @returns {{lineNum: number, lineCode: string}} Canonicalised line metadata with trimmed source text.
   */
  getLineInfo(lineNum) {
    if (lineNum > 0 && lineNum <= this.sourceLines.length) {
      return {
        lineNum: lineNum,
        lineCode: this.sourceLines[lineNum - 1].trim(),
      };
    }
    return { lineNum: lineNum, lineCode: "" };
  },

  /**
   * Stop execution, clearing simulator state, pending commands, and any
   * outstanding trace playback promises. Safe to call repeatedly.
   */
  stop() {
    console.log("[PythonRunner] stop() called - stack trace:");
    console.trace();

    this.shouldStop = true;
    this.isRunning = false;
    this.stepMode = false;
    this.stepPaused = false;
    this.isCollectingTrace = false;
    this.isPlayingTrace = false;
    if (this.stepResumeResolve) {
      this.stepResumeResolve();
      this.stepResumeResolve = null;
    }

    // Clear command queue
    AIDriverStub.clearQueue();

    // Stop the robot
    if (typeof App !== "undefined" && App.robot) {
      App.robot.leftSpeed = 0;
      App.robot.rightSpeed = 0;
      App.robot.isMoving = false;
    }

    if (typeof DebugPanel !== "undefined") {
      DebugPanel.log("[Python] Execution stopped", "warning");
    }

    console.log("[PythonRunner] Stopped");
  },

  /**
   * Drain and execute robot commands produced by the Python aidriver module.
   * Commands are fetched from both the active Skulpt module and the legacy
   * AIDriverStub queue to maintain backwards compatibility.
   */
  processCommandQueue() {
    // Try to get commands from Python's aidriver module
    let commands = [];

    try {
      // Access the aidriver module if it's been imported
      if (Sk.sysmodules && Sk.sysmodules.mp$subscript) {
        const aidriverMod = Sk.sysmodules.mp$subscript(
          new Sk.builtin.str("aidriver"),
        );
        if (aidriverMod) {
          // Call _get_commands() to retrieve and clear the queue
          const getCommandsFunc = aidriverMod.tp$getattr(
            new Sk.builtin.str("_get_commands"),
          );
          if (getCommandsFunc) {
            const result = Sk.misceval.callsimOrSuspend(getCommandsFunc);
            if (result && result.v) {
              // Convert Python list to JavaScript array
              commands = Sk.ffi.remapToJs(result);
              console.log(
                "[PythonRunner] Got commands from Python:",
                commands.length,
                commands.map((c) => c.type),
              );
            }
          }
        }
      }
    } catch (e) {
      // Module not loaded yet or error - ignore
      console.log("[PythonRunner] Could not get commands from Python:", e);
    }

    // Also check AIDriverStub for backwards compatibility
    while (AIDriverStub.hasCommands()) {
      commands.push(AIDriverStub.getNextCommand());
    }

    if (commands.length === 0) {
      return; // No commands to process
    }

    console.log("[PythonRunner] Processing", commands.length, "commands");

    // Process all commands
    for (const cmd of commands) {
      console.log("[PythonRunner] Processing command:", cmd.type, cmd.params);

      // Update App.robot directly based on command
      if (typeof App !== "undefined" && App.robot) {
        switch (cmd.type) {
          case "drive_forward":
            App.robot.leftSpeed = cmd.params.leftSpeed;
            App.robot.rightSpeed = cmd.params.rightSpeed;
            App.robot.isMoving = true;
            console.log(
              "[PythonRunner] Robot set to move:",
              App.robot.leftSpeed,
              App.robot.rightSpeed,
              App.robot.isMoving,
            );
            console.log(
              "[PythonRunner] Robot moving forward:",
              App.robot.leftSpeed,
              App.robot.rightSpeed,
            );
            break;

          case "drive_backward":
            App.robot.leftSpeed = -cmd.params.leftSpeed;
            App.robot.rightSpeed = -cmd.params.rightSpeed;
            App.robot.isMoving = true;
            break;

          case "rotate_left":
            // Left wheel forward, right wheel backward → counter-clockwise
            App.robot.leftSpeed = cmd.params.turnSpeed;
            App.robot.rightSpeed = -cmd.params.turnSpeed;
            App.robot.isMoving = true;
            break;

          case "rotate_right":
            // Left wheel backward, right wheel forward → clockwise
            App.robot.leftSpeed = -cmd.params.turnSpeed;
            App.robot.rightSpeed = cmd.params.turnSpeed;
            App.robot.isMoving = true;
            break;

          case "brake":
            App.robot.leftSpeed = 0;
            App.robot.rightSpeed = 0;
            App.robot.isMoving = false;
            break;

          case "init":
            // Robot initialized
            if (typeof DebugPanel !== "undefined") {
              DebugPanel.info("[AIDriver] Robot initialized");
            }
            break;

          case "hold_state":
            // Hold state is handled by Python's time.sleep
            break;

          case "drive":
            App.robot.leftSpeed = cmd.params.leftSpeed;
            App.robot.rightSpeed = cmd.params.rightSpeed;
            App.robot.isMoving = true;
            break;

          case "read_distance":
          case "read_distance_2":
            // Just logging, no action needed
            break;

          default:
            console.log("[PythonRunner] Unknown command:", cmd);
        }
      }
    }
  },

  /**
   * Handle Python execution errors emitted by Skulpt. Filters out expected stop
   * scenarios, reports actionable errors to the debug panel, and annotates the
   * editor when a line number is available.
   *
   * @param {Error|Sk.builtin.BaseException|string} error Raw error object from Skulpt execution.
   */
  handleError(error) {
    try {
      // Ignore errors if we're already stopped
      if (this.shouldStop || !this.isRunning) {
        return;
      }

      let message = "";
      let lineNumber = null;

      // Check for KeyboardInterrupt (user stopped execution)
      try {
        if (
          Sk.builtin &&
          Sk.builtin.KeyboardInterrupt &&
          error instanceof Sk.builtin.KeyboardInterrupt
        ) {
          return;
        }
      } catch (e) {
        // instanceof check failed, continue to check by name
      }

      // Also check by name in case instanceof fails
      if (error && error.tp$name === "KeyboardInterrupt") {
        return;
      }

      // Check for our custom stop execution error
      if (error && error.isStopExecution) {
        return;
      }

      // Check for stop signal string
      if (error === "stopped" || (error && error.message === "stopped")) {
        return;
      }

      // Check for "Execution stopped" message
      if (error && error.message === "Execution stopped") {
        return;
      }

      if (error && error.traceback && error.traceback.length > 0) {
        const tb = error.traceback[0];
        lineNumber = tb.lineno;
        message = `Line ${lineNumber}: ${error.toString()}`;
      } else {
        message = error.toString();
      }

      // Log to debug panel
      if (typeof DebugPanel !== "undefined") {
        DebugPanel.log(`[Error] ${message}`, "error");
      }

      // Mark error in editor
      if (typeof Editor !== "undefined" && lineNumber) {
        Editor.markError(lineNumber, error.toString());
      }

      console.error("[PythonRunner] Error:", error);
    } catch (e) {
      // Ignore any errors in error handling itself
      console.error("[PythonRunner] Error in handleError:", e);
    }
  },

  /**
   * Perform a syntax-only compilation pass to surface SyntaxError details
   * before attempting full execution.
   *
   * @param {string} code Python source code to compile.
   * @returns {{valid: boolean, error: string|null, line: number|null}} Summary containing the error string and 1-based line number when invalid.
   */
  validateSyntax(code) {
    try {
      Sk.compile(code, "<stdin>", "exec", true);
      return { valid: true, error: null, line: null };
    } catch (error) {
      let line = null;
      let message = error.toString();

      if (error.traceback && error.traceback.length > 0) {
        line = error.traceback[0].lineno;
      } else if (error.args && error.args.v && error.args.v.length > 1) {
        // Try to extract line from SyntaxError
        const args = error.args.v;
        if (args[1] && args[1].v && args[1].v.length > 1) {
          line = Sk.ffi.remapToJs(args[1].v[1]);
        }
      }

      return { valid: false, error: message, line: line };
    }
  },
};

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = PythonRunner;
}
