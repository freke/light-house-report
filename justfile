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

# Generate Excel report only
excel:
    node build.js && node lighthouse-runner.mjs --no-zip

# Generate zip archive only  
zip:
    node build.js && node lighthouse-runner.mjs --no-excel

# Release build with metadata
release date='' tester='' region='':
    node build.js && node lighthouse-runner.mjs --date '{{date}}' --tester '{{tester}}' --region '{{region}}'

# Full export with all options
export-all iterations='3' date='' tester='' region='':
    node build.js && node lighthouse-runner.mjs --run '{{iterations}}' --date '{{date}}' --tester '{{tester}}' --region '{{region}}'

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
