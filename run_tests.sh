#!/bin/bash
LOG_FILE="logs.txt"

# Clear existing log file
> "$LOG_FILE"

run_command() {
    local name="$1"
    local cmd="$2"
    echo "=== Running: $name ===" >> "$LOG_FILE"
    echo "Command: $cmd" >> "$LOG_FILE"
    echo "Timestamp: $(date)" >> "$LOG_FILE"
    echo "----------------------------------------" >> "$LOG_FILE"
    eval "$cmd" >> "$LOG_FILE" 2>&1
    local exit_code=$?
    echo "Exit code: $exit_code" >> "$LOG_FILE"
    echo "========================================" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    return $exit_code
}

run_command "bun test" "bun test"
run_command "bun run test" "bun run test"
run_command "bun lint" "bun lint"
run_command "bun run lint" "bun run lint"
run_command "bun typecheck" "bun typecheck"
run_command "bun run typecheck" "bun run typecheck"

echo "All commands executed. Output saved to $LOG_FILE"
