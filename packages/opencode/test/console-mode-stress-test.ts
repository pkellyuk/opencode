#!/usr/bin/env bun
/**
 * Windows Console Mode Stress Test
 *
 * This script attempts to reproduce the Windows console mode corruption issue
 * by stressing the console system with heavy mouse input, text output, and
 * console mode queries.
 *
 * Run with: bun run packages/opencode/test/console-mode-stress-test.ts
 */

import { dlopen, FFIType, suffix, type Pointer } from "bun:ffi"
import { platform } from "os"

// Windows console mode flags
const ENABLE_PROCESSED_INPUT = 0x0001
const ENABLE_MOUSE_INPUT = 0x0010
const ENABLE_EXTENDED_FLAGS = 0x0080
const ENABLE_VIRTUAL_TERMINAL_INPUT = 0x0200
const ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004
const ENABLE_QUICK_EDIT_MODE = 0x0040

const STD_INPUT_HANDLE = -10
const STD_OUTPUT_HANDLE = -11

interface ConsoleState {
  stdinMode: number | null
  stdoutMode: number | null
  timestamp: number
}

class ConsoleModeTester {
  private kernel32: any = null
  private stdinHandle: Pointer | null = null
  private stdoutHandle: Pointer | null = null
  private initialStdinMode: number | null = null
  private initialStdoutMode: number | null = null
  private history: ConsoleState[] = []
  private running = false

  constructor() {
    if (platform() !== "win32") {
      throw new Error("This test only works on Windows")
    }

    this.initializeKernel32()
    this.saveInitialModes()
  }

  private initializeKernel32() {
    this.kernel32 = dlopen(`kernel32.${suffix}`, {
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

    this.stdinHandle = this.kernel32.symbols.GetStdHandle(STD_INPUT_HANDLE)
    this.stdoutHandle = this.kernel32.symbols.GetStdHandle(STD_OUTPUT_HANDLE)
  }

  private getConsoleModes(): [number | null, number | null] {
    const modeBuffer = new Uint32Array(1)
    const modePtr = new DataView(modeBuffer.buffer)

    let stdinMode: number | null = null
    let stdoutMode: number | null = null

    if (this.stdinHandle && this.kernel32.symbols.GetConsoleMode(this.stdinHandle, modeBuffer)) {
      stdinMode = modePtr.getUint32(0, true)
    }

    if (this.stdoutHandle && this.kernel32.symbols.GetConsoleMode(this.stdoutHandle, modeBuffer)) {
      stdoutMode = modePtr.getUint32(0, true)
    }

    return [stdinMode, stdoutMode]
  }

  private saveInitialModes() {
    const [stdinMode, stdoutMode] = this.getConsoleModes()
    this.initialStdinMode = stdinMode
    this.initialStdoutMode = stdoutMode

    console.log("\n=== Initial Console Modes ===")
    console.log(`stdin:  0x${stdinMode?.toString(16).padStart(4, "0")} (${stdinMode})`)
    console.log(`stdout: 0x${stdoutMode?.toString(16).padStart(4, "0")} (${stdoutMode})`)
    this.logModeFlags(stdinMode, stdoutMode)
  }

  private logModeFlags(stdinMode: number | null, stdoutMode: number | null) {
    if (stdinMode !== null) {
      console.log("\nstdin flags:")
      console.log(`  ENABLE_MOUSE_INPUT:              ${(stdinMode & ENABLE_MOUSE_INPUT) ? "YES" : "NO"}`)
      console.log(`  ENABLE_EXTENDED_FLAGS:           ${(stdinMode & ENABLE_EXTENDED_FLAGS) ? "YES" : "NO"}`)
      console.log(`  ENABLE_VIRTUAL_TERMINAL_INPUT:   ${(stdinMode & ENABLE_VIRTUAL_TERMINAL_INPUT) ? "YES" : "NO"}`)
      console.log(`  ENABLE_QUICK_EDIT_MODE:          ${(stdinMode & ENABLE_QUICK_EDIT_MODE) ? "YES" : "NO"}`)
    }
    if (stdoutMode !== null) {
      console.log("\nstdout flags:")
      console.log(`  ENABLE_VIRTUAL_TERMINAL_PROCESSING: ${(stdoutMode & ENABLE_VIRTUAL_TERMINAL_PROCESSING) ? "YES" : "NO"}`)
    }
  }

  private setupTUIMode() {
    console.log("\n=== Setting up TUI mode (enabling mouse input) ===")

    if (!this.stdinHandle || !this.stdoutHandle) return

    const modeBuffer = new Uint32Array(1)
    const modePtr = new DataView(modeBuffer.buffer)

    // Enable VT processing on stdout
    if (this.kernel32.symbols.GetConsoleMode(this.stdoutHandle, modeBuffer)) {
      const currentMode = modePtr.getUint32(0, true)
      const newMode = currentMode | ENABLE_VIRTUAL_TERMINAL_PROCESSING
      this.kernel32.symbols.SetConsoleMode(this.stdoutHandle, newMode)
    }

    // Enable mouse input on stdin
    if (this.kernel32.symbols.GetConsoleMode(this.stdinHandle, modeBuffer)) {
      const currentMode = modePtr.getUint32(0, true)
      let newMode = currentMode | ENABLE_MOUSE_INPUT | ENABLE_EXTENDED_FLAGS | ENABLE_VIRTUAL_TERMINAL_INPUT
      // Disable quick edit mode for mouse support
      newMode &= ~ENABLE_QUICK_EDIT_MODE
      this.kernel32.symbols.SetConsoleMode(this.stdinHandle, newMode)
    }

    const [stdinMode, stdoutMode] = this.getConsoleModes()
    console.log(`stdin:  0x${stdinMode?.toString(16).padStart(4, "0")} (${stdinMode})`)
    console.log(`stdout: 0x${stdoutMode?.toString(16).padStart(4, "0")} (${stdoutMode})`)
  }

  private recordState() {
    const [stdinMode, stdoutMode] = this.getConsoleModes()
    this.history.push({
      stdinMode,
      stdoutMode,
      timestamp: Date.now(),
    })
  }

  private detectCorruption(): boolean {
    if (this.history.length < 2) return false

    const current = this.history[this.history.length - 1]
    const initial = this.history[0]

    // Check if critical flags have changed
    if (current.stdinMode !== null && initial.stdinMode !== null) {
      const mouseInputLost = (initial.stdinMode & ENABLE_MOUSE_INPUT) &&
                             !(current.stdinMode & ENABLE_MOUSE_INPUT)
      const vtInputLost = (initial.stdinMode & ENABLE_VIRTUAL_TERMINAL_INPUT) &&
                          !(current.stdinMode & ENABLE_VIRTUAL_TERMINAL_INPUT)
      const quickEditEnabled = !(initial.stdinMode & ENABLE_QUICK_EDIT_MODE) &&
                               (current.stdinMode & ENABLE_QUICK_EDIT_MODE)

      if (mouseInputLost || vtInputLost || quickEditEnabled) {
        return true
      }
    }

    if (current.stdoutMode !== null && initial.stdoutMode !== null) {
      const vtProcessingLost = (initial.stdoutMode & ENABLE_VIRTUAL_TERMINAL_PROCESSING) &&
                                !(current.stdoutMode & ENABLE_VIRTUAL_TERMINAL_PROCESSING)
      if (vtProcessingLost) {
        return true
      }
    }

    return false
  }

  private outputStressPattern() {
    // Rapidly output text with ANSI codes to stress the console
    const colors = [31, 32, 33, 34, 35, 36]
    const randomColor = colors[Math.floor(Math.random() * colors.length)]
    process.stdout.write(`\x1b[${randomColor}m█\x1b[0m`)
  }

  private setupMouseEventLogging() {
    let lastMouseEvent = Date.now()
    let mouseEventCount = 0
    let buffer = ""

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding("utf8")

    process.stdin.on("data", (data: string) => {
      buffer += data

      // Parse mouse events (CSI < sequence)
      const mouseRegex = /\x1b\[<(\d+);(\d+);(\d+)([mM])/g
      let match

      while ((match = mouseRegex.exec(buffer)) !== null) {
        const [_, button, x, y, type] = match
        const eventType = type === "M" ? "DOWN" : "UP"
        const buttonName = button === "0" ? "LEFT" : button === "1" ? "MIDDLE" : button === "2" ? "RIGHT" : "MOVE"

        mouseEventCount++
        lastMouseEvent = Date.now()

        // Log mouse event
        process.stdout.write(`\n🖱️  MOUSE ${eventType} - ${buttonName} at (${x},${y}) - Event #${mouseEventCount}\n`)

        // Remove matched sequence from buffer
        buffer = buffer.substring(match.index + match[0].length)
      }

      // Also check for regular mouse tracking sequences (simpler format)
      const simpleMouseRegex = /\x1b\[M(.{3})/g
      while ((match = simpleMouseRegex.exec(buffer)) !== null) {
        mouseEventCount++
        lastMouseEvent = Date.now()
        process.stdout.write(`\n🖱️  MOUSE EVENT detected - Event #${mouseEventCount}\n`)
        buffer = buffer.substring(match.index + match[0].length)
      }

      // Clear old buffer data
      if (buffer.length > 100) {
        buffer = buffer.substring(buffer.length - 50)
      }
    })

    // Monitor for lack of mouse events (indicates corruption)
    setInterval(() => {
      const timeSinceLastEvent = Date.now() - lastMouseEvent
      if (timeSinceLastEvent > 10000 && mouseEventCount > 0) {
        process.stdout.write(`\n⚠️  WARNING: No mouse events for ${Math.floor(timeSinceLastEvent / 1000)}s (total events: ${mouseEventCount})\n`)
      }
    }, 5000)
  }

  private async stressLoop() {
    let iterations = 0
    const startTime = Date.now()

    console.log("\n=== Starting stress test ===")
    console.log("Instructions:")
    console.log("  1. Move your mouse over this window")
    console.log("  2. Click and drag to select text")
    console.log("  3. Use the scrollbar")
    console.log("  4. Press Ctrl+C to stop\n")
    console.log("Monitoring console modes for corruption...\n")
    console.log("🖱️  Mouse events will be logged below:")
    console.log("   - If mouse events stop appearing = bug triggered!\n")

    // Enable mouse tracking
    process.stdout.write("\x1b[?1000h") // Mouse tracking
    process.stdout.write("\x1b[?1002h") // Button event tracking
    process.stdout.write("\x1b[?1003h") // Any event tracking

    // Set up mouse event logging
    this.setupMouseEventLogging()

    while (this.running) {
      iterations++

      // Output stress
      this.outputStressPattern()

      // Query console modes frequently
      this.recordState()

      // Check for corruption every 100 iterations
      if (iterations % 100 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        process.stdout.write(`\n[${elapsed}s] Iteration ${iterations} - Checking modes...`)

        if (this.detectCorruption()) {
          console.log("\n\n🚨 CONSOLE MODE CORRUPTION DETECTED! 🚨\n")
          this.reportCorruption()
          break
        }

        const [stdinMode, stdoutMode] = this.getConsoleModes()
        process.stdout.write(` stdin=0x${stdinMode?.toString(16).padStart(4, "0")} stdout=0x${stdoutMode?.toString(16).padStart(4, "0")}`)
      }

      // Vary the stress pattern
      if (iterations % 50 === 0) {
        // Write a burst of output
        for (let i = 0; i < 10; i++) {
          this.outputStressPattern()
        }
      }

      if (iterations % 200 === 0) {
        // Clear screen and redraw
        process.stdout.write("\x1b[2J\x1b[H")
        console.log(`Stress test running... ${iterations} iterations`)
      }

      // Small delay to prevent CPU spinning
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    // Disable mouse tracking
    process.stdout.write("\x1b[?1000l")
    process.stdout.write("\x1b[?1002l")
    process.stdout.write("\x1b[?1003l")
  }

  private reportCorruption() {
    const initial = this.history[0]
    const current = this.history[this.history.length - 1]

    console.log("=== Initial State ===")
    this.logModeFlags(initial.stdinMode, initial.stdoutMode)

    console.log("\n=== Current State (CORRUPTED) ===")
    this.logModeFlags(current.stdinMode, current.stdoutMode)

    console.log("\n=== Changes Detected ===")
    if (initial.stdinMode !== null && current.stdinMode !== null) {
      const changed = initial.stdinMode ^ current.stdinMode
      if (changed) {
        console.log(`stdin changed bits: 0x${changed.toString(16).padStart(4, "0")}`)
        if (changed & ENABLE_MOUSE_INPUT) console.log("  - ENABLE_MOUSE_INPUT changed")
        if (changed & ENABLE_VIRTUAL_TERMINAL_INPUT) console.log("  - ENABLE_VIRTUAL_TERMINAL_INPUT changed")
        if (changed & ENABLE_QUICK_EDIT_MODE) console.log("  - ENABLE_QUICK_EDIT_MODE changed")
      }
    }
    if (initial.stdoutMode !== null && current.stdoutMode !== null) {
      const changed = initial.stdoutMode ^ current.stdoutMode
      if (changed) {
        console.log(`stdout changed bits: 0x${changed.toString(16).padStart(4, "0")}`)
        if (changed & ENABLE_VIRTUAL_TERMINAL_PROCESSING) console.log("  - ENABLE_VIRTUAL_TERMINAL_PROCESSING changed")
      }
    }

    console.log(`\nTime to corruption: ${((current.timestamp - initial.timestamp) / 1000).toFixed(1)}s`)
    console.log(`Total iterations: ${this.history.length}`)
  }

  async run() {
    this.setupTUIMode()
    this.recordState()

    this.running = true

    // Handle Ctrl+C
    process.on("SIGINT", () => {
      console.log("\n\n=== Test interrupted by user ===")
      this.running = false

      const final = this.getConsoleModes()
      console.log("\n=== Final Console Modes ===")
      console.log(`stdin:  0x${final[0]?.toString(16).padStart(4, "0")} (${final[0]})`)
      console.log(`stdout: 0x${final[1]?.toString(16).padStart(4, "0")} (${final[1]})`)

      if (this.detectCorruption()) {
        console.log("\n⚠️  Console modes were corrupted during test")
        this.reportCorruption()
      } else {
        console.log("\n✅ No console mode corruption detected")
      }

      process.exit(0)
    })

    await this.stressLoop()
  }
}

// Run the test
const tester = new ConsoleModeTester()
tester.run().catch(console.error)
