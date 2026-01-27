# Auto-Clear Context After Slash Commands

Workaround to automatically run `/clear` after specific slash commands finish.

## Problem

After commands like `/gsd:plan-phase`, context should be cleared to free up space, but it's easy to forget.

## Solution: PostToolUse Hook + tmux

When a skill runs, it uses the `Skill` tool. A `PostToolUse` hook can detect when it finishes, then use tmux to inject `/clear` into the terminal.

### 1. Create the hook script

```bash
#!/bin/bash
# ~/.claude/hooks/auto-clear-after-skill.sh

# Read hook input from stdin
INPUT=$(cat)

# Check if this was a Skill tool call
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
SKILL_NAME=$(echo "$INPUT" | jq -r '.tool_input.skill // empty')

# List of skills that should trigger auto-clear
CLEAR_AFTER_SKILLS=("gsd:plan-phase" "gsd:execute-phase" "gsd:verify-work")

if [[ "$TOOL_NAME" == "Skill" ]]; then
  for skill in "${CLEAR_AFTER_SKILLS[@]}"; do
    if [[ "$SKILL_NAME" == "$skill" ]]; then
      # Small delay to let output finish
      sleep 1
      # Inject /clear into the tmux pane
      tmux send-keys "/clear" Enter
      exit 0
    fi
  done
fi
```

### 2. Configure the hook in settings

In `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Skill",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/auto-clear-after-skill.sh"
          }
        ]
      }
    ]
  }
}
```

### 3. Run Claude Code inside tmux

```bash
tmux new-session -s claude
claude
```

Now when `/gsd:plan-phase` finishes, the hook fires and injects `/clear`.

## Alternative: Reminder Only

If tmux feels too hacky, have the hook output a reminder instead:

```bash
#!/bin/bash
# Outputs to Claude's context as a reminder
echo "⚠️ REMINDER: Run /clear now to free up context"
```

## Limitations

- Only works when running Claude Code inside tmux (or screen with `screen -X stuff`)
- No clean way to inject commands into a raw terminal session
- Requires `jq` to be installed for JSON parsing
