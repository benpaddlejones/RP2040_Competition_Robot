/**
 * Challenges Unit Tests
 * Tests for PID wall-following challenge definitions and success criteria
 */

describe("Challenges", () => {
  let ChallengesImpl;

  beforeEach(() => {
    // Create Challenges implementation matching the new PID progression
    ChallengesImpl = {
      list: [
        {
          id: 1,
          name: "Challenge 1: Wall Follow — P Control",
          description:
            "Use the side sensor and P control to follow a straight wall",
          startCode: `from aidriver import AIDriver, hold_state
import aidriver
my_robot = AIDriver()
# P controller wall following`,
          successCriteria: function (robot) {
            return (
              robot.x >= 100 &&
              robot.x <= 400 &&
              robot.y >= 100 &&
              robot.y <= 300
            );
          },
          maze: "straight_corridor",
        },
        {
          id: 2,
          name: "Challenge 2: Wall Follow — PD Control",
          description: "Add the Derivative term to dampen oscillations",
          startCode: `from aidriver import AIDriver, hold_state
import aidriver
my_robot = AIDriver()
# PD controller wall following`,
          successCriteria: function (robot) {
            return (
              robot.x >= 100 &&
              robot.x <= 400 &&
              robot.y >= 100 &&
              robot.y <= 300
            );
          },
          maze: "straight_corridor",
        },
        {
          id: 3,
          name: "Challenge 3: Wall Follow — Full PID",
          description: "Add the Integral term to fix drift around an L corner",
          startCode: `from aidriver import AIDriver, hold_state
import aidriver
my_robot = AIDriver()
# Full PID wall following`,
          successCriteria: function (robot) {
            return (
              robot.x >= 100 &&
              robot.x <= 300 &&
              robot.y >= 100 &&
              robot.y <= 300
            );
          },
          maze: "simple",
        },
        {
          id: 4,
          name: "Challenge 4: Dead End Detection",
          description:
            "Combine front sensor with side PID to navigate dead ends",
          startCode: `from aidriver import AIDriver, hold_state
import aidriver
my_robot = AIDriver()
# Sensor fusion: front + side PID`,
          successCriteria: function (robot) {
            return robot.x >= 1600 && robot.y <= 300;
          },
          maze: "dead_end",
        },
        {
          id: 5,
          name: "Challenge 5: Maze Solver",
          description: "Navigate the full maze using hand-on-wall algorithm",
          startCode: `from aidriver import AIDriver, hold_state
import aidriver
my_robot = AIDriver()
# Hand-on-wall maze solver`,
          successCriteria: function (robot) {
            return robot.x >= 1700 && robot.y <= 300 && !robot.crashed;
          },
          maze: "zigzag",
        },
      ],

      get: function (id) {
        return this.list.find((c) => c.id === id) || null;
      },

      getAll: function () {
        return this.list;
      },

      getCount: function () {
        return this.list.length;
      },

      getNext: function (currentId) {
        const idx = this.list.findIndex((c) => c.id === currentId);
        return idx >= 0 && idx < this.list.length - 1
          ? this.list[idx + 1]
          : null;
      },

      getPrevious: function (currentId) {
        const idx = this.list.findIndex((c) => c.id === currentId);
        return idx > 0 ? this.list[idx - 1] : null;
      },
    };
  });

  describe("Challenge List", () => {
    test("should have 5 challenges", () => {
      expect(ChallengesImpl.getCount()).toBe(5);
    });

    test("challenges should have sequential IDs 1-5", () => {
      for (let i = 1; i <= 5; i++) {
        expect(ChallengesImpl.get(i)).not.toBeNull();
        expect(ChallengesImpl.get(i).id).toBe(i);
      }
    });

    test("each challenge should have required properties", () => {
      ChallengesImpl.getAll().forEach((challenge) => {
        expect(challenge.id).toBeDefined();
        expect(challenge.name).toBeDefined();
        expect(challenge.description).toBeDefined();
        expect(challenge.startCode).toBeDefined();
        expect(typeof challenge.successCriteria).toBe("function");
      });
    });

    test("no challenge 0, 6, or 7 should exist", () => {
      expect(ChallengesImpl.get(0)).toBeNull();
      expect(ChallengesImpl.get(6)).toBeNull();
      expect(ChallengesImpl.get(7)).toBeNull();
    });
  });

  describe("get()", () => {
    test("should return challenge by ID", () => {
      const challenge = ChallengesImpl.get(1);
      expect(challenge).not.toBeNull();
      expect(challenge.id).toBe(1);
    });

    test("should return null for invalid ID", () => {
      expect(ChallengesImpl.get(-1)).toBeNull();
      expect(ChallengesImpl.get(100)).toBeNull();
    });

    test("should return correct challenge data", () => {
      const challenge = ChallengesImpl.get(1);
      expect(challenge.name).toContain("P Control");
    });
  });

  describe("getNext() and getPrevious()", () => {
    test("getNext() should return next challenge", () => {
      const next = ChallengesImpl.getNext(1);
      expect(next).not.toBeNull();
      expect(next.id).toBe(2);
    });

    test("getNext() should return null for last challenge", () => {
      expect(ChallengesImpl.getNext(5)).toBeNull();
    });

    test("getPrevious() should return previous challenge", () => {
      const prev = ChallengesImpl.getPrevious(3);
      expect(prev).not.toBeNull();
      expect(prev.id).toBe(2);
    });

    test("getPrevious() should return null for first challenge", () => {
      expect(ChallengesImpl.getPrevious(1)).toBeNull();
    });
  });

  describe("Success Criteria", () => {
    test("Challenge 1 should succeed when robot reaches end zone", () => {
      const challenge = ChallengesImpl.get(1);
      const robot = { x: 200, y: 150 };
      expect(challenge.successCriteria(robot)).toBe(true);
    });

    test("Challenge 1 should fail if robot at start", () => {
      const challenge = ChallengesImpl.get(1);
      const robot = { x: 300, y: 1700 };
      expect(challenge.successCriteria(robot)).toBe(false);
    });

    test("Challenge 3 should succeed if robot reached L-corner goal", () => {
      const challenge = ChallengesImpl.get(3);
      const robot = { x: 150, y: 150 };
      expect(challenge.successCriteria(robot)).toBe(true);
    });

    test("Challenge 3 should fail if robot hasn't reached goal", () => {
      const challenge = ChallengesImpl.get(3);
      const robot = { x: 300, y: 1700 };
      expect(challenge.successCriteria(robot)).toBe(false);
    });

    test("Challenge 4 should succeed at dead end goal area", () => {
      const challenge = ChallengesImpl.get(4);
      const robot = { x: 1700, y: 150 };
      expect(challenge.successCriteria(robot)).toBe(true);
    });

    test("Challenge 5 should succeed if robot reached maze exit without crash", () => {
      const challenge = ChallengesImpl.get(5);
      const robot = { x: 1800, y: 150, crashed: false };
      expect(challenge.successCriteria(robot)).toBe(true);
    });

    test("Challenge 5 should fail if robot crashed", () => {
      const challenge = ChallengesImpl.get(5);
      const robot = { x: 1800, y: 150, crashed: true };
      expect(challenge.successCriteria(robot)).toBe(false);
    });
  });

  describe("Maze Assignments", () => {
    test("Challenge 1 should use straight_corridor maze", () => {
      expect(ChallengesImpl.get(1).maze).toBe("straight_corridor");
    });

    test("Challenge 2 should use straight_corridor maze", () => {
      expect(ChallengesImpl.get(2).maze).toBe("straight_corridor");
    });

    test("Challenge 3 should use simple (L-shaped) maze", () => {
      expect(ChallengesImpl.get(3).maze).toBe("simple");
    });

    test("Challenge 4 should use dead_end maze", () => {
      expect(ChallengesImpl.get(4).maze).toBe("dead_end");
    });

    test("Challenge 5 should use zigzag maze as default", () => {
      expect(ChallengesImpl.get(5).maze).toBe("zigzag");
    });

    test("all challenges should have a maze", () => {
      ChallengesImpl.getAll().forEach((challenge) => {
        expect(challenge.maze).toBeDefined();
        expect(challenge.maze).not.toBeNull();
      });
    });
  });

  describe("Start Code", () => {
    test("all challenges should have start code", () => {
      ChallengesImpl.getAll().forEach((challenge) => {
        expect(challenge.startCode.length).toBeGreaterThan(0);
      });
    });

    test("start code should include AIDriver import", () => {
      ChallengesImpl.getAll().forEach((challenge) => {
        expect(challenge.startCode).toContain("aidriver");
      });
    });

    test("no challenge should reference gamepad", () => {
      ChallengesImpl.getAll().forEach((challenge) => {
        expect(challenge.startCode.toLowerCase()).not.toContain("gamepad");
      });
    });
  });

  describe("PID Progression", () => {
    test("challenges should progress from P to PD to PID", () => {
      const c1 = ChallengesImpl.get(1);
      const c2 = ChallengesImpl.get(2);
      const c3 = ChallengesImpl.get(3);

      expect(c1.name).toContain("P Control");
      expect(c2.name).toContain("PD Control");
      expect(c3.name).toContain("Full PID");
    });

    test("challenges 4-5 should be sensor fusion and maze solving", () => {
      const c4 = ChallengesImpl.get(4);
      const c5 = ChallengesImpl.get(5);

      expect(c4.name).toContain("Dead End");
      expect(c5.name).toContain("Maze Solver");
    });
  });
});
