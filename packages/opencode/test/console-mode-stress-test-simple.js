#!/usr/bin/env node
/**
 * Simple Windows Console Stress Test (Node.js compatible)
 *
 * This version doesn't check console modes directly but creates conditions
 * that typically trigger the corruption issue:
 * - Heavy text output with ANSI codes
 * - Mouse tracking enabled
 * - Continuous scrolling content
 * - Long running session
 *
 * Run with: node packages/opencode/test/console-mode-stress-test-simple.js
 *
 * After running for 10-30 minutes, try to:
 * - Select text with mouse (should fail if corrupted)
 * - Use scrollbar (should be unresponsive if corrupted)
 * - Copy/paste (should fail if corrupted)
 */

const os = require('os');

if (os.platform() !== 'win32') {
  console.log('⚠️  This test is designed for Windows');
  console.log('It may still run on other platforms but won\'t trigger the bug');
}

class SimpleStressTester {
  constructor() {
    this.running = false;
    this.iterations = 0;
    this.startTime = Date.now();
  }

  setupMouseTracking() {
    console.log('\n=== Enabling mouse tracking ===');
    // Enable various mouse tracking modes
    process.stdout.write('\x1b[?1000h'); // Basic mouse tracking
    process.stdout.write('\x1b[?1002h'); // Button event tracking
    process.stdout.write('\x1b[?1003h'); // Any event tracking
    process.stdout.write('\x1b[?1006h'); // SGR extended mouse mode
    console.log('Mouse tracking enabled\n');
  }

  disableMouseTracking() {
    process.stdout.write('\x1b[?1000l');
    process.stdout.write('\x1b[?1002l');
    process.stdout.write('\x1b[?1003l');
    process.stdout.write('\x1b[?1006l');
  }

  outputStressPattern() {
    // Rapidly output colorful text to stress the console
    const colors = [31, 32, 33, 34, 35, 36, 91, 92, 93, 94, 95, 96];
    const bgColors = [40, 41, 42, 43, 44, 45, 46, 47];
    const styles = ['', '1', '4', '7']; // normal, bold, underline, reverse

    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const randomBg = bgColors[Math.floor(Math.random() * bgColors.length)];
    const randomStyle = styles[Math.floor(Math.random() * styles.length)];

    const style = randomStyle ? `${randomStyle};` : '';
    process.stdout.write(`\x1b[${style}${randomColor};${randomBg}m█\x1b[0m`);
  }

  generateProgressBar(percent) {
    const width = 40;
    const filled = Math.floor(width * percent / 100);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  async stressLoop() {
    console.log('=== Starting Simple Stress Test ===');
    console.log('This will stress the console system to trigger mode corruption\n');
    console.log('Instructions:');
    console.log('  1. Let this run for 10-30 minutes');
    console.log('  2. Periodically try to:');
    console.log('     - Select text with your mouse');
    console.log('     - Use the scrollbar');
    console.log('     - Copy selected text with Ctrl+C');
    console.log('  3. If these stop working, the bug has been triggered!');
    console.log('  4. Press Ctrl+C to stop the test\n');
    console.log('Starting in 3 seconds...\n');

    await this.sleep(3000);
    this.setupMouseTracking();

    // Enable raw mode to capture all input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }

    while (this.running) {
      this.iterations++;
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;

      // Output stress patterns
      for (let i = 0; i < 20; i++) {
        this.outputStressPattern();
      }

      // Every 100 iterations, show status
      if (this.iterations % 100 === 0) {
        const progress = Math.min(100, Math.floor(elapsed / 18)); // 30 minutes = 100%
        process.stdout.write('\n\n');
        process.stdout.write(`⏱️  Running: ${minutes}m ${seconds}s | Iterations: ${this.iterations}\n`);
        process.stdout.write(`📊 Progress: [${this.generateProgressBar(progress)}] ${progress}%\n`);
        process.stdout.write('\n💡 Try selecting text, scrolling, or copying now!\n');
        process.stdout.write('   If mouse/selection/copy doesn\'t work → BUG TRIGGERED! 🐛\n\n');
      }

      // Every 200 iterations, do more aggressive output
      if (this.iterations % 200 === 0) {
        // Scroll the screen
        for (let i = 0; i < 3; i++) {
          process.stdout.write('\n');
        }

        // Write a burst of colored output
        process.stdout.write('\x1b[1;33m');
        process.stdout.write('='.repeat(80));
        process.stdout.write('\x1b[0m\n');

        // Simulate cursor movement
        process.stdout.write('\x1b[H'); // Move cursor to home
        process.stdout.write('\x1b[2J'); // Clear screen
      }

      // Every 500 iterations, write a large chunk
      if (this.iterations % 500 === 0) {
        console.log('\n📝 Writing large output burst...');
        for (let i = 0; i < 50; i++) {
          for (let j = 0; j < 80; j++) {
            this.outputStressPattern();
          }
          process.stdout.write('\n');
        }
      }

      // Small delay to prevent CPU spinning
      await this.sleep(20);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async run() {
    this.running = true;

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      console.log('\n\n=== Test stopped by user ===');
      this.running = false;

      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;

      this.disableMouseTracking();

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }

      console.log(`\nTest ran for: ${minutes}m ${seconds}s`);
      console.log(`Total iterations: ${this.iterations}`);
      console.log('\n📋 Final Check:');
      console.log('  1. Can you select this text with your mouse? ← TRY IT');
      console.log('  2. Does the scrollbar work?');
      console.log('  3. Can you copy this text?');
      console.log('\nIf any of the above don\'t work, the console mode corruption bug was triggered! 🎯');

      process.exit(0);
    });

    await this.stressLoop();
  }
}

// Run the test
const tester = new SimpleStressTester();
tester.run().catch(console.error);
