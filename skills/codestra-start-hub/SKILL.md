---
name: orchestrate
description: >
  This skill should be used when the user asks to "orchestrate workers",
  "spawn sub-instances", "start a swarm", "coordinate Claude instances",
  "run parallel tasks", "split work across agents", or needs to manage
  multiple Claude Code instances working together via the Swarm hub.
metadata:
  version: "0.1.0"
---

# Orchestrate Claude Swarm Workers

Coordinate multiple Claude Code instances through the Swarm hub using a Hub & Spoke model.
This instance acts as the **leader** that spawns, monitors, and collects results from workers.

## Startup Sequence

1. Start the hub (if not running):
   - Call `swarm_hub_status` to check if the hub is alive
   - If unreachable, use `swarm_hub_start` to get the launch command, then execute it via Bash
   - Verify with `swarm_hub_status`

2. Register this instance as leader:
   - Call `swarm_register` with `role: "leader"` and a description of the overall task

## Spawning Workers

Break the user's task into independent subtasks. For each subtask:

1. Call `swarm_spawn_worker` with a clear, self-contained task description
2. The tool returns a shell command — execute it via Bash to launch the worker
3. Each worker gets a unique ID for tracking

### Writing Good Worker Prompts

Each worker runs as an independent Claude Code session. The prompt must be **self-contained**:

- State the exact goal
- Specify input files or directories
- Define the expected output format
- Include any constraints or conventions
- Tell the worker to call `swarm_register` at start and `swarm_update_status` when done

Example:
```
You are a Swarm worker. First call swarm_register with role "worker".
Your task: review all TypeScript files in src/api/ for security issues.
Write findings to /tmp/security-report-{workerId}.md.
When done, call swarm_update_status with status "done" and send results
via swarm_send_message to the leader.
```

## Monitoring

Poll worker status periodically:

- `swarm_list_workers` — overview of all workers
- `swarm_read_messages` — check for worker reports
- Workers in "error" status need attention

## Collecting Results

When all workers report status "done":

1. Read each worker's messages via `swarm_read_messages`
2. Synthesize results into a unified report
3. Clean up with `swarm_kill_worker` for completed workers

## Detailed Reference

Read `references/patterns.md` for advanced orchestration patterns (fan-out/fan-in, sequential pipeline, retry logic).
