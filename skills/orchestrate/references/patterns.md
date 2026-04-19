# Advanced Orchestration Patterns

## Fan-Out / Fan-In

Split a large task into N independent subtasks, process in parallel, merge results.

### When to Use
- Code review across multiple directories
- Running tests in parallel
- Analyzing multiple documents simultaneously
- Any embarrassingly parallel workload

### Pattern

```
Leader:
  1. Decompose task into N subtasks
  2. Spawn N workers (one per subtask)
  3. Poll swarm_list_workers until all status = "done"
  4. Read all worker messages
  5. Synthesize into final output
  6. Clean up workers
```

### Error Handling
- If a worker reports "error", read its messages for details
- Decide whether to retry (spawn new worker with same task) or skip
- Set a timeout: if a worker hasn't reported in 5 minutes, consider it stalled

## Sequential Pipeline

Workers pass output from one stage to the next.

### When to Use
- Multi-stage data processing (parse → transform → validate)
- Code generation → review → fix cycle
- Any workflow with dependencies between stages

### Pattern

```
Leader:
  1. Spawn Worker A with stage-1 task
  2. Wait for A to report "done"
  3. Read A's output from its messages
  4. Spawn Worker B with stage-2 task, including A's output
  5. Repeat until pipeline complete
```

## Supervised Retry

Automatically retry failed workers with adjusted prompts.

### Pattern

```
Leader:
  1. Spawn worker with task
  2. If worker reports "error":
     a. Read error details from messages
     b. Adjust prompt to address the failure
     c. Kill failed worker
     d. Spawn new worker with improved prompt
  3. Max 3 retries per subtask
```

## LAN Multi-Machine Setup

When running across multiple machines on the same network:

1. Start the hub on one machine with `SWARM_HOST=0.0.0.0`
2. Note the hub machine's LAN IP (e.g., 192.168.1.100)
3. On other machines, set `SWARM_HUB_URL=http://192.168.1.100:7800`
4. Set matching `SWARM_SECRET` on all machines
5. Workers on remote machines register automatically via the MCP server

### Discovery

Workers can find the hub via:
- Explicit `SWARM_HUB_URL` env var
- Default `http://localhost:7800` for same-machine workers
