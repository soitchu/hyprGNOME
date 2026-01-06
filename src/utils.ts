import { WindowDirection } from "./Window.js";

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Rect = Position & Size;

export function getQuadrant(windowRect: Rect, pointer: Position): WindowDirection {
  // Find what edge the mouse is closest  (in percentage)
  const distances = {
    left: (pointer.x - windowRect.x) / windowRect.width,
    right: (windowRect.x + windowRect.width - pointer.x) / windowRect.width,
    top: (pointer.y - windowRect.y) / windowRect.height,
    bottom: (windowRect.y + windowRect.height - pointer.y) / windowRect.height,
  };

  const closestEdge = Object.entries(distances).reduce((a, b) =>
    a[1] < b[1] ? a : b
  )[0];

  return closestEdge as WindowDirection;
}
