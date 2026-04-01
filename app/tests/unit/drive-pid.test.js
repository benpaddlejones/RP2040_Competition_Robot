/**
 * drive() PID Method Unit Tests
 * Validates the signed-speed drive() method, dead zone handling,
 * MIN_MOTOR_SPEED constant, and validator/stub integration.
 */

describe("drive() - Python shim behaviour", () => {
  const MIN_MOTOR_SPEED = 120;

  /**
   * Minimal reimplementation of the drive() logic from the Python shim
   * in python-runner.js so we can unit-test the algorithm purely in JS.
   */
  function drive(rightSpeed, leftSpeed) {
    let rs = Math.max(-255, Math.min(255, Math.trunc(rightSpeed)));
    let ls = Math.max(-255, Math.min(255, Math.trunc(leftSpeed)));

    if (Math.abs(rs) < MIN_MOTOR_SPEED) rs = 0;
    if (Math.abs(ls) < MIN_MOTOR_SPEED) ls = 0;

    if (rs === 0 && ls === 0) {
      return { type: "brake", rightSpeed: 0, leftSpeed: 0, isMoving: false };
    }

    return { type: "drive", rightSpeed: rs, leftSpeed: ls, isMoving: true };
  }

  describe("Speed clamping", () => {
    test("should clamp right speed to 255", () => {
      const result = drive(300, 200);
      expect(result.rightSpeed).toBe(255);
    });

    test("should clamp left speed to 255", () => {
      const result = drive(200, 300);
      expect(result.leftSpeed).toBe(255);
    });

    test("should clamp right speed to -255", () => {
      const result = drive(-300, -200);
      expect(result.rightSpeed).toBe(-255);
    });

    test("should clamp left speed to -255", () => {
      const result = drive(-200, -300);
      expect(result.leftSpeed).toBe(-255);
    });

    test("should allow speeds within range unchanged", () => {
      const result = drive(200, 180);
      expect(result.rightSpeed).toBe(200);
      expect(result.leftSpeed).toBe(180);
    });
  });

  describe("Dead zone handling (MIN_MOTOR_SPEED = 120)", () => {
    test("speed below MIN_MOTOR_SPEED should be zeroed", () => {
      const result = drive(119, 200);
      expect(result.rightSpeed).toBe(0);
    });

    test("negative speed with magnitude below MIN_MOTOR_SPEED should be zeroed", () => {
      const result = drive(-100, -200);
      expect(result.rightSpeed).toBe(0);
    });

    test("speed exactly at MIN_MOTOR_SPEED should be kept", () => {
      const result = drive(120, 120);
      expect(result.rightSpeed).toBe(120);
      expect(result.leftSpeed).toBe(120);
    });

    test("speed just below MIN_MOTOR_SPEED should be zeroed", () => {
      const result = drive(119, 119);
      // Both below dead zone → both zero → brake
      expect(result.type).toBe("brake");
      expect(result.isMoving).toBe(false);
    });

    test("one wheel in dead zone, other above → one wheel stops", () => {
      const result = drive(100, 200);
      expect(result.rightSpeed).toBe(0);
      expect(result.leftSpeed).toBe(200);
      expect(result.type).toBe("drive");
      expect(result.isMoving).toBe(true);
    });

    test("zero speed should stay zero and trigger brake when both zero", () => {
      const result = drive(0, 0);
      expect(result.type).toBe("brake");
      expect(result.isMoving).toBe(false);
    });
  });

  describe("Direction handling", () => {
    test("positive speeds should produce forward drive command", () => {
      const result = drive(200, 200);
      expect(result.type).toBe("drive");
      expect(result.rightSpeed).toBe(200);
      expect(result.leftSpeed).toBe(200);
      expect(result.isMoving).toBe(true);
    });

    test("negative speeds should produce backward drive command", () => {
      const result = drive(-200, -200);
      expect(result.type).toBe("drive");
      expect(result.rightSpeed).toBe(-200);
      expect(result.leftSpeed).toBe(-200);
      expect(result.isMoving).toBe(true);
    });

    test("mixed signs should produce differential drive command", () => {
      const result = drive(200, -200);
      expect(result.type).toBe("drive");
      expect(result.rightSpeed).toBe(200);
      expect(result.leftSpeed).toBe(-200);
    });

    test("both in dead zone should brake", () => {
      const result = drive(50, -50);
      expect(result.type).toBe("brake");
      expect(result.rightSpeed).toBe(0);
      expect(result.leftSpeed).toBe(0);
      expect(result.isMoving).toBe(false);
    });
  });

  describe("PID correction scenarios", () => {
    test("wall-following correction: BASE_SPEED ± correction", () => {
      const BASE_SPEED = 180;
      const correction = 30;
      const result = drive(BASE_SPEED + correction, BASE_SPEED - correction);
      expect(result.rightSpeed).toBe(210);
      expect(result.leftSpeed).toBe(150);
      expect(result.type).toBe("drive");
    });

    test("large correction pushing one wheel into dead zone", () => {
      const BASE_SPEED = 160;
      const correction = 50;
      const result = drive(BASE_SPEED + correction, BASE_SPEED - correction);
      // Right = 210 (ok), Left = 110 (below 120 → 0)
      expect(result.rightSpeed).toBe(210);
      expect(result.leftSpeed).toBe(0);
    });

    test("correction pushing one wheel negative", () => {
      const BASE_SPEED = 150;
      const correction = 200;
      const result = drive(BASE_SPEED + correction, BASE_SPEED - correction);
      // Right = 350 → clamped to 255, Left = -50 → dead zone → 0
      expect(result.rightSpeed).toBe(255);
      expect(result.leftSpeed).toBe(0);
    });
  });
});

describe("drive() - AIDriverStub integration", () => {
  let stubImpl;

  beforeEach(() => {
    stubImpl = {
      commandQueue: [],
      MIN_MOTOR_SPEED: 120,

      queueCommand(cmd) {
        this.commandQueue.push(cmd);
      },

      clearQueue() {
        this.commandQueue = [];
      },

      drive(rightSpeed, leftSpeed) {
        let rs = Math.max(-255, Math.min(255, rightSpeed));
        let ls = Math.max(-255, Math.min(255, leftSpeed));

        if (Math.abs(rs) < this.MIN_MOTOR_SPEED) rs = 0;
        if (Math.abs(ls) < this.MIN_MOTOR_SPEED) ls = 0;

        if (rs === 0 && ls === 0) {
          this.queueCommand({ type: "brake", params: {} });
          return;
        }

        this.queueCommand({
          type: "drive",
          params: { rightSpeed: rs, leftSpeed: ls },
        });
      },
    };
  });

  test("drive() should queue a drive command", () => {
    stubImpl.drive(200, 200);
    expect(stubImpl.commandQueue).toHaveLength(1);
    expect(stubImpl.commandQueue[0].type).toBe("drive");
    expect(stubImpl.commandQueue[0].params.rightSpeed).toBe(200);
    expect(stubImpl.commandQueue[0].params.leftSpeed).toBe(200);
  });

  test("drive() with dead zone speeds should queue brake", () => {
    stubImpl.drive(50, 50);
    expect(stubImpl.commandQueue).toHaveLength(1);
    expect(stubImpl.commandQueue[0].type).toBe("brake");
  });

  test("drive() with mixed dead zone should queue drive with zeroed wheel", () => {
    stubImpl.drive(200, 50);
    expect(stubImpl.commandQueue).toHaveLength(1);
    expect(stubImpl.commandQueue[0].type).toBe("drive");
    expect(stubImpl.commandQueue[0].params.rightSpeed).toBe(200);
    expect(stubImpl.commandQueue[0].params.leftSpeed).toBe(0);
  });

  test("drive() with negative speeds should queue drive command", () => {
    stubImpl.drive(-200, -150);
    expect(stubImpl.commandQueue).toHaveLength(1);
    expect(stubImpl.commandQueue[0].type).toBe("drive");
    expect(stubImpl.commandQueue[0].params.rightSpeed).toBe(-200);
    expect(stubImpl.commandQueue[0].params.leftSpeed).toBe(-150);
  });

  test("clearQueue should remove drive commands", () => {
    stubImpl.drive(200, 200);
    stubImpl.drive(150, 150);
    expect(stubImpl.commandQueue).toHaveLength(2);
    stubImpl.clearQueue();
    expect(stubImpl.commandQueue).toHaveLength(0);
  });
});

describe("drive() - Validator consistency", () => {
  test("drive should be in allowed AIDriver methods", () => {
    const AIDRIVER_METHODS = new Set([
      "drive_forward",
      "drive_backward",
      "rotate_left",
      "rotate_right",
      "brake",
      "drive",
      "read_distance",
      "read_distance_2",
      "is_moving",
      "get_motor_speeds",
      "set_motor_speeds",
    ]);

    expect(AIDRIVER_METHODS.has("drive")).toBe(true);
    expect(AIDRIVER_METHODS.has("set_motor_speeds")).toBe(true);
  });

  test("code using drive() should not be flagged as forbidden", () => {
    const code = `
from aidriver import AIDriver
my_robot = AIDriver()
my_robot.drive(200, 200)
my_robot.drive(180 + correction, 180 - correction)
`;
    const FORBIDDEN_PATTERNS = [
      { pattern: /\bexec\s*\(/, message: "exec() is not allowed" },
      { pattern: /\beval\s*\(/, message: "eval() is not allowed" },
      { pattern: /\bopen\s*\(/, message: "open() is not allowed" },
      { pattern: /\b__import__\s*\(/, message: "__import__() is not allowed" },
    ];

    for (const { pattern } of FORBIDDEN_PATTERNS) {
      expect(code).not.toMatch(pattern);
    }
  });
});

describe("drive() - Command processing", () => {
  test("drive command should set signed speeds on robot state", () => {
    const robot = { leftSpeed: 0, rightSpeed: 0, isMoving: false };
    const cmd = { type: "drive", params: { rightSpeed: 200, leftSpeed: -150 } };

    // Simulate processCommandQueue behaviour
    switch (cmd.type) {
      case "drive":
        robot.leftSpeed = cmd.params.leftSpeed;
        robot.rightSpeed = cmd.params.rightSpeed;
        robot.isMoving = true;
        break;
    }

    expect(robot.rightSpeed).toBe(200);
    expect(robot.leftSpeed).toBe(-150);
    expect(robot.isMoving).toBe(true);
  });

  test("brake from drive(0,0) should stop robot", () => {
    const robot = { leftSpeed: 200, rightSpeed: 200, isMoving: true };
    const cmd = { type: "brake", params: {} };

    switch (cmd.type) {
      case "brake":
        robot.leftSpeed = 0;
        robot.rightSpeed = 0;
        robot.isMoving = false;
        break;
    }

    expect(robot.rightSpeed).toBe(0);
    expect(robot.leftSpeed).toBe(0);
    expect(robot.isMoving).toBe(false);
  });

  test("negative drive speeds should be preserved in robot state", () => {
    const robot = { leftSpeed: 0, rightSpeed: 0, isMoving: false };
    const cmd = {
      type: "drive",
      params: { rightSpeed: -200, leftSpeed: -200 },
    };

    robot.leftSpeed = cmd.params.leftSpeed;
    robot.rightSpeed = cmd.params.rightSpeed;
    robot.isMoving = true;

    expect(robot.rightSpeed).toBe(-200);
    expect(robot.leftSpeed).toBe(-200);
    expect(robot.isMoving).toBe(true);
  });
});
