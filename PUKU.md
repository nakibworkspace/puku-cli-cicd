# Code Review Agent

## Context
This project uses Puku CLI for automated code review.

## Output Format
All responses must use the following JSON schema:
{
  "findings": [
    {
      "severity": "critical|high|medium|low",
      "file": "path/to/file",
      "line": number,
      "description": "issue description"
    }
  ]
}

## Severity Levels

| Level | Criteria | Action |
|-------|----------|--------|
| critical | Auth bypass, SQLi, XSS, secrets exposure | Block merge immediately |
| high | Unhandled promise rejections, memory leaks | Require fix before merge |
| medium | Missing error handling, code smells | Suggest improvements |
| low | Style issues, missing JSDoc | Optional fixes |

## Rejected Patterns
- console.log() in production code
- eval() or Function() constructors
- Synchronous file I/O in request handlers
- Hardcoded credentials (use environment variables)
