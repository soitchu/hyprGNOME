import { Win, type WindowDirection } from "./Window.js";

type WindowChild = Win | WindowLayout;
type WindowLayout = {
  direction: "horizontal" | "vertical";
  children: Array<WindowChild>;
};
type ScreenSize = { width: number; height: number };
type ScreenPosition = { x: number; y: number };
type ScreenRect = ScreenSize & ScreenPosition;

const findLayout = (
  layout: WindowLayout,
  windowToFind: Win,
  ancestors: WindowLayout[] = []
): { layout: WindowLayout | null; ancestors: WindowLayout[] } | null => {
  for (const elem of layout.children) {
    if (elem === windowToFind) {
      return {
        layout,
        ancestors,
      };
    } else if ("children" in elem) {
      const result = findLayout(elem, windowToFind, [...ancestors, layout]);

      if (result) {
        return {
          layout: result.layout,
          ancestors: result.ancestors,
        };
      }
    }
  }

  return null;
};

export class WM {
  private windows = new Set<Win>();
  private layout: WindowLayout;
  private screenRect: ScreenRect;

  constructor(screenRect: ScreenRect) {
    this.screenRect = screenRect;
    this.layout = { direction: "horizontal", children: [] };
  }

  private getActiveLayout(
    activeWindow: Win | null,
    spawnAt: WindowDirection
  ): WindowLayout {
    // const activeWindow = this.getActiveWindow();

    log(`Getting active layout for window: ${activeWindow?.metadata}`);

    if (activeWindow) {
      // Find the layout containing the active window
      const activeLayout = findLayout(this.layout, activeWindow)?.layout
        ?.children;
      const index = activeLayout?.indexOf(activeWindow!) ?? -1;

      log(`Active layout found: ${activeLayout}, index: ${index}`);

      if (index !== -1 && activeLayout) {
        const layout = {
          direction: (spawnAt === "left" || spawnAt === "right"
            ? "horizontal"
            : "vertical") as "horizontal" | "vertical",
          children: [activeWindow],
        };

        activeLayout.splice(index, 1, layout);
        return layout;
      } else {
        return this.layout;
      }
    } else {
      return this.layout;
    }
  }

  hasWindow(window: Win): boolean {
    return this.windows.has(window);
  }

  async addWindow(window: Win, activeWindow: Win | null): Promise<void> {
    this.windows.add(window);

    const activeLayout = this.getActiveLayout(activeWindow, window.spawnAt);

    log(
      `Adding window to layout with direction ${activeLayout.direction} - ${window.spawnAt}`
    );

    if (["left", "top"].includes(window.spawnAt)) {
      activeLayout.children.unshift(window);
    } else {
      activeLayout.children.push(window);
    }

    // Refresh layout
    await this.rerender();
  }

  async rerender(): Promise<void> {
    const filteredLayout = (() => {
      const filterEmptyLayouts = (
        layout: WindowLayout
      ): WindowLayout | null => {
        const filteredChildren: WindowChild[] = [];

        for (const child of layout.children) {
          if (child instanceof Win && child.metadata.maximized) {
            log(`Skipping child in maximized state`);
            continue;
          }

          if ("children" in child) {
            const filteredChild = filterEmptyLayouts(child);
            if (filteredChild) {
              filteredChildren.push(filteredChild);
            }
          } else {
            filteredChildren.push(child);
          }
        }

        if (filteredChildren.length === 0) {
          return null;
        }

        return {
          direction: layout.direction,
          children: filteredChildren,
        };
      };

      return (
        filterEmptyLayouts(this.layout) ?? {
          direction: "horizontal",
          children: [],
        }
      );
    })();

    await this.refreshLayout(this.screenRect, filteredLayout);
  }

  setFocus(window: Win): void {
    for (const win of this.windows) {
      win.metadata.isActive = win === window;
    }
  }

  private async refreshLayout(
    screenRect: ScreenRect,
    layout: WindowLayout
  ): Promise<void> {
    const totalWindows = layout.children.length;
    const cols = layout.direction === "horizontal" ? totalWindows : 1;
    const rows = layout.direction === "vertical" ? totalWindows : 1;

    const winWidth = Math.floor(screenRect.width / cols);
    const winHeight = Math.floor(screenRect.height / rows);

    for (let i = 0; i < layout.children.length; i++) {
      const layoutElem = layout.children[i];

      if (layoutElem instanceof Win) {
        const win = layoutElem;
        const col = i % cols;
        const row = Math.floor(i / cols);

        const newPosition = {
          x: screenRect.x + col * winWidth,
          y: screenRect.y + row * winHeight,
        };

        const newSize = {
          width: winWidth,
          height: winHeight,
        };

        await win.move(newPosition);
        await win.resize(newSize);
      } else {
        await this.refreshLayout(
          {
            x: screenRect.x + (i % cols) * winWidth,
            y: screenRect.y + Math.floor(i / cols) * winHeight,
            width: winWidth,
            height: winHeight,
          },
          layoutElem
        );
      }
    }
  }

  async removeWindow(window: Win): Promise<void> {
    this.windows.delete(window);
    const { layout, ancestors } = findLayout(this.layout, window) ?? {};

    if (layout && ancestors) {
      const index = layout.children.indexOf(window);
      const parent = ancestors[ancestors.length - 1];
      if (index !== -1) {
        layout.children.splice(index, 1);
      }

      if (layout.children.length === 0 && parent) {
        const parentIndex = parent.children.indexOf(layout);
        if (parentIndex !== -1) {
          parent.children.splice(parentIndex, 1);
        }
      }

      if (layout.children.length === 1 && parent) {
        const remainingChild = layout.children[0];
        const parentIndex = parent.children.indexOf(layout);
        if (parentIndex !== -1) {
          parent.children.splice(parentIndex, 1, remainingChild);
        }
      }

      // Refresh layout
      await this.rerender();
    }
  }

  getWindows(): Set<Win> {
    return this.windows;
  }

  changeScreenSize(screenRect: ScreenRect): void {
    this.screenRect = screenRect;
  }
}
