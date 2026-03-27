#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const VALID_ABIS = new Set(["armeabi-v7a", "arm64-v8a", "x86", "x86_64"]);

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function getExpoCommand() {
  return process.platform === "win32" ? "expo.cmd" : "expo";
}

function getSingleTargetSerial() {
  if (process.env.ANDROID_SERIAL) {
    return { serial: process.env.ANDROID_SERIAL };
  }

  const result = run("adb", ["devices"]);
  if (result.error || result.status !== 0) {
    return {
      reason:
        "adb is unavailable, so the Android run will keep the default multi-ABI build.",
    };
  }

  const devices = result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts[1] === "device")
    .map((parts) => parts[0]);

  if (devices.length === 1) {
    return { serial: devices[0] };
  }

  if (devices.length > 1) {
    return {
      reason:
        "Multiple Android devices are connected. Set ANDROID_SERIAL to target one device and enable single-ABI debug builds.",
    };
  }

  return {
    reason:
      "No Android device is connected yet, so the Android run will keep the default multi-ABI build.",
  };
}

function detectAbi(serial) {
  const result = run("adb", ["-s", serial, "shell", "getprop", "ro.product.cpu.abi"]);
  if (result.error || result.status !== 0) {
    return null;
  }

  const abi = result.stdout.trim();
  return VALID_ABIS.has(abi) ? abi : null;
}

function main() {
  const env = { ...process.env };

  if (!env.ORG_GRADLE_PROJECT_reactNativeArchitectures) {
    const target = getSingleTargetSerial();

    if (target.serial) {
      const abi = detectAbi(target.serial);
      if (abi) {
        env.ORG_GRADLE_PROJECT_reactNativeArchitectures = abi;
        console.log(
          `[GapWalk] Using reactNativeArchitectures=${abi} for ${target.serial}`
        );
      } else {
        console.log(
          `[GapWalk] Could not detect ABI for ${target.serial}; keeping the default multi-ABI build.`
        );
      }
    } else if (target.reason) {
      console.log(`[GapWalk] ${target.reason}`);
    }
  }

  const expoCommand = getExpoCommand();
  const result = spawnSync(expoCommand, ["run:android", ...process.argv.slice(2)], {
    env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[GapWalk] Failed to launch Expo CLI: ${result.error.message}`);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

main();
