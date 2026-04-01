/**
 * AIDriver Simulator - AIDriver Stub Module
 * Browser-based mock of the AIDriver MicroPython library
 * Implements all AIDriver methods and queues commands for the simulator
 */

const AIDriverStub = {
  // Command queue for simulator to consume
  commandQueue: [],

  // Debug flag
  DEBUG_AIDRIVER: false,

  // Robot instance state
  robotInstance: null,

  /**
   * Reset the simulator command queue so pending actions are discarded.
   */
  clearQueue() {
    this.commandQueue = [];
  },

  /**
   * Enqueue a structured command for the simulator and optionally log it.
   * @param {{type: string, params: Record<string, unknown>}} cmd Command payload.
   */
  queueCommand(cmd) {
    console.log("[AIDriverStub] queueCommand:", cmd.type, cmd.params);
    this.commandQueue.push(cmd);

    if (this.DEBUG_AIDRIVER) {
      DebugPanel.log(
        `[AIDriver] ${cmd.type}: ${JSON.stringify(cmd.params)}`,
        "info",
      );
    }
  },

  /**
   * Dequeue the next pending command.
   * @returns {{type: string, params: Record<string, unknown>}|undefined} Oldest command or undefined.
   */
  getNextCommand() {
    return this.commandQueue.shift();
  },

  /**
   * Determine whether commands remain in the queue.
   * @returns {boolean} True when at least one command is waiting to be processed.
   */
  hasCommands() {
    return this.commandQueue.length > 0;
  },

  /**
   * Build the Skulpt module definition that the Python runtime imports as `aidriver`.
   * @returns {(name: string) => object|undefined} Module factory compatible with Skulpt expectations.
   */
  getModule() {
    const self = this;

    return function (name) {
      console.log("[AIDriverStub] getModule called with name:", name);
      if (name !== "aidriver") return undefined;

      const mod = {};

      // DEBUG_AIDRIVER flag
      mod.DEBUG_AIDRIVER = new Sk.builtin.bool(false);

      // AIDriver class
      mod.AIDriver = Sk.misceval.buildClass(
        mod,
        function ($gbl, $loc) {
          /**
           * Initialize the stub and register the robot instance.
           * @returns {null}
           */
          $loc.__init__ = new Sk.builtin.func(function (self) {
            self.rightSpeed = 0;
            self.leftSpeed = 0;
            self.isMoving = false;

            AIDriverStub.robotInstance = self;
            AIDriverStub.queueCommand({
              type: "init",
              params: {},
            });

            if (AIDriverStub.DEBUG_AIDRIVER) {
              DebugPanel.log("[AIDriver] Robot initialized", "info");
            }

            return Sk.builtin.none.none$;
          });

          /**
           * Queue a forward driving command with discrete wheel speeds.
           * @param {Sk.builtin.int_} rightSpeed Mapped to right wheel speed.
           * @param {Sk.builtin.int_} leftSpeed Mapped to left wheel speed.
           * @returns {null}
           */
          $loc.drive_forward = new Sk.builtin.func(function (
            self,
            rightSpeed,
            leftSpeed,
          ) {
            const rs = Sk.ffi.remapToJs(rightSpeed);
            const ls = Sk.ffi.remapToJs(leftSpeed);

            self.rightSpeed = rs;
            self.leftSpeed = ls;
            self.isMoving = true;

            AIDriverStub.queueCommand({
              type: "drive_forward",
              params: { rightSpeed: rs, leftSpeed: ls },
            });

            return Sk.builtin.none.none$;
          });

          /**
           * Queue a backward driving command with discrete wheel speeds.
           * @param {Sk.builtin.int_} rightSpeed Mapped to right wheel speed.
           * @param {Sk.builtin.int_} leftSpeed Mapped to left wheel speed.
           * @returns {null}
           */
          $loc.drive_backward = new Sk.builtin.func(function (
            self,
            rightSpeed,
            leftSpeed,
          ) {
            const rs = Sk.ffi.remapToJs(rightSpeed);
            const ls = Sk.ffi.remapToJs(leftSpeed);

            self.rightSpeed = rs;
            self.leftSpeed = ls;
            self.isMoving = true;

            AIDriverStub.queueCommand({
              type: "drive_backward",
              params: { rightSpeed: rs, leftSpeed: ls },
            });

            return Sk.builtin.none.none$;
          });

          /**
           * Queue a left rotation command using a single turn speed.
           * @param {Sk.builtin.int_} turnSpeed Desired rotation speed value.
           * @returns {null}
           */
          $loc.rotate_left = new Sk.builtin.func(function (self, turnSpeed) {
            const ts = Sk.ffi.remapToJs(turnSpeed);

            self.rightSpeed = ts;
            self.leftSpeed = ts;
            self.isMoving = true;

            AIDriverStub.queueCommand({
              type: "rotate_left",
              params: { turnSpeed: ts },
            });

            return Sk.builtin.none.none$;
          });

          /**
           * Queue a right rotation command using a single turn speed.
           * @param {Sk.builtin.int_} turnSpeed Desired rotation speed value.
           * @returns {null}
           */
          $loc.rotate_right = new Sk.builtin.func(function (self, turnSpeed) {
            const ts = Sk.ffi.remapToJs(turnSpeed);

            self.rightSpeed = ts;
            self.leftSpeed = ts;
            self.isMoving = true;

            AIDriverStub.queueCommand({
              type: "rotate_right",
              params: { turnSpeed: ts },
            });

            return Sk.builtin.none.none$;
          });

          /**
           * Immediately stop all movement and queue a brake command.
           * @returns {null}
           */
          $loc.brake = new Sk.builtin.func(function (self) {
            self.rightSpeed = 0;
            self.leftSpeed = 0;
            self.isMoving = false;

            AIDriverStub.queueCommand({
              type: "brake",
              params: {},
            });

            return Sk.builtin.none.none$;
          });

          /**
           * Minimum reliable motor speed constant matching the hardware library.
           */
          $loc.MIN_MOTOR_SPEED = new Sk.builtin.int_(120);

          /**
           * Drive with signed speeds for PID control.
           * Positive = forward, negative = backward.
           * Speeds below MIN_MOTOR_SPEED magnitude are treated as zero.
           * @param {Sk.builtin.int_} rightSpeed -255 to 255.
           * @param {Sk.builtin.int_} leftSpeed -255 to 255.
           * @returns {null}
           */
          $loc.drive = new Sk.builtin.func(function (
            self,
            rightSpeed,
            leftSpeed,
          ) {
            const MIN_MOTOR_SPEED = 120;
            let rs = Math.max(
              -255,
              Math.min(255, Sk.ffi.remapToJs(rightSpeed)),
            );
            let ls = Math.max(-255, Math.min(255, Sk.ffi.remapToJs(leftSpeed)));

            if (Math.abs(rs) < MIN_MOTOR_SPEED) rs = 0;
            if (Math.abs(ls) < MIN_MOTOR_SPEED) ls = 0;

            if (rs === 0 && ls === 0) {
              self.rightSpeed = 0;
              self.leftSpeed = 0;
              self.isMoving = false;
              AIDriverStub.queueCommand({ type: "brake", params: {} });
              return Sk.builtin.none.none$;
            }

            self.rightSpeed = rs;
            self.leftSpeed = ls;
            self.isMoving = true;

            AIDriverStub.queueCommand({
              type: "drive",
              params: { rightSpeed: rs, leftSpeed: ls },
            });

            return Sk.builtin.none.none$;
          });

          /**
           * Measure distance using the simulator abstraction.
           * @returns {Sk.builtin.int_} Integer distance in simulated centimeters.
           */
          $loc.read_distance = new Sk.builtin.func(function (self) {
            // Get distance from simulator using current robot state
            let distance = 1000;
            if (
              typeof Simulator !== "undefined" &&
              typeof App !== "undefined" &&
              App.robot
            ) {
              distance = Simulator.simulateUltrasonic(App.robot);
            }

            AIDriverStub.queueCommand({
              type: "read_distance",
              params: { result: distance },
            });

            return new Sk.builtin.int_(distance);
          });

          /**
           * Measure distance using the side-facing ultrasonic sensor.
           * @returns {Sk.builtin.int_} Integer distance in mm from the side sensor.
           */
          $loc.read_distance_2 = new Sk.builtin.func(function (self) {
            let distance = 1000;
            if (
              typeof Simulator !== "undefined" &&
              typeof App !== "undefined" &&
              App.robot
            ) {
              distance = Simulator.simulateUltrasonicSide(App.robot);
            }

            AIDriverStub.queueCommand({
              type: "read_distance_2",
              params: { result: distance },
            });

            return new Sk.builtin.int_(distance);
          });

          /**
           * Report whether motion commands are currently active.
           * @returns {Sk.builtin.bool} True when the robot is moving.
           */
          $loc.is_moving = new Sk.builtin.func(function (self) {
            return new Sk.builtin.bool(self.isMoving);
          });

          /**
           * Return a tuple capturing the cached motor speeds.
           * @returns {Sk.builtin.tuple} Pair of right and left speed integers.
           */
          $loc.get_motor_speeds = new Sk.builtin.func(function (self) {
            return new Sk.builtin.tuple([
              new Sk.builtin.int_(self.rightSpeed),
              new Sk.builtin.int_(self.leftSpeed),
            ]);
          });

          /**
           * Update the cached motor speeds without changing direction indicators.
           * @param {Sk.builtin.int_} rightSpeed New right wheel speed.
           * @param {Sk.builtin.int_} leftSpeed New left wheel speed.
           * @returns {null}
           */
          $loc.set_motor_speeds = new Sk.builtin.func(function (
            self,
            rightSpeed,
            leftSpeed,
          ) {
            const rs = Sk.ffi.remapToJs(rightSpeed);
            const ls = Sk.ffi.remapToJs(leftSpeed);

            self.rightSpeed = rs;
            self.leftSpeed = ls;

            AIDriverStub.queueCommand({
              type: "set_motor_speeds",
              params: { rightSpeed: rs, leftSpeed: ls },
            });

            return Sk.builtin.none.none$;
          });
        },
        "AIDriver",
        [],
      );

      /**
       * Suspend execution for the requested time while keeping the last state.
       * @param {Sk.builtin.int_|Sk.builtin.float_} seconds Duration expressed in seconds.
       * @returns {Sk.misceval.Suspension} Suspension resolving when the duration elapses.
       */
      mod.hold_state = new Sk.builtin.func(function (seconds) {
        const secs = Sk.ffi.remapToJs(seconds);

        console.log("[AIDriverStub] hold_state JS called with seconds:", secs);

        AIDriverStub.queueCommand({
          type: "hold_state",
          params: { seconds: secs },
        });

        if (AIDriverStub.DEBUG_AIDRIVER) {
          DebugPanel.log(`[AIDriver] hold_state: ${secs} second(s)`, "info");
        }

        // Return a suspension to pause execution
        const scaledMs = (secs * 1000) / (App.speedMultiplier || 1);
        console.log(
          "[AIDriverStub] Creating promiseToSuspension with scaledMs:",
          scaledMs,
        );

        return new Sk.misceval.promiseToSuspension(
          new Promise((resolve) => {
            console.log(
              "[AIDriverStub] Promise created, setting setTimeout for",
              scaledMs,
              "ms",
            );
            setTimeout(() => {
              console.log("[AIDriverStub] setTimeout fired, resolving promise");
              resolve(Sk.builtin.none.none$);
            }, scaledMs);
          }),
        );
      });

      return mod;
    };
  },
};

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = AIDriverStub;
}
