/**
 * AIDriver Simulator - Physics and Robot Simulation Module
 * Handles differential drive kinematics, collision detection, and sensor simulation
 */

const Simulator = (function () {
  "use strict";

  // Physical constants (mm and ms units)
  const WHEEL_DIAMETER = 65; // mm
  const WHEEL_CIRCUMFERENCE = Math.PI * WHEEL_DIAMETER; // ~204.2mm
  const WHEEL_BASE = 120; // Distance between wheels (mm)
  const MAX_MOTOR_SPEED = 255; // Maximum motor speed value
  const MM_PER_SPEED_UNIT = 0.8; // mm per frame at speed=1

  // Arena dimensions
  const ARENA_WIDTH = 2000; // mm
  const ARENA_HEIGHT = 2000; // mm
  const ROBOT_WIDTH = 120; // mm
  const ROBOT_LENGTH = 150; // mm

  // Ultrasonic sensor
  const ULTRASONIC_MIN = 20; // mm minimum detection
  const ULTRASONIC_MAX = 2000; // mm maximum detection
  const ULTRASONIC_CONE_ANGLE = 15; // degrees half-angle

  // Side sensor placement: "left" or "right" (relative to robot heading)
  let sideSensorSide = "left";

  // Simulation state
  let lastUpdateTime = 0;
  let simulationSpeed = 1.0;
  let obstacles = [];
  let mazeWalls = [];

  /**
   * Integrate a single timestep of differential-drive motion for the supplied
   * robot state. Converts discrete motor speed values into linear and angular
   * velocities, updates the heading, and returns a new state without mutating
   * the original reference.
   *
   * @param {{x:number,y:number,heading:number,leftSpeed:number,rightSpeed:number}} robot Current robot pose and wheel speeds.
   * @param {number} dt Elapsed time in seconds since the previous update.
   * @returns {{x:number,y:number,heading:number,leftSpeed:number,rightSpeed:number}} Fresh state snapshot after applying kinematics.
   */
  function updateKinematics(robot, dt) {
    const leftSpeed = robot.leftSpeed;
    const rightSpeed = robot.rightSpeed;

    // Convert motor speed to wheel velocity (mm/s)
    const leftVelocity =
      (leftSpeed / MAX_MOTOR_SPEED) *
      MM_PER_SPEED_UNIT *
      1000 *
      simulationSpeed;
    const rightVelocity =
      (rightSpeed / MAX_MOTOR_SPEED) *
      MM_PER_SPEED_UNIT *
      1000 *
      simulationSpeed;

    // Differential drive kinematics
    // v = (vR + vL) / 2  - linear velocity
    // ω = (vR - vL) / L  - angular velocity

    const linearVelocity = (leftVelocity + rightVelocity) / 2;
    const angularVelocity = (rightVelocity - leftVelocity) / WHEEL_BASE;

    // Update heading (in radians for calculation)
    const headingRad = (robot.heading * Math.PI) / 180;
    const newHeadingRad = headingRad + angularVelocity * dt;

    // Calculate new position
    let newX, newY;

    if (Math.abs(angularVelocity) < 0.001) {
      // Straight line motion
      newX = robot.x + linearVelocity * Math.sin(headingRad) * dt;
      newY = robot.y - linearVelocity * Math.cos(headingRad) * dt;
    } else {
      // Arc motion
      const R = linearVelocity / angularVelocity;
      newX = robot.x + R * (Math.cos(headingRad) - Math.cos(newHeadingRad));
      newY = robot.y - R * (Math.sin(newHeadingRad) - Math.sin(headingRad));
    }

    // Convert heading back to degrees
    let newHeading = (newHeadingRad * 180) / Math.PI;

    // Normalize heading to 0-360
    newHeading = ((newHeading % 360) + 360) % 360;

    return {
      ...robot,
      x: newX,
      y: newY,
      heading: newHeading,
    };
  }

  /**
   * Clamp the robot position so it remains entirely within the rectangular
   * arena. Accounts for the robot footprint rather than just its centre point
   * to prevent clipping through walls when positioned near an edge.
   *
   * @param {{x:number,y:number}} robot Robot state to constrain.
   * @returns {{x:number,y:number}} New state with x/y clamped to arena bounds.
   */
  function applyBoundaryConstraints(robot) {
    const halfWidth = ROBOT_WIDTH / 2;
    const halfLength = ROBOT_LENGTH / 2;
    const maxRadius = Math.max(halfWidth, halfLength);

    return {
      ...robot,
      x: Math.max(maxRadius, Math.min(ARENA_WIDTH - maxRadius, robot.x)),
      y: Math.max(maxRadius, Math.min(ARENA_HEIGHT - maxRadius, robot.y)),
    };
  }

  /**
   * Determine whether the robot intersects any supplied obstacle rectangles.
   * Robot geometry is approximated as a rotated rectangle while obstacles are
   * treated as axis-aligned boxes.
   *
   * @param {{x:number,y:number,heading:number}} robot Robot pose to test.
   * @param {Array<{x:number,y:number,width:number,height:number}>} obstacles List of potential collision boxes.
   * @returns {boolean} True if any overlap is detected.
   */
  function checkCollision(robot, obstacles) {
    const robotCorners = getRobotCorners(robot);

    for (const obstacle of obstacles) {
      if (rectanglesOverlap(robotCorners, obstacle)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Compute the four world-space corner coordinates of the robot chassis using
   * its current heading. The result feeds collision and rendering routines.
   *
   * @param {{x:number,y:number,heading:number}} robot Current robot pose.
   * @returns {Array<{x:number,y:number}>} Ordered corner list starting at front-left and rotating clockwise.
   */
  function getRobotCorners(robot) {
    const halfWidth = ROBOT_WIDTH / 2;
    const halfLength = ROBOT_LENGTH / 2;
    const headingRad = (robot.heading * Math.PI) / 180;

    const cos = Math.cos(headingRad);
    const sin = Math.sin(headingRad);

    // Local corners (relative to center)
    const localCorners = [
      { x: -halfWidth, y: -halfLength },
      { x: halfWidth, y: -halfLength },
      { x: halfWidth, y: halfLength },
      { x: -halfWidth, y: halfLength },
    ];

    // Transform to world coordinates
    return localCorners.map((c) => ({
      x: robot.x + c.x * cos - c.y * sin,
      y: robot.y + c.x * sin + c.y * cos,
    }));
  }

  /**
   * Test whether the axis-aligned bounding box of a rotated robot overlaps a
   * second, axis-aligned rectangle. Used as a coarse but efficient collision
   * check.
   *
   * @param {Array<{x:number,y:number}>} corners1 Rotated rectangle corners in world space.
   * @param {{x:number,y:number,width:number,height:number}} rect2 Static axis-aligned rectangle to compare against.
   * @returns {boolean} True when bounding boxes intersect.
   */
  function rectanglesOverlap(corners1, rect2) {
    // Get AABB of rotated robot
    const xs = corners1.map((c) => c.x);
    const ys = corners1.map((c) => c.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Check against obstacle AABB
    const rect2MinX = rect2.x;
    const rect2MaxX = rect2.x + rect2.width;
    const rect2MinY = rect2.y;
    const rect2MaxY = rect2.y + rect2.height;

    return !(
      maxX < rect2MinX ||
      minX > rect2MaxX ||
      maxY < rect2MinY ||
      minY > rect2MaxY
    );
  }

  /**
   * Simulate the front-facing ultrasonic sensor, tracing a ray from the robot
   * nose outwards and returning the closest hit among arena walls, obstacles,
   * and maze segments. Adds small random noise and reports -1 when outside the
   * measurable range.
   *
   * @param {{x:number,y:number,heading:number}} robot Robot pose to sample.
   * @returns {number} Millimetres to the nearest surface or -1 when no valid reading.
   */
  function simulateUltrasonic(robot) {
    const headingRad = (robot.heading * Math.PI) / 180;

    // Sensor position (front center of robot)
    const sensorX = robot.x + Math.sin(headingRad) * (ROBOT_LENGTH / 2);
    const sensorY = robot.y - Math.cos(headingRad) * (ROBOT_LENGTH / 2);

    // Ray direction
    const rayDirX = Math.sin(headingRad);
    const rayDirY = -Math.cos(headingRad);

    // Check distance to walls
    let minDistance = ULTRASONIC_MAX + 1;

    // Top wall (y = 0)
    if (rayDirY < 0) {
      const t = -sensorY / rayDirY;
      if (t > 0 && t < minDistance) {
        minDistance = t;
      }
    }

    // Bottom wall (y = ARENA_HEIGHT)
    if (rayDirY > 0) {
      const t = (ARENA_HEIGHT - sensorY) / rayDirY;
      if (t > 0 && t < minDistance) {
        minDistance = t;
      }
    }

    // Left wall (x = 0)
    if (rayDirX < 0) {
      const t = -sensorX / rayDirX;
      if (t > 0 && t < minDistance) {
        minDistance = t;
      }
    }

    // Right wall (x = ARENA_WIDTH)
    if (rayDirX > 0) {
      const t = (ARENA_WIDTH - sensorX) / rayDirX;
      if (t > 0 && t < minDistance) {
        minDistance = t;
      }
    }

    // Check distance to obstacles
    for (const obstacle of obstacles) {
      const obstDist = rayBoxIntersection(
        sensorX,
        sensorY,
        rayDirX,
        rayDirY,
        obstacle.x,
        obstacle.y,
        obstacle.width,
        obstacle.height,
      );
      if (obstDist !== null && obstDist < minDistance) {
        minDistance = obstDist;
      }
    }

    // Check distance to maze walls
    for (const wall of mazeWalls) {
      const wallDist = rayBoxIntersection(
        sensorX,
        sensorY,
        rayDirX,
        rayDirY,
        wall.x,
        wall.y,
        wall.width,
        wall.height,
      );
      if (wallDist !== null && wallDist < minDistance) {
        minDistance = wallDist;
      }
    }

    // Apply sensor limits
    if (minDistance < ULTRASONIC_MIN) {
      return -1; // Too close
    }
    if (minDistance > ULTRASONIC_MAX) {
      return -1; // Too far / no reading
    }

    // Add some noise (±2mm)
    const noise = (Math.random() - 0.5) * 4;
    return Math.round(minDistance + noise);
  }

  /**
   * Simulate the side-facing ultrasonic sensor mounted perpendicular to the
   * robot chassis. The side is determined by the current sideSensorSide
   * setting ("left" or "right"). Uses the same ray-casting logic as the
   * front sensor but fires the ray at 90 degrees relative to the heading.
   *
   * @param {{x:number,y:number,heading:number}} robot Robot pose to sample.
   * @returns {number} Millimetres to the nearest surface or -1 when no valid reading.
   */
  function simulateUltrasonicSide(robot) {
    const headingRad = (robot.heading * Math.PI) / 180;

    // The simulator uses a heading convention where forward is
    //   (sin(heading), -cos(heading)).
    // The perpendicular directions in this system are:
    //   Left  = (-cos(heading), -sin(heading))
    //   Right = ( cos(heading),  sin(heading))
    let rayDirX, rayDirY;
    if (sideSensorSide === "left") {
      rayDirX = -Math.cos(headingRad);
      rayDirY = -Math.sin(headingRad);
    } else {
      rayDirX = Math.cos(headingRad);
      rayDirY = Math.sin(headingRad);
    }

    // Sensor position: centre of the relevant side of the robot body
    const sensorX = robot.x + rayDirX * (ROBOT_WIDTH / 2);
    const sensorY = robot.y + rayDirY * (ROBOT_WIDTH / 2);

    // Check distance to walls
    let minDistance = ULTRASONIC_MAX + 1;

    // Top wall (y = 0)
    if (rayDirY < 0) {
      const t = -sensorY / rayDirY;
      if (t > 0 && t < minDistance) {
        minDistance = t;
      }
    }

    // Bottom wall (y = ARENA_HEIGHT)
    if (rayDirY > 0) {
      const t = (ARENA_HEIGHT - sensorY) / rayDirY;
      if (t > 0 && t < minDistance) {
        minDistance = t;
      }
    }

    // Left wall (x = 0)
    if (rayDirX < 0) {
      const t = -sensorX / rayDirX;
      if (t > 0 && t < minDistance) {
        minDistance = t;
      }
    }

    // Right wall (x = ARENA_WIDTH)
    if (rayDirX > 0) {
      const t = (ARENA_WIDTH - sensorX) / rayDirX;
      if (t > 0 && t < minDistance) {
        minDistance = t;
      }
    }

    // Check distance to obstacles
    for (const obstacle of obstacles) {
      const obstDist = rayBoxIntersection(
        sensorX,
        sensorY,
        rayDirX,
        rayDirY,
        obstacle.x,
        obstacle.y,
        obstacle.width,
        obstacle.height,
      );
      if (obstDist !== null && obstDist < minDistance) {
        minDistance = obstDist;
      }
    }

    // Check distance to maze walls
    for (const wall of mazeWalls) {
      const wallDist = rayBoxIntersection(
        sensorX,
        sensorY,
        rayDirX,
        rayDirY,
        wall.x,
        wall.y,
        wall.width,
        wall.height,
      );
      if (wallDist !== null && wallDist < minDistance) {
        minDistance = wallDist;
      }
    }

    // Apply sensor limits
    if (minDistance < ULTRASONIC_MIN) {
      return -1; // Too close
    }
    if (minDistance > ULTRASONIC_MAX) {
      return -1; // Too far / no reading
    }

    // Add some noise (±2mm)
    const noise = (Math.random() - 0.5) * 4;
    return Math.round(minDistance + noise);
  }

  /**
   * Set which side the secondary ultrasonic sensor is mounted on.
   * @param {"left"|"right"} side The side to mount the sensor.
   */
  function setSideSensorSide(side) {
    if (side === "left" || side === "right") {
      sideSensorSide = side;
    }
  }

  /**
   * Get the current side sensor placement.
   * @returns {"left"|"right"} Current side sensor side.
   */
  function getSideSensorSide() {
    return sideSensorSide;
  }

  /**
   * Compute the parametric distance from a ray origin to an axis-aligned box.
   * Returns null when the ray misses or faces away from the volume.
   *
   * @param {number} rayX Ray origin X coordinate.
   * @param {number} rayY Ray origin Y coordinate.
   * @param {number} dirX Normalised ray direction X component.
   * @param {number} dirY Normalised ray direction Y component.
   * @param {number} boxX Box minimum X.
   * @param {number} boxY Box minimum Y.
   * @param {number} boxW Box width.
   * @param {number} boxH Box height.
   * @returns {number|null} Parametric distance to first intersection, or null if no hit.
   */
  function rayBoxIntersection(rayX, rayY, dirX, dirY, boxX, boxY, boxW, boxH) {
    let tmin = 0;
    let tmax = Infinity;

    // X slab
    if (Math.abs(dirX) > 0.0001) {
      const t1 = (boxX - rayX) / dirX;
      const t2 = (boxX + boxW - rayX) / dirX;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    } else if (rayX < boxX || rayX > boxX + boxW) {
      return null;
    }

    // Y slab
    if (Math.abs(dirY) > 0.0001) {
      const t1 = (boxY - rayY) / dirY;
      const t2 = (boxY + boxH - rayY) / dirY;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    } else if (rayY < boxY || rayY > boxY + boxH) {
      return null;
    }

    if (tmin > tmax || tmax < 0) {
      return null;
    }

    return tmin > 0 ? tmin : tmax;
  }

  /**
   * Advance the simulator by one frame, applying kinematics, boundary
   * clamping, collision detection, and trail bookkeeping. Stops the robot when
   * a collision is detected and logs the event to the debug panel.
   *
   * @param {{isMoving:boolean,leftSpeed:number,rightSpeed:number,trail:Array<object>}} robot Current robot state snapshot.
   * @param {number} dt Delta time in seconds since the previous frame.
   * @returns {object} New robot state with updated pose, speeds, and trail samples.
   */
  function step(robot, dt) {
    if (!robot.isMoving && robot.leftSpeed === 0 && robot.rightSpeed === 0) {
      return robot;
    }

    // Update kinematics
    let newState = updateKinematics(robot, dt);

    // Apply boundary constraints
    newState = applyBoundaryConstraints(newState);

    // Check collisions
    if (checkCollision(newState, obstacles.concat(mazeWalls))) {
      // Stop on collision
      newState.leftSpeed = 0;
      newState.rightSpeed = 0;
      newState.isMoving = false;

      if (typeof DebugPanel !== "undefined") {
        DebugPanel.warning("Robot collision detected!");
      }
    }

    // Update trail
    newState.trail = [...(robot.trail || []), { x: newState.x, y: newState.y }];
    if (newState.trail.length > 1000) {
      newState.trail = newState.trail.slice(-1000);
    }

    return newState;
  }

  /**
   * Set the global simulation speed multiplier, constraining values to a safe
   * range so physics remain stable.
   *
   * @param {number} speed Desired speed factor where 1.0 represents real time.
   */
  function setSpeed(speed) {
    simulationSpeed = Math.max(0.1, Math.min(5.0, speed));
  }

  /**
   * Replace the current obstacle list used for collision detection.
   *
   * @param {Array<{x:number,y:number,width:number,height:number}>} obstacleList Obstacles to track; falsy values clear the list.
   */
  function setObstacles(obstacleList) {
    obstacles = obstacleList || [];
  }

  /**
   * Replace the maze wall collection, typically supplied by challenge data.
   *
   * @param {Array<{x:number,y:number,width:number,height:number}>} walls Walls to enable; falsy values clear the wall list.
   */
  function setMazeWalls(walls) {
    mazeWalls = walls || [];
  }

  /**
   * Remove every obstacle and maze wall, restoring an empty arena.
   */
  function clearObstacles() {
    obstacles = [];
    mazeWalls = [];
  }

  /**
   * Generate the canonical starting robot state positioned near the arena
   * bottom, facing upward, with no motion or trail history.
   *
   * @returns {{x:number,y:number,heading:number,leftSpeed:number,rightSpeed:number,isMoving:boolean,trail:Array<object>}} Default robot state snapshot.
   */
  function getInitialRobotState() {
    return {
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT - 200, // Near bottom
      heading: 0, // Facing up
      leftSpeed: 0,
      rightSpeed: 0,
      isMoving: false,
      trail: [],
    };
  }

  // Public API
  return {
    // Constants
    ARENA_WIDTH,
    ARENA_HEIGHT,
    ROBOT_WIDTH,
    ROBOT_LENGTH,
    ULTRASONIC_MIN,
    ULTRASONIC_MAX,

    // Methods
    step,
    simulateUltrasonic,
    simulateUltrasonicSide,
    checkCollision,
    getRobotCorners,
    setSpeed,
    setObstacles,
    setMazeWalls,
    clearObstacles,
    getInitialRobotState,
    applyBoundaryConstraints,
    setSideSensorSide,
    getSideSensorSide,
  };
})();
