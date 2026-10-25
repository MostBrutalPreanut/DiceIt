// World units: 1 unit is roughly one ball diameter (27 mm of a real table).
// y points up in the sim; the renderer flips it.
export const TABLE_W = 22;
export const TABLE_H = 44;
export const BALL_R = 0.5;

/**
 * Fixed simulation step. 240 Hz because flipper tunnelling is a function of the timestep, not of
 * substeps (see docs/m0-physics-findings.md). The renderer draws the latest state.
 */
export const DT = 1 / 240;
export const SUBSTEPS = 4;

export const DEFAULT_GRAVITY = 50;
export const MAX_BALL_SPEED = 220;

export const LANE_X = 21;
export const LANE_FLOOR_Y = 2;
export const BALL_SPAWN = { x: LANE_X, y: LANE_FLOOR_Y + BALL_R + 0.05 };
export const PLUNGE_MIN = 28;
export const PLUNGE_MAX = 115;
export const PLUNGE_CHARGE_TIME = 1.0;

export const FLIPPER_LENGTH = 4.2;
export const FLIPPER_REST = 0.49;
export const FLIPPER_UP = 0.45;
export const FLIPPER_SPEED_UP = 38;
export const FLIPPER_SPEED_DOWN = 22;
export const FLIPPER_TORQUE = 60000;

/** Build area for placed parts (the rest of the table is protected). */
export const BUILD_AREA = { x0: 2.5, x1: 17.5, y0: 12, y1: 36.5 };

export const BALL_SEARCH_AFTER = 3.5;
export const BALL_TIMEOUT = 90;
export const NUDGE_SPEED = 7;
export const NUDGE_TILT = 0.4;
export const TILT_DECAY = 0.3;
