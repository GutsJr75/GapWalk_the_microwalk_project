#!/usr/bin/env node
const { execSync } = require('child_process');

const checks = [
  {
    name: 'Java 17+',
    command: 'java -version',
    installHint: 'sudo apt-get install openjdk-17-jdk-headless',
    envHint: 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64',
  },
  {
    name: 'Node.js 18+',
    command: 'node --version',
    installHint: 'Visit https://nodejs.org',
  },
];

console.log('🔍 Checking prerequisites...\n');
let allPassed = true;

checks.forEach(({ name, command, installHint, envHint }) => {
  try {
    execSync(command, { stdio: 'ignore' });
    console.log(`✅ ${name} is installed`);
  } catch {
    console.log(`❌ ${name} is NOT installed`);
    console.log(`   Install: ${installHint}`);
    if (envHint) {
      console.log(`   Then set: ${envHint}\n`);
    } else {
      console.log();
    }
    allPassed = false;
  }
});

if (!allPassed) {
  console.error('\n❌ SETUP FAILED: Missing required system tools\n');
  console.error('Please install the missing tools above, then run:');
  console.error('  npm install\n');
  process.exit(1);
}

console.log('\n✨ All prerequisites met!\n');
