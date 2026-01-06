/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { WM } from "./WindowManager.js";
import { Win, WindowDirection } from "./Window.js";
import Meta from "gi://Meta";
import GLib from "gi://GLib";
import { getQuadrant, Position, Rect } from "./utils.js";

import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";
import { MutterWindow } from "./MutterWindow.js";

export default class WindowManager extends Extension {
  windowManagers = new Map<number, WM>();
  _pointerFocusTimeoutId: number | null = null;
  windowMap = new WeakMap<Meta.Window, MutterWindow>();
  direction: WindowDirection = "top";
  activeWindow: MutterWindow | null = null;
  signals: number[] = [];

  getActiveWindow(): MutterWindow | null {
    return this.activeWindow;
  }

  cleanup() {
    for (const wm of this.windowManagers.values()) {
      const windows = wm.getWindows();

      for (const win of windows) {
        if (win instanceof MutterWindow) {
          win.cleanup();
        }
      }
    }

    if (this._pointerFocusTimeoutId) {
      GLib.Source.remove(this._pointerFocusTimeoutId);
      this._pointerFocusTimeoutId = null;
    }
  }

  enable() {
    this.signals.push(
      global.display.connect("window-created", (_display, window) => {
        this.windowMap.set(
          window,
          new MutterWindow(
            this.windowManagers,
            window,
            this.getActiveWindow.bind(this),
            this.direction
          )
        );
      })
    );

    this.signals.push(
      global.display.connect("grab-op-end", (_display, window) => {
        const workspaceIndex = window.get_workspace().index();

        const wm = this.windowManagers.get(workspaceIndex);

        if (!wm) {
          return;
        }

        wm.rerender().catch(console.error);
      })
    );

    if (this._pointerFocusTimeoutId) {
      GLib.Source.remove(this._pointerFocusTimeoutId);
    }

    this._pointerFocusTimeoutId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      16,
      this._focusWindowUnderPointer.bind(this)
    );
  }

  _getMetaWindowAtPointer(pointer: [number, number]): {
    metaWindow: Meta.Window;
    windowRect: Rect;
    pointer: Position;
  } | null {
    const windows = global.get_window_actors();
    const [x, y] = pointer;

    // Iterate through the windows in reverse order to get the top-most window
    for (let i = windows.length - 1; i >= 0; i--) {
      let window = windows[i];
      let metaWindow = window.meta_window;

      let { x: wx, y: wy, width, height } = metaWindow.get_frame_rect();

      // Check if the position is within the window bounds
      if (x >= wx && x <= wx + width && y >= wy && y <= wy + height) {
        return {
          metaWindow,
          windowRect: {
            x: wx,
            y: wy,
            width,
            height,
          },
          pointer: { x, y },
        };
      }
    }

    // No window found at the pointer
    return null;
  }

  _focusWindowUnderPointer() {
    // Get the global mouse position
    let pointer = global.get_pointer();

    const window = this._getMetaWindowAtPointer([pointer[0], pointer[1]]);

    if (window) {
      this.direction = getQuadrant(window.windowRect, window.pointer);
      this.activeWindow = this.windowMap.get(window.metaWindow) || null;

      window.metaWindow.focus(global.get_current_time());
      window.metaWindow.raise();
    }

    // Continue polling
    return true;
  }

  disable() {
    this.cleanup();
  }
}
