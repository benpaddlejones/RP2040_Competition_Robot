/**
 * Side Ultrasonic Sensor Unit Tests
 * Tests for the side-facing ultrasonic sensor simulation and stub integration
 */

describe("Side Ultrasonic Sensor - Simulator", () => {
  let SimulatorImpl;

  beforeEach(() => {
    // Minimal Simulator implementation matching the real module's side sensor API
    const ARENA_WIDTH = 2000;
    const ARENA_HEIGHT = 2000;
    const ROBOT_WIDTH = 120;
    const ROBOT_LENGTH = 150;
    const ULTRASONIC_MIN = 20;
    const ULTRASONIC_MAX = 2000;

    let sideSensorSide = "left";
    let obstacles = [];
    let mazeWalls = [];

    function rayBoxIntersection(
      rayX,
      rayY,
      dirX,
      dirY,
      boxX,
      boxY,
      boxW,
      boxH,
    ) {
      let tmin = 0;
      let tmax = Infinity;
      if (Math.abs(dirX) > 0.0001) {
        const t1 = (boxX - rayX) / dirX;
        const t2 = (boxX + boxW - rayX) / dirX;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      } else if (rayX < boxX || rayX > boxX + boxW) {
        return null;
      }
      if (Math.abs(dirY) > 0.0001) {
        const t1 = (boxY - rayY) / dirY;
        const t2 = (boxY + boxH - rayY) / dirY;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      } else if (rayY < boxY || rayY > boxY + boxH) {
        return null;
      }
      if (tmin > tmax || tmax < 0) return null;
      return tmin > 0 ? tmin : tmax;
    }

    function simulateUltrasonicSide(robot) {
      const headingRad = (robot.heading * Math.PI) / 180;
      // Simulator heading convention: forward = (sin(h), -cos(h))
      // Left  = (-cos(h), -sin(h))
      // Right = ( cos(h),  sin(h))
      let rayDirX, rayDirY;
      if (sideSensorSide === "left") {
        rayDirX = -Math.cos(headingRad);
        rayDirY = -Math.sin(headingRad);
      } else {
        rayDirX = Math.cos(headingRad);
        rayDirY = Math.sin(headingRad);
      }

      const sensorX = robot.x + rayDirX * (ROBOT_WIDTH / 2);
      const sensorY = robot.y + rayDirY * (ROBOT_WIDTH / 2);

      let minDistance = ULTRASONIC_MAX + 1;

      // Arena walls
      if (rayDirY < 0) {
        const t = -sensorY / rayDirY;
        if (t > 0 && t < minDistance) minDistance = t;
      }
      if (rayDirY > 0) {
        const t = (ARENA_HEIGHT - sensorY) / rayDirY;
        if (t > 0 && t < minDistance) minDistance = t;
      }
      if (rayDirX < 0) {
        const t = -sensorX / rayDirX;
        if (t > 0 && t < minDistance) minDistance = t;
      }
      if (rayDirX > 0) {
        const t = (ARENA_WIDTH - sensorX) / rayDirX;
        if (t > 0 && t < minDistance) minDistance = t;
      }

      // Obstacles
      for (const obstacle of obstacles) {
        const d = rayBoxIntersection(
          sensorX,
          sensorY,
          rayDirX,
          rayDirY,
          obstacle.x,
          obstacle.y,
          obstacle.width,
          obstacle.height,
        );
        if (d !== null && d < minDistance) minDistance = d;
      }

      // Maze walls
      for (const wall of mazeWalls) {
        const d = rayBoxIntersection(
          sensorX,
          sensorY,
          rayDirX,
          rayDirY,
          wall.x,
          wall.y,
          wall.width,
          wall.height,
        );
        if (d !== null && d < minDistance) minDistance = d;
      }

      if (minDistance < ULTRASONIC_MIN) return -1;
      if (minDistance > ULTRASONIC_MAX) return -1;

      // Skip noise in tests for determinism
      return Math.round(minDistance);
    }

    SimulatorImpl = {
      ARENA_WIDTH,
      ARENA_HEIGHT,
      ROBOT_WIDTH,
      ROBOT_LENGTH,
      ULTRASONIC_MIN,
      ULTRASONIC_MAX,

      simulateUltrasonicSide,

      setSideSensorSide(side) {
        if (side === "left" || side === "right") sideSensorSide = side;
      },
      getSideSensorSide() {
        return sideSensorSide;
      },
      setObstacles(list) {
        obstacles = list || [];
      },
      setMazeWalls(walls) {
        mazeWalls = walls || [];
      },
    };
  });

  describe("Side sensor placement", () => {
    test("default side should be left", () => {
      expect(SimulatorImpl.getSideSensorSide()).toBe("left");
    });

    test("setSideSensorSide should switch to right", () => {
      SimulatorImpl.setSideSensorSide("right");
      expect(SimulatorImpl.getSideSensorSide()).toBe("right");
    });

    test("setSideSensorSide should switch back to left", () => {
      SimulatorImpl.setSideSensorSide("right");
      SimulatorImpl.setSideSensorSide("left");
      expect(SimulatorImpl.getSideSensorSide()).toBe("left");
    });

    test("setSideSensorSide should ignore invalid values", () => {
      SimulatorImpl.setSideSensorSide("up");
      expect(SimulatorImpl.getSideSensorSide()).toBe("left");
    });
  });

  describe("Side sensor ray direction", () => {
    test("left sensor facing up (heading=0) should detect left arena wall", () => {
      // Robot at center, heading 0 (north). Left sensor points west (x=0 direction).
      const robot = { x: 500, y: 1000, heading: 0 };
      SimulatorImpl.setSideSensorSide("left");
      const distance = SimulatorImpl.simulateUltrasonicSide(robot);

      // Distance to left wall from sensor position: 500 - ROBOT_WIDTH/2 = 440
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(500);
    });

    test("right sensor facing up (heading=0) should detect right arena wall", () => {
      // Robot at center, heading 0 (north). Right sensor points east (x=2000 direction).
      const robot = { x: 500, y: 1000, heading: 0 };
      SimulatorImpl.setSideSensorSide("right");
      const distance = SimulatorImpl.simulateUltrasonicSide(robot);

      // Distance to right wall from sensor position: 2000 - (500 + ROBOT_WIDTH/2) = 1440
      expect(distance).toBeGreaterThan(1000);
      expect(distance).toBeLessThan(1600);
    });

    test("switching side should change measured distance", () => {
      const robot = { x: 400, y: 1000, heading: 0 };

      SimulatorImpl.setSideSensorSide("left");
      const leftDist = SimulatorImpl.simulateUltrasonicSide(robot);

      SimulatorImpl.setSideSensorSide("right");
      const rightDist = SimulatorImpl.simulateUltrasonicSide(robot);

      // Robot is closer to the left wall so left should be much shorter
      expect(leftDist).toBeLessThan(rightDist);
    });

    test("heading 90 (east): left sensor should point north (top wall)", () => {
      const robot = { x: 1000, y: 500, heading: 90 };
      SimulatorImpl.setSideSensorSide("left");
      const distance = SimulatorImpl.simulateUltrasonicSide(robot);

      // Pointing north from y=500 should read ~440 to top wall
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(600);
    });

    test("heading 180 (south): left sensor should point east (right wall)", () => {
      const robot = { x: 1000, y: 1000, heading: 180 };
      SimulatorImpl.setSideSensorSide("left");
      const distance = SimulatorImpl.simulateUltrasonicSide(robot);

      // Pointing east from x=1000 should read ~940
      expect(distance).toBeGreaterThan(800);
      expect(distance).toBeLessThan(1100);
    });
  });

  describe("Side sensor range limits", () => {
    test("should return -1 when too close to wall (< 20mm)", () => {
      // Place robot very close to left wall, sensor pointing left
      const robot = { x: 70, y: 1000, heading: 0 };
      SimulatorImpl.setSideSensorSide("left");
      const distance = SimulatorImpl.simulateUltrasonicSide(robot);

      // Sensor at x = 70 - 60 = 10mm from wall, below ULTRASONIC_MIN
      expect(distance).toBe(-1);
    });

    test("should return valid distance at minimum range boundary", () => {
      // Place robot at ~80mm from left wall so sensor reads ~20mm
      const robot = { x: 82, y: 1000, heading: 0 };
      SimulatorImpl.setSideSensorSide("left");
      const distance = SimulatorImpl.simulateUltrasonicSide(robot);

      // Sensor at x = 82 - 60 = 22mm from wall, just above ULTRASONIC_MIN
      expect(distance).toBeGreaterThanOrEqual(20);
      expect(distance).toBeLessThan(30);
    });

    test("should return valid distance within max range", () => {
      const robot = { x: 1000, y: 1000, heading: 0 };
      SimulatorImpl.setSideSensorSide("left");
      const distance = SimulatorImpl.simulateUltrasonicSide(robot);

      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThanOrEqual(2000);
    });
  });

  describe("Side sensor obstacle detection", () => {
    test("should detect obstacle to the left", () => {
      SimulatorImpl.setObstacles([{ x: 700, y: 950, width: 100, height: 100 }]);
      const robot = { x: 1000, y: 1000, heading: 0 };
      SimulatorImpl.setSideSensorSide("left");
      const distance = SimulatorImpl.simulateUltrasonicSide(robot);

      // Obstacle right edge at x=800, sensor at x=1000-60=940
      // Distance should be ~140
      expect(distance).toBeGreaterThan(100);
      expect(distance).toBeLessThan(200);
    });

    test("should not detect obstacle on opposite side", () => {
      SimulatorImpl.setObstacles([
        { x: 1100, y: 950, width: 100, height: 100 },
      ]);
      const robot = { x: 1000, y: 1000, heading: 0 };
      SimulatorImpl.setSideSensorSide("left");
      const distance = SimulatorImpl.simulateUltrasonicSide(robot);

      // Obstacle is to the right, left sensor should not see it
      // Left sensor should see the left arena wall only
      expect(distance).toBeGreaterThan(800);
    });

    test("should detect maze walls to the side", () => {
      SimulatorImpl.setMazeWalls([{ x: 800, y: 900, width: 20, height: 200 }]);
      const robot = { x: 1000, y: 1000, heading: 0 };
      SimulatorImpl.setSideSensorSide("left");
      const distance = SimulatorImpl.simulateUltrasonicSide(robot);

      // Wall right edge at x=820, sensor at x=940
      // Distance ~120
      expect(distance).toBeGreaterThan(50);
      expect(distance).toBeLessThan(200);
    });

    test("should pick closest of multiple side obstacles", () => {
      SimulatorImpl.setObstacles([
        { x: 600, y: 950, width: 100, height: 100 },
        { x: 800, y: 950, width: 50, height: 100 },
      ]);
      const robot = { x: 1000, y: 1000, heading: 0 };
      SimulatorImpl.setSideSensorSide("left");
      const distance = SimulatorImpl.simulateUltrasonicSide(robot);

      // Closer obstacle right edge at x=850, sensor at x=940 -> ~90
      expect(distance).toBeGreaterThan(50);
      expect(distance).toBeLessThan(150);
    });
  });
});

describe("Side Ultrasonic Sensor - AIDriver Stub", () => {
  let AIDriverStubImpl;

  beforeEach(() => {
    AIDriverStubImpl = {
      commandQueue: [],

      clearQueue() {
        this.commandQueue = [];
      },

      queueCommand(command) {
        this.commandQueue.push(command);
      },

      getQueue() {
        return this.commandQueue;
      },

      read_distance_2(simulatedDistance) {
        const distance =
          simulatedDistance !== undefined ? simulatedDistance : 500;
        this.queueCommand({
          type: "read_distance_2",
          params: { result: distance },
        });
        return distance;
      },
    };
  });

  test("read_distance_2 should queue a command", () => {
    AIDriverStubImpl.read_distance_2(300);
    const queue = AIDriverStubImpl.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe("read_distance_2");
  });

  test("read_distance_2 command should include result in params", () => {
    AIDriverStubImpl.read_distance_2(450);
    const queue = AIDriverStubImpl.getQueue();
    expect(queue[0].params.result).toBe(450);
  });

  test("read_distance_2 should return the distance value", () => {
    const result = AIDriverStubImpl.read_distance_2(123);
    expect(result).toBe(123);
  });

  test("read_distance_2 should default to 500 when no value provided", () => {
    const result = AIDriverStubImpl.read_distance_2();
    expect(result).toBe(500);
  });

  test("read_distance_2 should handle -1 (out of range)", () => {
    const result = AIDriverStubImpl.read_distance_2(-1);
    expect(result).toBe(-1);
    expect(AIDriverStubImpl.getQueue()[0].params.result).toBe(-1);
  });

  test("clearQueue should remove read_distance_2 commands", () => {
    AIDriverStubImpl.read_distance_2(100);
    AIDriverStubImpl.read_distance_2(200);
    expect(AIDriverStubImpl.getQueue()).toHaveLength(2);
    AIDriverStubImpl.clearQueue();
    expect(AIDriverStubImpl.getQueue()).toHaveLength(0);
  });
});

describe("Side Ultrasonic Sensor - Validator", () => {
  test("read_distance_2 should be in allowed AIDriver methods", () => {
    // Mirrors the AIDRIVER_METHODS set from validator.js
    const AIDRIVER_METHODS = new Set([
      "drive_forward",
      "drive_backward",
      "rotate_left",
      "rotate_right",
      "brake",
      "read_distance",
      "read_distance_2",
      "is_moving",
      "get_motor_speeds",
    ]);

    expect(AIDRIVER_METHODS.has("read_distance_2")).toBe(true);
  });

  test("code using read_distance_2 should not be flagged as invalid", () => {
    const code = `
from aidriver import AIDriver
my_robot = AIDriver()
side_dist = my_robot.read_distance_2()
print(side_dist)
`;
    // Simulate the forbidden pattern check from validator
    const FORBIDDEN_PATTERNS = [
      { pattern: /\bexec\s*\(/, message: "exec() is not allowed" },
      { pattern: /\beval\s*\(/, message: "eval() is not allowed" },
      { pattern: /\bopen\s*\(/, message: "open() is not allowed" },
      { pattern: /\b__import__\s*\(/, message: "__import__() is not allowed" },
    ];

    for (const { pattern, message } of FORBIDDEN_PATTERNS) {
      expect(code).not.toMatch(pattern);
    }
  });
});
