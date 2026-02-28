# Windows Console Mode Corruption Stress Tests

These scripts help reproduce and demonstrate the Windows console mode corruption bug that affects long-running TUI applications.

## Background

During long-running TUI sessions on Windows Terminal, console mode flags can become corrupted, causing:
- Mouse selection to stop working
- Scrollbar to become unresponsive
- Copy/paste functionality to fail

Related GitHub Issues:
- [microsoft/terminal#19674](https://github.com/microsoft/terminal/issues/19674) (our bug report)
- [microsoft/terminal#15711](https://github.com/microsoft/terminal/issues/15711) (related fixed bug)

## Test Scripts

### 1. Advanced Test (Bun with FFI) - `console-mode-stress-test.ts`

**Requirements:** Bun runtime

**Features:**
- Directly monitors Windows console mode flags via kernel32.dll
- Detects corruption automatically
- Shows exact flag changes
- More technical output

**Usage:**
```bash
cd /c/Users/paulj/dev/opencode
bun run packages/opencode/test/console-mode-stress-test.ts
```

**What it does:**
1. Records initial console mode flags
2. Sets up TUI mode (enables mouse input, VT processing)
3. Continuously outputs colored text with ANSI codes
4. Queries console modes every 100 iterations
5. Automatically detects when flags change
6. Reports corruption with before/after comparison

**Output:**
```
=== Initial Console Modes ===
stdin:  0x01f7 (503)
stdout: 0x0007 (7)

stdin flags:
  ENABLE_MOUSE_INPUT:              YES
  ENABLE_EXTENDED_FLAGS:           YES
  ENABLE_VIRTUAL_TERMINAL_INPUT:   YES
  ENABLE_QUICK_EDIT_MODE:          NO

🚨 CONSOLE MODE CORRUPTION DETECTED! 🚨
```

### 2. Simple Test (Node.js) - `console-mode-stress-test-simple.js`

**Requirements:** Node.js (any version)

**Features:**
- No native dependencies required
- Creates conditions that trigger corruption
- Manual verification by user
- Runs longer tests (designed for 30+ minutes)

**Usage:**
```bash
cd /c/Users/paulj/dev/opencode
node packages/opencode/test/console-mode-stress-test-simple.js
```

**What it does:**
1. Enables mouse tracking modes
2. Continuously outputs colorful stress patterns
3. Clears screen and moves cursor frequently
4. Prompts you to manually test mouse/selection
5. Runs until you press Ctrl+C

**How to verify corruption:**
During and after the test, try to:
1. **Select text with mouse** - drag over the output
2. **Use scrollbar** - click and drag it
3. **Copy text** - select and Ctrl+C

If any of these stop working → bug triggered! 🎯

## Recommended Testing Approach

### Quick Test (5-10 minutes)
```bash
# Run the advanced test
bun run packages/opencode/test/console-mode-stress-test.ts

# While running:
# - Move mouse over window frequently
# - Click and drag to select text
# - Scroll with mouse wheel
# - Use scrollbar
```

### Extended Test (30-60 minutes)
```bash
# Run the simple test and let it run in background
node packages/opencode/test/console-mode-stress-test-simple.js

# Every 5-10 minutes, try to:
# 1. Select text with mouse
# 2. Use scrollbar
# 3. Copy selected text
#
# Note when it stops working!
```

### Testing With Fix Enabled

To verify our fix works, the TUI app (`packages/opencode/src/cli/cmd/tui/app.tsx`) already has the Windows console manager integrated:

1. Run opencode TUI normally
2. Use it for 30+ minutes with mouse interactions
3. Verify mouse selection, scrollbar, copy/paste keep working

The console manager:
- Refreshes console modes every 30 seconds
- Restores correct flags automatically
- Prevents corruption from causing issues

## Expected Results

### Without Fix
- Corruption typically occurs after 10-30 minutes
- Mouse selection stops working
- Scrollbar becomes unresponsive
- Copy/paste fails

### With Fix
- Console modes are refreshed every 30 seconds
- Mouse/selection/copy continue working indefinitely
- No user-visible issues even in long sessions

## Interpreting Results

### Console Mode Flags

Key flags that get corrupted:

**ENABLE_MOUSE_INPUT (0x0010)**
- Should be: ON for TUI apps
- When corrupted: Turns OFF
- Effect: Mouse events stop being sent to app

**ENABLE_QUICK_EDIT_MODE (0x0040)**
- Should be: OFF for TUI apps (interferes with mouse)
- When corrupted: Turns ON
- Effect: Mouse selection broken, terminal intercepts clicks

**ENABLE_VIRTUAL_TERMINAL_INPUT (0x0200)**
- Should be: ON for TUI apps
- When corrupted: Turns OFF
- Effect: ANSI escape sequences not processed

**ENABLE_VIRTUAL_TERMINAL_PROCESSING (0x0004)** (stdout)
- Should be: ON for TUI apps
- When corrupted: Turns OFF
- Effect: Colored output breaks

## Contributing Results

If you successfully reproduce the bug:

1. Note the time to corruption
2. Save the console mode flag changes
3. Add a comment to [microsoft/terminal#19674](https://github.com/microsoft/terminal/issues/19674)
4. Include:
   - Windows version
   - Windows Terminal version
   - Time to corruption
   - Which test you used
   - Any specific actions that seemed to trigger it

## Troubleshooting

**"This test only works on Windows"**
- You're not on Windows. The bug is Windows-specific.

**"Cannot find module 'bun:ffi'"**
- Use the simple test instead, or install Bun: https://bun.sh

**Test runs but corruption never occurs**
- Try running longer (30+ minutes)
- Interact more with mouse (select, scroll, click)
- The bug may be non-deterministic
- Try with opencode TUI itself for more realistic conditions

**Mouse selection never worked**
- Expected for the advanced test (it's not a full TUI)
- Try the simple test or actual opencode TUI

## See Also

- [windows-console.ts](../src/cli/cmd/tui/util/windows-console.ts) - Our fix implementation
- [app.tsx](../src/cli/cmd/tui/app.tsx) - Where fix is integrated
- [Microsoft Docs: Console Modes](https://learn.microsoft.com/en-us/windows/console/console-modes)
