# Lighthouse Runner - Task Automation

# Default target - show help
default:
    @just --list

# Install dependencies
install:
    npm install

# Type check without emitting
check:
    npx tsc --noEmit

# Build the project (development)
build:
    node build.js

# Build with minification
prod:
    node build.js --minify

# Watch mode for development
watch:
    node build.js --watch

# Build and run (development)
dev:
    node build.js && node lighthouse-runner.mjs

# Build and run with custom iterations
run iterations='':
    node build.js && node lighthouse-runner.mjs --run {{iterations}}

# Compress existing reports
compress quality='30':
    node build.js && node lighthouse-runner.mjs --compress --quality {{quality}}

# Clean build artifacts
clean:
    rm -f lighthouse-runner.mjs lighthouse-runner.mjs.map

# Remove node_modules
distclean:
    rm -rf node_modules package-lock.json

# Reinstall from scratch
reinstall:
    rm -rf node_modules package-lock.json
    npm install
