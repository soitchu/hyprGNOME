export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowListeners {
  onMove: (newPosition: WindowPosition) => Promise<void>;
  onResize: (newSize: WindowSize, position: WindowPosition) => Promise<void>;
}

export type WindowDirection = "top" | "bottom" | "left" | "right";

export class Win {
  private locked: boolean = false;
  private queuedActions: Array<() => Promise<void>> = [];
  private eventListeners: {
    [K in keyof WindowListeners]?: WindowListeners[K][];
  } = {};

  position: WindowPosition;
  size: WindowSize;
  spawnAt: WindowDirection = "right";

  metadata = {
    isActive: false,
    maximized: false,
  };

  constructor(
    position: WindowPosition,
    size: WindowSize,
    spawnAt?: WindowDirection
  ) {
    this.position = position;
    this.size = size;
    if (spawnAt) {
      this.spawnAt = spawnAt;
    }
  }

  addEventListener<K extends keyof WindowListeners>(
    event: K,
    listener: WindowListeners[K]
  ): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event]!.push(listener);
  }

  removeEventListener<K extends keyof WindowListeners>(
    event: K,
    listener: WindowListeners[K]
  ): void {
    if (!this.eventListeners[event]) return;

    const index = this.eventListeners[event]!.indexOf(listener);

    if (index !== -1) {
      this.eventListeners[event]!.splice(index, 1);
    }
  }

  async move(newPosition: WindowPosition): Promise<void> {
    if (this.locked) {
      this.queuedActions.push(() => this.move(newPosition));
      return;
    }

    this.locked = true;

    for (const listener of this.eventListeners["onMove"] || []) {
      try {
        await listener(newPosition);
      } catch (e) {
        this.handleError(e);
      }
    }

    this.position = newPosition;
    this.locked = false;
    this.executeQueuedActions().catch(this.handleError);
  }

  async resize(newSize: WindowSize): Promise<void> {
    if (this.locked) {
      this.queuedActions.push(() => this.resize(newSize));
      return;
    }

    this.locked = true;

    for (const listener of this.eventListeners["onResize"] || []) {
      try {
        await listener(newSize, this.position);
      } catch (e) {
        this.handleError(e);
      }
    }

    this.size = newSize;
    this.locked = false;
    this.executeQueuedActions().catch(this.handleError);
  }

  handleError(error: any): void {
    logError(error as Error, "Error in window operation");
  }

  async executeQueuedActions(): Promise<void> {
    if (this.queuedActions.length > 0) {
      await this.queuedActions.shift()!();
    }
  }
}
