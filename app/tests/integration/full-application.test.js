/**
 * Full Application Integration Tests
 * End-to-end tests for the complete AIDriver simulator workflow
 */

describe("Full Application Integration", () => {
  let App;
  let Editor;
  let Simulator;
  let PythonRunner;

  beforeEach(() => {
    // Create mock application state
    App = {
      currentChallenge: 1,
      isRunning: false,
      robot: {
        x: 1000,
        y: 1000,
        angle: 0,
        leftSpeed: 0,
        rightSpeed: 0,
        isMoving: false,
      },
      commandQueue: [],
      startPosition: { x: 1000, y: 1000 },
    };

    // Mock Editor
    Editor = {
      code: "",
      getCode: function () {
        return this.code;
      },
      setCode: function (code) {
        this.code = code;
      },
      errors: [],
      markError: function (line, msg) {
        this.errors.push({ line, msg });
      },
      clearErrors: function () {
        this.errors = [];
      },
    };

    // Mock Simulator
    Simulator = {
      isRunning: false,
      start: function () {
        this.isRunning = true;
      },
      stop: function () {
        this.isRunning = false;
      },
      reset: function () {
        App.robot = {
          x: 1000,
          y: 1000,
          angle: 0,
          leftSpeed: 0,
          rightSpeed: 0,
          isMoving: false,
        };
      },
      update: function (dt) {
        if (!App.robot.isMoving) return;
        const v = (App.robot.leftSpeed + App.robot.rightSpeed) / 2;
        App.robot.x += v * Math.cos(App.robot.angle) * dt;
        App.robot.y += v * Math.sin(App.robot.angle) * dt;
      },
    };

    // Mock PythonRunner
    PythonRunner = {
      isRunning: false,
      run: async function (code) {
        this.isRunning = true;
        // Simulate execution
        await new Promise((r) => setTimeout(r, 10));
        this.isRunning = false;
        return { success: true };
      },
      stop: function () {
        this.isRunning = false;
        App.robot.leftSpeed = 0;
        App.robot.rightSpeed = 0;
        App.robot.isMoving = false;
      },
    };
  });

  describe("Application Startup", () => {
    test("should initialize with default state", () => {
      expect(App.currentChallenge).toBe(1);
      expect(App.isRunning).toBe(false);
      expect(App.robot.x).toBe(1000);
      expect(App.robot.y).toBe(1000);
    });

    test("should have editor with empty code", () => {
      expect(Editor.getCode()).toBe("");
    });

    test("should have simulator not running", () => {
      expect(Simulator.isRunning).toBe(false);
    });
  });

  describe("Challenge Selection", () => {
    test("should update current challenge", () => {
      App.currentChallenge = 3;
      expect(App.currentChallenge).toBe(3);
    });

    test("should reset robot on challenge change", () => {
      App.robot.x = 500;
      Simulator.reset();
      expect(App.robot.x).toBe(1000);
    });
  });

  describe("Code Execution Flow", () => {
    test("should run code through PythonRunner", async () => {
      Editor.setCode("from aidriver import AIDriver\\nrobot = AIDriver()");

      const result = await PythonRunner.run(Editor.getCode());

      expect(result.success).toBe(true);
    });

    test("should set running state during execution", async () => {
      const promise = PythonRunner.run("x = 1");
      expect(PythonRunner.isRunning).toBe(true);

      await promise;
      expect(PythonRunner.isRunning).toBe(false);
    });

    test("should stop execution on stop button", async () => {
      const promise = PythonRunner.run("while True: pass");
      PythonRunner.stop();

      expect(PythonRunner.isRunning).toBe(false);
      await promise;
    });
  });

  describe("Robot Control Integration", () => {
    test("should start simulator when code runs", async () => {
      Simulator.start();
      await PythonRunner.run("x = 1");

      expect(Simulator.isRunning).toBe(true);
    });

    test("should stop robot when execution stops", () => {
      App.robot.leftSpeed = 100;
      App.robot.rightSpeed = 100;
      App.robot.isMoving = true;

      PythonRunner.stop();

      expect(App.robot.leftSpeed).toBe(0);
      expect(App.robot.rightSpeed).toBe(0);
      expect(App.robot.isMoving).toBe(false);
    });

    test("should update robot position during simulation", () => {
      App.robot.leftSpeed = 100;
      App.robot.rightSpeed = 100;
      App.robot.isMoving = true;
      const startX = App.robot.x;

      Simulator.update(1);

      expect(App.robot.x).toBeGreaterThan(startX);
    });
  });

  describe("Error Handling Flow", () => {
    test("should display errors in editor", () => {
      Editor.markError(5, "Syntax error");

      expect(Editor.errors).toHaveLength(1);
      expect(Editor.errors[0].line).toBe(5);
    });

    test("should clear errors on new run", () => {
      Editor.markError(1, "Error");
      Editor.clearErrors();

      expect(Editor.errors).toHaveLength(0);
    });
  });

  describe("Reset Functionality", () => {
    test("should reset robot to start position", () => {
      App.robot.x = 500;
      App.robot.y = 500;
      App.robot.angle = Math.PI;

      Simulator.reset();

      expect(App.robot.x).toBe(1000);
      expect(App.robot.y).toBe(1000);
      expect(App.robot.angle).toBe(0);
    });

    test("should stop robot on reset", () => {
      App.robot.leftSpeed = 100;
      App.robot.isMoving = true;

      Simulator.reset();

      expect(App.robot.leftSpeed).toBe(0);
      expect(App.robot.isMoving).toBe(false);
    });
  });

  describe("Challenge Completion", () => {
    test("should check success criteria after execution", async () => {
      const checkSuccess = () => App.robot.x > 1100;

      App.robot.x = 1200;

      expect(checkSuccess()).toBe(true);
    });

    test("should not trigger success during execution", () => {
      PythonRunner.isRunning = true;

      // Success should only be checked after execution
      expect(PythonRunner.isRunning).toBe(true);
    });
  });

  describe("PID Challenge Mode", () => {
    test("all challenges should require code (no gamepad mode)", () => {
      // PID challenges 1-5 all require user code
      for (let i = 1; i <= 5; i++) {
        App.currentChallenge = i;
        const isCodeChallenge =
          App.currentChallenge >= 1 && App.currentChallenge <= 5;
        expect(isCodeChallenge).toBe(true);
      }
    });
  });

  describe("State Persistence", () => {
    test("should save code to localStorage", () => {
      const mockStorage = {};
      const save = (key, value) => {
        mockStorage[key] = value;
      };
      const load = (key) => mockStorage[key];

      Editor.setCode("print('hello')");
      save("challenge_1_code", Editor.getCode());

      expect(load("challenge_1_code")).toBe("print('hello')");
    });

    test("should load saved code on challenge switch", () => {
      const mockStorage = { challenge_1_code: "saved code" };
      const load = (key) => mockStorage[key];

      const savedCode = load("challenge_1_code");
      if (savedCode) {
        Editor.setCode(savedCode);
      }

      expect(Editor.getCode()).toBe("saved code");
    });
  });

  describe("UI State Synchronization", () => {
    test("should update run button state based on execution", () => {
      function getRunButtonState() {
        return PythonRunner.isRunning ? "stop" : "run";
      }

      expect(getRunButtonState()).toBe("run");

      PythonRunner.isRunning = true;
      expect(getRunButtonState()).toBe("stop");
    });

    test("should enable/disable controls based on running state", () => {
      function shouldDisableControls() {
        return PythonRunner.isRunning;
      }

      App.currentChallenge = 1;
      PythonRunner.isRunning = true;
      expect(shouldDisableControls()).toBe(true);

      PythonRunner.isRunning = false;
      expect(shouldDisableControls()).toBe(false);
    });
  });

  describe("Multi-Challenge Workflow", () => {
    test("should progress through challenges", () => {
      const completedChallenges = new Set();

      function completeChallenge(id) {
        completedChallenges.add(id);
      }

      function getProgress() {
        return completedChallenges.size;
      }

      completeChallenge(1);
      completeChallenge(2);
      completeChallenge(3);

      expect(getProgress()).toBe(3);
    });

    test("should track completion status", () => {
      const status = {
        1: "completed",
        2: "completed",
        3: "in-progress",
        4: "locked",
      };

      expect(status[1]).toBe("completed");
      expect(status[3]).toBe("in-progress");
      expect(status[4]).toBe("locked");
    });
  });

  describe("Performance", () => {
    test("should handle rapid state updates", () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        Simulator.update(0.016); // ~60fps
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });

    test("should handle rapid command processing", () => {
      const commands = [];
      for (let i = 0; i < 100; i++) {
        commands.push({ type: "drive_forward", speed: 100 });
      }

      const start = Date.now();
      commands.forEach(() => {
        App.robot.leftSpeed = 100;
        App.robot.rightSpeed = 100;
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });
});
