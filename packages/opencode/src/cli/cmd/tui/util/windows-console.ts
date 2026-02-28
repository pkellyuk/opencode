/**
 * Windows console mode management utilities.
 *
 * This module provides functions to manage Windows console mode flags,
 * which can become corrupted during long-running TUI sessions, causing
 * issues like:
 * - Copy/paste stops working
 * - Scrollbar becomes unresponsive
 * - Mouse selection breaks
 *
 * The fix involves periodically restoring the correct console mode flags.
 */

import { dlopen, FFIType, type Pointer, suffix } from "bun:ffi"
import { platform } from "os"

// Windows console mode flags
// Input mode flags
const ENABLE_PROCESSED_INPUT = 0x0001
const ENABLE_LINE_INPUT = 0x0002
const ENABLE_ECHO_INPUT = 0x0004
const ENABLE_WINDOW_INPUT = 0x0008
const ENABLE_MOUSE_INPUT = 0x0010
const ENABLE_INSERT_MODE = 0x0020
const ENABLE_QUICK_EDIT_MODE = 0x0040
const ENABLE_EXTENDED_FLAGS = 0x0080
const ENABLE_VIRTUAL_TERMINAL_INPUT = 0x0200

// Output mode flags
const ENABLE_PROCESSED_OUTPUT = 0x0001
const ENABLE_WRAP_AT_EOL_OUTPUT = 0x0002
const ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004
const DISABLE_NEWLINE_AUTO_RETURN = 0x0008
const ENABLE_LVB_GRID_WORLDWIDE = 0x0010

// Standard handles
const STD_INPUT_HANDLE = -10
const STD_OUTPUT_HANDLE = -11

function isWindows(): boolean {
  return platform() === "win32"
}

let kernel32: any = null

function getKernel32() {
  if (kernel32 !== null) {
    return kernel32
  }

  if (!isWindows()) {
    return null
  }

  try {
    kernel32 = dlopen(`kernel32.${suffix}`, {
      GetStdHandle: {
        args: [FFIType.i32],
        returns: FFIType.pointer,
      },
      GetConsoleMode: {
        args: [FFIType.pointer, FFIType.pointer],
        returns: FFIType.i32,
      },
      SetConsoleMode: {
        args: [FFIType.pointer, FFIType.u32],
        returns: FFIType.i32,
      },
    })
    return kernel32
  } catch (error) {
    console.error("WindowsConsoleManager: Failed to load kernel32", error)
    return null
  }
}

export class WindowsConsoleManager {
  private stdinHandle: Pointer | null = null
  private stdoutHandle: Pointer | null = null
  private originalStdinMode: number | null = null
  private originalStdoutMode: number | null = null
  private initialized = false
  private kernel32: any = null
  private refreshIntervalId: Timer | null = null

  constructor() {
    console.log("WindowsConsoleManager: Initializing")

    if (!isWindows()) {
      console.log("WindowsConsoleManager: Not on Windows, skipping init")
      return
    }

    try {
      this.kernel32 = getKernel32()
      if (!this.kernel32) {
        return
      }

      this.initializeHandles()
      this.saveOriginalModes()
      this.initialized = true
      console.log(
        "WindowsConsoleManager: Initialized successfully, " +
          `stdin_mode=0x${this.originalStdinMode?.toString(16) || "0"}, ` +
          `stdout_mode=0x${this.originalStdoutMode?.toString(16) || "0"}`,
      )
    } catch (error) {
      console.warn("WindowsConsoleManager: Failed to initialize:", error)
    }
  }

  private initializeHandles(): void {
    if (!this.kernel32) {
      return
    }

    this.stdinHandle = this.kernel32.symbols.GetStdHandle(STD_INPUT_HANDLE)
    this.stdoutHandle = this.kernel32.symbols.GetStdHandle(STD_OUTPUT_HANDLE)
  }

  private saveOriginalModes(): void {
    if (!this.kernel32 || !this.stdinHandle || !this.stdoutHandle) {
      return
    }

    const modeBuffer = new Uint32Array(1)
    const modePtr = new DataView(modeBuffer.buffer)

    if (this.kernel32.symbols.GetConsoleMode(this.stdinHandle, modeBuffer)) {
      this.originalStdinMode = modePtr.getUint32(0, true)
    }

    if (this.kernel32.symbols.GetConsoleMode(this.stdoutHandle, modeBuffer)) {
      this.originalStdoutMode = modePtr.getUint32(0, true)
    }
  }

  getCurrentModes(): [number | null, number | null] {
    if (!this.initialized || !this.kernel32 || !this.stdinHandle || !this.stdoutHandle) {
      return [null, null]
    }

    const modeBuffer = new Uint32Array(1)
    const modePtr = new DataView(modeBuffer.buffer)

    let stdinMode: number | null = null
    let stdoutMode: number | null = null

    if (this.kernel32.symbols.GetConsoleMode(this.stdinHandle, modeBuffer)) {
      stdinMode = modePtr.getUint32(0, true)
    }

    if (this.kernel32.symbols.GetConsoleMode(this.stdoutHandle, modeBuffer)) {
      stdoutMode = modePtr.getUint32(0, true)
    }

    return [stdinMode, stdoutMode]
  }

  ensureVirtualTerminalProcessing(): boolean {
    if (!this.initialized || !this.kernel32 || !this.stdinHandle || !this.stdoutHandle) {
      return false
    }

    const modeBuffer = new Uint32Array(1)
    const modePtr = new DataView(modeBuffer.buffer)
    let success = true

    // Enable VT processing on stdout
    if (this.kernel32.symbols.GetConsoleMode(this.stdoutHandle, modeBuffer)) {
      const currentMode = modePtr.getUint32(0, true)
      const newMode = currentMode | ENABLE_VIRTUAL_TERMINAL_PROCESSING
      if (newMode !== currentMode) {
        if (!this.kernel32.symbols.SetConsoleMode(this.stdoutHandle, newMode)) {
          console.warn("WindowsConsoleManager: Failed to set stdout VT mode")
          success = false
        }
      }
    }

    // Enable VT input processing on stdin
    if (this.kernel32.symbols.GetConsoleMode(this.stdinHandle, modeBuffer)) {
      const currentMode = modePtr.getUint32(0, true)
      const newMode = currentMode | ENABLE_VIRTUAL_TERMINAL_INPUT
      if (newMode !== currentMode) {
        if (!this.kernel32.symbols.SetConsoleMode(this.stdinHandle, newMode)) {
          console.warn("WindowsConsoleManager: Failed to set stdin VT mode")
          success = false
        }
      }
    }

    return success
  }

  ensureMouseInput(): boolean {
    if (!this.initialized || !this.kernel32 || !this.stdinHandle) {
      return false
    }

    const modeBuffer = new Uint32Array(1)
    const modePtr = new DataView(modeBuffer.buffer)

    if (!this.kernel32.symbols.GetConsoleMode(this.stdinHandle, modeBuffer)) {
      return false
    }

    const currentMode = modePtr.getUint32(0, true)

    // Ensure mouse input is enabled
    const requiredFlags = ENABLE_MOUSE_INPUT | ENABLE_EXTENDED_FLAGS
    let newMode = currentMode | requiredFlags

    // Quick edit mode interferes with mouse input in TUI apps
    // The TUI framework should manage this, but we double-check
    if (newMode & ENABLE_QUICK_EDIT_MODE) {
      newMode &= ~ENABLE_QUICK_EDIT_MODE
      console.log("WindowsConsoleManager: Disabling quick edit mode for mouse support")
    }

    if (newMode !== currentMode) {
      if (!this.kernel32.symbols.SetConsoleMode(this.stdinHandle, newMode)) {
        console.warn("WindowsConsoleManager: Failed to set mouse input mode")
        return false
      }
    }

    return true
  }

  refreshConsoleModes(): boolean {
    if (!this.initialized) {
      return false
    }

    console.log("WindowsConsoleManager: Refreshing console modes")

    const vtOk = this.ensureVirtualTerminalProcessing()
    const mouseOk = this.ensureMouseInput()

    if (vtOk && mouseOk) {
      console.log("WindowsConsoleManager: Console modes refreshed successfully")
      return true
    }

    console.warn(`WindowsConsoleManager: Console mode refresh had issues: vt=${vtOk}, mouse=${mouseOk}`)
    return false
  }

  restoreOriginalModes(): boolean {
    if (!this.initialized || !this.kernel32 || !this.stdinHandle || !this.stdoutHandle) {
      return false
    }

    console.log("WindowsConsoleManager: Restoring original console modes")

    let success = true

    if (this.originalStdinMode !== null) {
      if (!this.kernel32.symbols.SetConsoleMode(this.stdinHandle, this.originalStdinMode)) {
        console.warn("WindowsConsoleManager: Failed to restore stdin mode")
        success = false
      }
    }

    if (this.originalStdoutMode !== null) {
      if (!this.kernel32.symbols.SetConsoleMode(this.stdoutHandle, this.originalStdoutMode)) {
        console.warn("WindowsConsoleManager: Failed to restore stdout mode")
        success = false
      }
    }

    return success
  }

  startPeriodicRefresh(intervalMs: number = 30000): void {
    if (!this.initialized) {
      return
    }

    if (this.refreshIntervalId) {
      return
    }

    console.log("WindowsConsoleManager: Starting periodic console refresh")

    this.refreshIntervalId = setInterval(() => {
      this.refreshConsoleModes()
    }, intervalMs)
  }

  stopPeriodicRefresh(): void {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId)
      this.refreshIntervalId = null
      console.log("WindowsConsoleManager: Stopped periodic console refresh")
    }
  }
}

// Global instance for the application
let consoleManager: WindowsConsoleManager | null = null

export function getConsoleManager(): WindowsConsoleManager | null {
  if (!isWindows()) {
    return null
  }

  if (!consoleManager) {
    consoleManager = new WindowsConsoleManager()
  }

  return consoleManager
}

export function refreshConsoleIfWindows(): boolean {
  if (!isWindows()) {
    return true
  }

  const manager = getConsoleManager()
  if (!manager) {
    return true
  }

  return manager.refreshConsoleModes()
}
