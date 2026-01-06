import { Win, WindowDirection } from "./Window.js";
import { WM } from "./WindowManager.js";
import Meta from "gi://Meta";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import type GObject from "gi://GObject";

export class MutterWindow extends Win {
  static DEFAULT_WIDTH = 300;
  static DEFAULT_HEIGHT = 300;

  private windowManagers: Map<number, WM> = new Map();
  private window: Meta.Window;
  private currentWorkspaceIndex: number | null = null;
  private getActiveWindow: () => MutterWindow | null;
  private signals: number[] = [];

  constructor(
    windowManagers: Map<number, WM>,
    window: Meta.Window,
    getActiveWindow: () => MutterWindow | null,
    direction?: WindowDirection
  ) {
    super(
      { x: 0, y: 0 },
      {
        width: MutterWindow.DEFAULT_WIDTH,
        height: MutterWindow.DEFAULT_HEIGHT,
      },
      direction
    );
    this.windowManagers = windowManagers;
    this.window = window;
    this.getActiveWindow = getActiveWindow;
    this.init();
  }

  private safeResize(x: number, y: number, width: number, height: number) {
    const window = this.window;
    // We use idle_add to detach from the current event loop.
    // This prevents locking up the UI if the operation is heavy
    // and helps avoid race conditions during window creation.
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      // Check existence AGAIN inside the idle loop (window could die in the meantime)
      if (!window || !window.get_compositor_private()) {
        return GLib.SOURCE_REMOVE;
      }

      try {
        window.move_resize_frame(false, x, y, width, height);
      } catch (e) {
        logError(e as Error, "Failed to resize window");
      }

      return GLib.SOURCE_REMOVE; // Stop the idle loop
    });
  }

  private safeMove(x: number, y: number) {
    const window = this.window;
    // We use idle_add to detach from the current event loop.
    // This prevents locking up the UI if the operation is heavy
    // and helps avoid race conditions during window creation.
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      if (!window || !window.get_compositor_private()) {
        return GLib.SOURCE_REMOVE;
      }

      try {
        window.move_frame(false, x, y);
      } catch (e) {
        logError(e as Error, "Failed to move window");
      }

      return GLib.SOURCE_REMOVE; // Stop the idle loop
    });
  }

  private addSignal<K extends keyof Meta.Window.SignalSignatures>(
    signal: K,
    callback: GObject.SignalCallback<this, Meta.Window.SignalSignatures[K]>
  ): void {
    const target = this.window;
    const signalId = target.connect(signal, callback);
    this.signals.push(signalId);
  }

  private async init(): Promise<void> {
    const window = this.window;

    if (
      window.get_window_type() !== Meta.WindowType.DESKTOP &&
      window.get_window_type() !== Meta.WindowType.NORMAL
    ) {
      return;
    }

    this.addSignal("notify::mapped", () => {
      const actor = window.get_compositor_private();

      try {
        actor.connect("first-frame", () => {
          this.onMapped().catch(logError);
        });
      } catch (e) {
        logError(e as Error, "Error managing window");
      }
    });

    this.addSignal("workspace-changed", () => {
      if (typeof this.currentWorkspaceIndex === "number") {
        const currentWorkspace = this.windowManagers.get(
          this.currentWorkspaceIndex
        );

        currentWorkspace?.removeWindow(this);
        currentWorkspace?.rerender().catch(logError);
      }

      const newWorkspaceIndex = window.get_workspace().index();

      const wm = this.getWorkspace(newWorkspaceIndex);
      wm.addWindow(this, this.getActiveWindow());

      this.currentWorkspaceIndex = newWorkspaceIndex;
      this.rerender().catch(logError);
    });

    this.addSignal("focus", () => {
      for (const [, winManager] of this.windowManagers) {
        winManager?.setFocus(this);
      }
    });

    // @ts-expect-error missing type
    this.addSignal("size_changed", () => {
      const isMaximized =
        window.maximizedHorizontally && window.maximizedVertically;

      if (this.metadata.maximized !== isMaximized) {
        this.metadata.maximized = isMaximized;
        this.rerender().catch(logError);
      }
    });
  }

  private async rerender(): Promise<void> {
    const window = this.window;
    const workspaceIndex = window.get_workspace().index();

    const wm = this.windowManagers.get(workspaceIndex);
    if (!wm) return;

    await wm.rerender();
  }

  private getWorkspace(index: number): WM {
    const monitor = this.window.get_monitor();
    const workArea = Main.layoutManager.getWorkAreaForMonitor(monitor);
    if (!this.windowManagers.has(index)) {
      this.windowManagers.set(
        index,
        new WM({
          x: workArea.x,
          y: workArea.y,
          width: workArea.width,
          height: workArea.height,
        })
      );
    }

    return this.windowManagers.get(index)!;
  }

  private async onMapped(): Promise<void> {
    try {
      const window = this.window;

      if (window.fullscreen) return;

      const workspaceIndex = window.get_workspace().index();
      const wm = this.getWorkspace(workspaceIndex);

      this.currentWorkspaceIndex = workspaceIndex;
      this.metadata.maximized =
        window.maximizedHorizontally && window.maximizedVertically;

      if (this.metadata.maximized) {
        this.window.unmaximize(Meta.MaximizeFlags.BOTH);
      }

      this.addEventListener("onMove", async (position) => {
        const { x, y } = position;
        this.safeMove(x, y);
      });

      this.addEventListener("onResize", async (size, position) => {
        const { width, height } = size;
        const { x, y } = position;

        this.safeResize(x, y, width, height);
      });

      wm.addWindow(this, this.getActiveWindow());

      window.connect("unmanaged", () => {
        wm.removeWindow(this).catch(logError);
        this.cleanup();
      });
    } catch (e) {
      logError(e as Error, "Error managing window");
    }
  }

  public cleanup() {
    for (const signalId of this.signals) {
      this.window.disconnect(signalId);
    }
  }
}
