/**
 * AIDriver Simulator - Challenge Definitions
 * PID wall-following progression: 5 challenges building to full maze solving
 */

const Challenges = (function () {
  "use strict";

  // Challenge difficulty colors
  const DIFFICULTY = {
    BEGINNER: "success",
    EASY: "info",
    MEDIUM: "warning",
    HARD: "danger",
  };

  /**
   * Comprehensive challenge definitions keyed by identifier.
   * Consumers should treat this object as immutable runtime configuration.
   */
  const definitions = {
    // Debug Script: Hardware test from project/main.py
    debug: {
      id: "debug",
      title: "Debug Script",
      subtitle: "Hardware Test",
      icon: "bi-bug",
      menuGroup: "special",
      difficulty: DIFFICULTY.BEGINNER,
      description:
        "Run the hardware debug script (project/main.py) to test all robot functions.",
      goal: "Verify motors, sensors, and the drive() method are working correctly.",
      hints: [
        "This script tests all hardware functions",
        "Watch the robot drive forward, backward, rotate, and read distances",
        "Check the debug output for front and side sensor readings",
      ],
      startPosition: { x: 1000, y: 1800, heading: 0 },
      successCriteria: {
        type: "run_without_error",
        minDistance: 100,
      },
      path: null,
      obstacles: [],
    },

    // Challenge 1: P Controller — Wall Following in a Straight Corridor
    1: {
      id: 1,
      title: "Wall Follow — P Control",
      subtitle: "Proportional Steering",
      icon: "bi-arrow-up",
      menuGroup: "basic",
      difficulty: DIFFICULTY.BEGINNER,
      description:
        "Use the side ultrasonic sensor and Proportional control to follow a straight wall.",
      goal: "Follow the wall from start to the green exit zone without hitting it.",
      hints: [
        "read_distance_2() reads the side ultrasonic sensor",
        "error = wall_distance - TARGET_WALL_DISTANCE",
        "steering = Kp * error adjusts wheel speed difference",
        "Keep BASE_SPEED - MAX_STEERING >= 120 (dead zone)",
        "drive() handles signed speeds and the dead zone automatically",
      ],
      startPosition: { x: 300, y: 1700, heading: 0 },
      successCriteria: {
        type: "reach_zone",
        zone: { x: 100, y: 100, width: 300, height: 200 },
      },
      path: null,
      obstacles: [],
      maze: "straight_corridor",
    },

    // Challenge 2: PD Controller — Off-Centre Start
    2: {
      id: 2,
      title: "Wall Follow — PD Control",
      subtitle: "Dampen Oscillations",
      icon: "bi-activity",
      menuGroup: "basic",
      difficulty: DIFFICULTY.EASY,
      description:
        "Add the Derivative term to dampen oscillations when starting off-centre.",
      goal: "Follow the wall smoothly to the exit zone — P alone will oscillate.",
      hints: [
        "derivative = error - previous_error",
        "steering = (Kp * error) + (Kd * derivative)",
        "D opposes rapid change — it slows approach and reduces overshoot",
        "Start with Kd = 0.3, then tune",
        "Remember to save previous_error each loop",
      ],
      startPosition: { x: 150, y: 1700, heading: 10 },
      successCriteria: {
        type: "reach_zone",
        zone: { x: 100, y: 100, width: 300, height: 200 },
      },
      path: null,
      obstacles: [],
      maze: "straight_corridor",
    },

    // Challenge 3: Full PID — L-Shaped Corridor
    3: {
      id: 3,
      title: "Wall Follow — Full PID",
      subtitle: "Integral Correction",
      icon: "bi-bezier2",
      menuGroup: "basic",
      difficulty: DIFFICULTY.MEDIUM,
      description:
        "Add the Integral term to correct steady-state drift around an L-shaped corner.",
      goal: "Follow the wall around the L corner to the exit zone.",
      hints: [
        "integral = integral + error — accumulated error over time",
        "steering = (Kp * error) + (Ki * integral) + (Kd * derivative)",
        "Keep Ki very small (start 0.01) to avoid windup",
        "Clamp integral to INTEGRAL_MAX to prevent runaway",
        "Reset integral to 0 when sensor returns -1",
      ],
      startPosition: { x: 300, y: 1700, heading: 0 },
      successCriteria: {
        type: "reach_zone",
        zone: { x: 100, y: 100, width: 200, height: 200 },
      },
      path: null,
      obstacles: [],
      maze: "simple",
    },

    // Challenge 4: Front + Side Sensors — Dead End Detection
    4: {
      id: 4,
      title: "Dead End Detection",
      subtitle: "Sensor Fusion",
      icon: "bi-sign-turn-right",
      menuGroup: "advanced",
      difficulty: DIFFICULTY.MEDIUM,
      description:
        "Combine the front sensor with side PID to detect and navigate past a dead end.",
      goal: "Follow the wall, detect the dead end, turn, and reach the exit.",
      hints: [
        "Use read_distance() for the front sensor — detects the dead end",
        "If front < FRONT_THRESHOLD → stop, turn, then continue wall following",
        "Reset integral and previous_error after turning",
        "Use read_distance_2() for side PID as before",
        "Think: wall ahead → turn; wall beside → PID follow",
      ],
      startPosition: { x: 300, y: 1700, heading: 0 },
      successCriteria: {
        type: "reach_zone",
        zone: { x: 1600, y: 100, width: 300, height: 200 },
      },
      path: null,
      obstacles: [],
      maze: "dead_end",
    },

    // Challenge 5: Full Maze Solving — Hand on Wall
    5: {
      id: 5,
      title: "Maze Solver",
      subtitle: "Hand-on-Wall",
      icon: "bi-signpost-split",
      menuGroup: "advanced",
      difficulty: DIFFICULTY.HARD,
      description:
        "Navigate the full maze using PID wall following and the hand-on-wall algorithm.",
      goal: "Reach the exit zone without hitting walls. Time limit: 60 seconds.",
      hints: [
        "Hand-on-wall: keep one hand touching the wall at all times",
        "Priority 1: Wall ahead → stop and turn away",
        "Priority 2: Lost the wall (side = -1) → gentle turn toward it",
        "Priority 3: Wall visible → PID follow as before",
        "Choose right-hand or left-hand rule and be consistent",
        "Use the maze selector to try different difficulty levels",
      ],
      startPosition: { x: 300, y: 1700, heading: 0 },
      successCriteria: {
        type: "reach_zone",
        zone: { x: 1700, y: 100, width: 200, height: 200 },
        timeLimit: 60,
      },
      path: null,
      obstacles: [],
      maze: "zigzag",
    },
  };

  /**
   * Retrieve a challenge definition by identifier, falling back to challenge 0 when missing.
   * @param {number|string} id Challenge identifier; accepts numeric or string ids.
   * @returns {object} Challenge metadata including paths, goals, and criteria.
   */
  function get(id) {
    return definitions[id] || definitions[1];
  }

  /**
   * Access the full definitions map for read-only operations.
   * @returns {Record<string, object>} Dictionary of challenge definitions keyed by id.
   */
  function getAll() {
    return definitions;
  }

  /**
   * Count the total number of registered challenges.
   * @returns {number} Total challenge entries including debug script.
   */
  function count() {
    return Object.keys(definitions).length;
  }

  /**
   * Evaluate the robot state against the challenge-specific success criteria.
   * @param {number|string} challengeId Identifier of the active challenge.
   * @param {{x:number,y:number,leftSpeed:number,rightSpeed:number,heading?:number}} robotState Latest simulator robot snapshot.
   * @param {object} sessionData Aggregated telemetry captured during the run.
   * @returns {{success:boolean,message:string}} Result with user-facing feedback.
   */
  function checkSuccess(challengeId, robotState, sessionData) {
    const challenge = get(challengeId);
    const criteria = challenge.successCriteria;

    switch (criteria.type) {
      case "run_without_error":
        return checkRunWithoutError(robotState, sessionData, criteria);

      case "reach_zone":
        return checkReachZone(robotState, criteria);

      case "complete_circle":
        return checkCompleteCircle(robotState, sessionData, criteria);

      case "stop_at_distance":
        return checkStopAtDistance(robotState, criteria);

      case "return_to_start":
        return checkReturnToStart(robotState, sessionData, criteria);

      case "figure_eight":
        return checkFigureEight(robotState, sessionData, criteria);

      case "manual":
        return { success: false, message: "Manual mode - no auto-check" };

      default:
        return { success: false, message: "Unknown criteria type" };
    }
  }

  /**
   * Determine whether the run completed error-free and covered the minimum distance.
   * @param {{x:number,y:number}} robot Current robot coordinates.
   * @param {{hasError?:boolean,startPosition?:{x:number,y:number}}} session Session metrics for the attempt.
   * @param {{minDistance:number}} criteria Success constraint for movement.
   * @returns {{success:boolean,message:string}} Evaluation outcome.
   */
  function checkRunWithoutError(robot, session, criteria) {
    if (session.hasError) {
      return { success: false, message: "Code has errors" };
    }

    const startPos = session.startPosition || { x: robot.x, y: robot.y };
    const distance = Math.hypot(robot.x - startPos.x, robot.y - startPos.y);

    if (distance < criteria.minDistance) {
      return {
        success: false,
        message: `Move at least ${criteria.minDistance}mm`,
      };
    }

    return { success: true, message: "Code runs correctly!" };
  }

  /**
   * Determine whether the robot currently resides inside the configured zone.
   * @param {{x:number,y:number}} robot Current robot coordinates.
   * @param {{zone:{x:number,y:number,width:number,height:number}}} criteria Zone dimensions to evaluate.
   * @returns {{success:boolean,message:string}} Evaluation outcome.
   */
  function checkReachZone(robot, criteria) {
    const zone = criteria.zone;
    const inZone =
      robot.x >= zone.x &&
      robot.x <= zone.x + zone.width &&
      robot.y >= zone.y &&
      robot.y <= zone.y + zone.height;

    if (inZone) {
      return { success: true, message: "Target zone reached!" };
    }

    return {
      success: false,
      message: "Reach the green target zone",
    };
  }

  /**
   * Confirm the robot completed sufficient rotation and returned near its start point.
   * @param {{x:number,y:number}} robot Current robot coordinates.
   * @param {{startPosition:{x:number,y:number},totalRotation?:number}} session Session metrics.
   * @param {{minRotation:number,centerTolerance:number}} criteria Circle completion bounds.
   * @returns {{success:boolean,message:string}} Evaluation outcome.
   */
  function checkCompleteCircle(robot, session, criteria) {
    const startPos = session.startPosition;
    const totalRotation = session.totalRotation || 0;

    if (Math.abs(totalRotation) < criteria.minRotation) {
      return {
        success: false,
        message: `Complete more rotation (${Math.abs(totalRotation).toFixed(
          0,
        )}° / ${criteria.minRotation}°)`,
      };
    }

    const distanceFromStart = Math.hypot(
      robot.x - startPos.x,
      robot.y - startPos.y,
    );
    if (distanceFromStart > criteria.centerTolerance) {
      return {
        success: false,
        message: `Return closer to start (${distanceFromStart.toFixed(
          0,
        )}mm away)`,
      };
    }

    return { success: true, message: "Circle completed!" };
  }

  /**
   * Verify the robot has stopped and is within the prescribed distance window from the wall.
   * @param {{x:number,y:number,leftSpeed:number,rightSpeed:number}} robot Robot state including wheel speeds.
   * @param {{wallPosition:number,targetDistance:{min:number,max:number}}} criteria Distance tolerances.
   * @returns {{success:boolean,message:string}} Evaluation outcome.
   */
  function checkStopAtDistance(robot, criteria) {
    const distanceToWall = robot.y - criteria.wallPosition;
    const isStopped = robot.leftSpeed === 0 && robot.rightSpeed === 0;

    if (!isStopped) {
      return { success: false, message: "Robot must stop" };
    }

    if (distanceToWall < criteria.targetDistance.min) {
      return { success: false, message: "Too close to wall!" };
    }

    if (distanceToWall > criteria.targetDistance.max) {
      return {
        success: false,
        message: `Get closer to wall (${distanceToWall.toFixed(0)}mm)`,
      };
    }

    return { success: true, message: "Perfect stop!" };
  }

  /**
   * Validate the robot reached the top of the arena and returned to the origin zone.
   * @param {{x:number,y:number}} robot Current robot coordinates.
   * @param {{minY?:number}} session Session tracking with minY metric.
   * @param {{startZone:{x:number,y:number,width:number,height:number},mustReachTop:number}} criteria Required movement bounds.
   * @returns {{success:boolean,message:string}} Evaluation outcome.
   */
  function checkReturnToStart(robot, session, criteria) {
    const zone = criteria.startZone;
    const inStartZone =
      robot.x >= zone.x &&
      robot.x <= zone.x + zone.width &&
      robot.y >= zone.y &&
      robot.y <= zone.y + zone.height;

    // Check if reached top
    const reachedTop = session.minY && session.minY <= criteria.mustReachTop;

    if (!reachedTop) {
      return { success: false, message: "Drive to the top first" };
    }

    if (!inStartZone) {
      return { success: false, message: "Return to the starting area" };
    }

    return { success: true, message: "U-turn complete!" };
  }

  /**
   * Assess figure-eight completion by crossover counts and cumulative rotation.
   * @param {{}} robot Robot state (position not directly used).
   * @param {{crossoverCount?:number,totalRotation?:number}} session Session metrics captured during run.
   * @param {{crossoverCount:number,minRotation:number}} criteria Figure-eight thresholds.
   * @returns {{success:boolean,message:string}} Evaluation outcome.
   */
  function checkFigureEight(robot, session, criteria) {
    const crossovers = session.crossoverCount || 0;
    const totalRotation = Math.abs(session.totalRotation || 0);

    if (crossovers < criteria.crossoverCount) {
      return {
        success: false,
        message: `Cross the center more (${crossovers}/${criteria.crossoverCount})`,
      };
    }

    if (totalRotation < criteria.minRotation) {
      return {
        success: false,
        message: `Complete more turns (${totalRotation.toFixed(0)}° / ${
          criteria.minRotation
        }°)`,
      };
    }

    return { success: true, message: "Figure 8 complete!" };
  }

  /**
   * Build the HTML string representing the grouped challenge dropdown menu.
   * @param {"simulator"|"docs"} [menuType="simulator"] Determines link targets within the menu.
   * @returns {string} HTML snippet for insertion into dropdown menus.
   */
  function generateMenuHTML(menuType = "simulator") {
    const groups = { special: [], basic: [], advanced: [] };

    // Sort challenges into groups
    Object.values(definitions).forEach((challenge) => {
      const group = challenge.menuGroup || "basic";
      if (groups[group]) {
        groups[group].push(challenge);
      }
    });

    let html = "";

    // Special group (debug script) - shown first with divider after
    groups.special.forEach((c) => {
      const href =
        menuType === "docs"
          ? `docs.html?doc=Challenge_${c.id}`
          : `simulator.html?challenge=${c.id}`;
      html += `<li><a class="dropdown-item" href="${href}" data-challenge="${c.id}">`;
      html += `<i class="bi ${c.icon} me-2"></i>${c.title}`;
      html += `</a></li>`;
    });

    if (groups.special.length > 0) {
      html += `<li><hr class="dropdown-divider" /></li>`;
    }

    // Basic group (challenges 1-3: P, PD, PID)
    groups.basic.forEach((c) => {
      const href =
        menuType === "docs"
          ? `docs.html?doc=Challenge_${c.id}`
          : `simulator.html?challenge=${c.id}`;
      const label =
        typeof c.id === "number" ? `Challenge ${c.id}: ${c.title}` : c.title;
      html += `<li><a class="dropdown-item" href="${href}" data-challenge="${c.id}">`;
      html += `<i class="bi ${c.icon} me-2"></i>${label}`;
      html += `</a></li>`;
    });

    if (groups.advanced.length > 0) {
      html += `<li><hr class="dropdown-divider" /></li>`;
    }

    // Advanced group (challenges 4-5: sensor fusion, maze)
    groups.advanced.forEach((c) => {
      const href =
        menuType === "docs"
          ? `docs.html?doc=Challenge_${c.id}`
          : `simulator.html?challenge=${c.id}`;
      const label =
        typeof c.id === "number" ? `Challenge ${c.id}: ${c.title}` : c.title;
      html += `<li><a class="dropdown-item" href="${href}" data-challenge="${c.id}">`;
      html += `<i class="bi ${c.icon} me-2"></i>${label}`;
      html += `</a></li>`;
    });

    return html;
  }

  /**
   * Inject generated challenge menu HTML into the targeted list element.
   * @param {string} selector CSS selector for the container element.
   * @param {"simulator"|"docs"} [menuType="simulator"] Link mode determining menu destination.
   * @returns {void}
   */
  function populateMenu(selector, menuType = "simulator") {
    const menuEl = document.querySelector(selector);
    if (menuEl) {
      menuEl.innerHTML = generateMenuHTML(menuType);
    }
  }

  // Public API
  return {
    get,
    getAll,
    count,
    checkSuccess,
    generateMenuHTML,
    populateMenu,
    DIFFICULTY,
  };
})();
