/**
 * Challenge Success Integration Tests
 * Tests for PID challenge completion criteria (challenges 1-5)
 */

describe("Challenge Success Criteria", () => {
  let robot;

  beforeEach(() => {
    robot = {
      x: 300,
      y: 1700,
      angle: 0,
      leftSpeed: 0,
      rightSpeed: 0,
      isMoving: false,
      crashed: false,
    };
  });

  describe("Challenge 1: P Control — reach_zone", () => {
    // Zone: {x:100, y:100, width:300, height:200}
    function successCriteria(robot) {
      return (
        robot.x >= 100 && robot.x <= 400 && robot.y >= 100 && robot.y <= 300
      );
    }

    test("should fail if robot at start position", () => {
      expect(successCriteria(robot)).toBe(false);
    });

    test("should succeed if robot in exit zone", () => {
      robot.x = 200;
      robot.y = 200;
      expect(successCriteria(robot)).toBe(true);
    });

    test("should fail if robot past exit zone", () => {
      robot.x = 500;
      robot.y = 200;
      expect(successCriteria(robot)).toBe(false);
    });

    test("should succeed at zone boundaries", () => {
      robot.x = 100;
      robot.y = 100;
      expect(successCriteria(robot)).toBe(true);

      robot.x = 400;
      robot.y = 300;
      expect(successCriteria(robot)).toBe(true);
    });
  });

  describe("Challenge 2: PD Control — reach_zone (off-centre start)", () => {
    function successCriteria(robot) {
      return (
        robot.x >= 100 && robot.x <= 400 && robot.y >= 100 && robot.y <= 300
      );
    }

    test("should fail at start position (off-centre)", () => {
      robot.x = 150;
      robot.y = 1700;
      expect(successCriteria(robot)).toBe(false);
    });

    test("should succeed in exit zone", () => {
      robot.x = 250;
      robot.y = 200;
      expect(successCriteria(robot)).toBe(true);
    });
  });

  describe("Challenge 3: Full PID — reach_zone (L-maze)", () => {
    // Zone: {x:100, y:100, width:200, height:200}
    function successCriteria(robot) {
      return (
        robot.x >= 100 && robot.x <= 300 && robot.y >= 100 && robot.y <= 300
      );
    }

    test("should fail at start", () => {
      expect(successCriteria(robot)).toBe(false);
    });

    test("should succeed in goal zone", () => {
      robot.x = 150;
      robot.y = 200;
      expect(successCriteria(robot)).toBe(true);
    });

    test("should fail just outside zone", () => {
      robot.x = 350;
      robot.y = 200;
      expect(successCriteria(robot)).toBe(false);
    });
  });

  describe("Challenge 4: Dead End Detection — reach_zone", () => {
    // Zone: robot.x >= 1600 && robot.y <= 300
    function successCriteria(robot) {
      return robot.x >= 1600 && robot.y <= 300;
    }

    test("should fail at start", () => {
      expect(successCriteria(robot)).toBe(false);
    });

    test("should succeed at dead end exit", () => {
      robot.x = 1700;
      robot.y = 200;
      expect(successCriteria(robot)).toBe(true);
    });

    test("should fail if x not far enough", () => {
      robot.x = 1500;
      robot.y = 200;
      expect(successCriteria(robot)).toBe(false);
    });

    test("should fail if y too large", () => {
      robot.x = 1700;
      robot.y = 400;
      expect(successCriteria(robot)).toBe(false);
    });
  });

  describe("Challenge 5: Maze Solver — reach_zone + no crash", () => {
    function successCriteria(robot) {
      return robot.x >= 1700 && robot.y <= 300 && !robot.crashed;
    }

    test("should fail at start", () => {
      expect(successCriteria(robot)).toBe(false);
    });

    test("should succeed at maze exit without crash", () => {
      robot.x = 1800;
      robot.y = 200;
      robot.crashed = false;
      expect(successCriteria(robot)).toBe(true);
    });

    test("should fail if robot crashed even at exit", () => {
      robot.x = 1800;
      robot.y = 200;
      robot.crashed = true;
      expect(successCriteria(robot)).toBe(false);
    });

    test("should fail if not at exit zone even without crash", () => {
      robot.x = 1000;
      robot.y = 1000;
      robot.crashed = false;
      expect(successCriteria(robot)).toBe(false);
    });
  });

  describe("Success Detection Timing", () => {
    test("should detect success immediately after criteria met", () => {
      function checkSuccess(robot) {
        return (
          robot.x >= 100 && robot.x <= 400 && robot.y >= 100 && robot.y <= 300
        );
      }

      robot.x = 300;
      robot.y = 1700;
      expect(checkSuccess(robot)).toBe(false);

      robot.x = 200;
      robot.y = 200;
      expect(checkSuccess(robot)).toBe(true);
    });

    test("should track multiple success conditions", () => {
      function checkAllConditions(robot) {
        return {
          inZone: robot.x >= 1700 && robot.y <= 300,
          notCrashed: !robot.crashed,
          inBounds: robot.x > 0 && robot.x < 2000,
        };
      }

      robot.x = 1800;
      robot.y = 200;
      robot.crashed = false;

      const result = checkAllConditions(robot);
      expect(result.inZone).toBe(true);
      expect(result.notCrashed).toBe(true);
      expect(result.inBounds).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    test("should handle exactly at boundary values", () => {
      function successCriteria(robot) {
        return robot.x >= 1600;
      }

      robot.x = 1599;
      expect(successCriteria(robot)).toBe(false);

      robot.x = 1600;
      expect(successCriteria(robot)).toBe(true);
    });

    test("should handle negative coordinates", () => {
      function isInBounds(robot) {
        return (
          robot.x >= 0 && robot.x <= 2000 && robot.y >= 0 && robot.y <= 2000
        );
      }

      robot.x = -10;
      expect(isInBounds(robot)).toBe(false);
    });

    test("should handle floating point positions", () => {
      function isInZone(robot) {
        return (
          robot.x >= 100 && robot.x <= 400 && robot.y >= 100 && robot.y <= 300
        );
      }

      robot.x = 100.001;
      robot.y = 100.001;
      expect(isInZone(robot)).toBe(true);
    });
  });

  describe("Progress Tracking", () => {
    test("should track progress towards goal zone", () => {
      function calculateProgress(robot, goalY) {
        const startY = 1700;
        const travelled = startY - robot.y;
        const total = startY - goalY;
        return Math.max(0, Math.min(100, (travelled / total) * 100));
      }

      const goalY = 200;

      // At start
      robot.y = 1700;
      expect(calculateProgress(robot, goalY)).toBeCloseTo(0, 0);

      // Halfway
      robot.y = 950;
      expect(calculateProgress(robot, goalY)).toBeCloseTo(50, 0);

      // At goal
      robot.y = 200;
      expect(calculateProgress(robot, goalY)).toBeCloseTo(100, 0);
    });
  });
});
