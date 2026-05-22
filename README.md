# Hands-On Lab: Puku CLI CI/CD Pipeline Integration

This lab translates CI/CD integration concepts into practical implementation. You will configure non-interactive mode, parse structured JSON output, implement session isolation for code review, build GitHub Actions workflows, and automate merge gates based on severity levels.


## Environment Setup

Create a working directory for this lab:

```bash
mkdir -p puku-cli-cicd-lab
cd puku-cli-cicd-lab
git init
mkdir -p src scripts .github/workflows
touch requirements.txt
```

Initialize the project with a basic Node.js configuration:

```bash
npm init -y
npm install --save-dev jest
```

---

## Chapter 1: Non-Interactive Mode
### 1.3 Non-Interactive Execution

The `-p` / `--print` flag executes a single prompt and exits immediately:

```bash
puku-cli -p "Say hello in one word"
```

**Expected Output:**
```
Hello
```

**What happens:** Puku CLI executes the single instruction, prints the response, and immediately exits with exit code 0. The process terminates cleanly without waiting for further input.

## Chapter 2: Machine-Readable Output

### 2.3 Structured JSON Output

Generate JSON output using the output format flag:

```bash
puku-cli -p "Analyze this code and return a JSON summary" \
  --output-format json
```

**Expected Output:**
```json
{
  "summary": "The codebase contains 3 files with approximately 450 lines of code...",
  "metrics": {
    "files": 3,
    "lines": 450,
    "languages": ["python"]
  }
}
```

**What happens:** Puku CLI returns machine-parseable JSON instead of prose. The structured format allows downstream scripts to extract specific values without text parsing.

---

### 2.4 Schema Enforcement

Combine JSON output with schema validation:

```bash
puku-cli -p "Review the auth module and return findings" \
  --output-format json \
  --json-schema '{
    "type": "object",
    "properties": {
      "findings": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "severity": {"type": "string", "enum": ["critical", "high", "medium", "low"]},
            "description": {"type": "string"}
          }
        }
      }
    }
  }'
```

**Expected Output:**
```json
{
  "findings": [
    {
      "severity": "high",
      "description": "Unhandled promise rejection in login handler"
    },
    {
      "severity": "medium",
      "description": "Missing input validation on user email field"
    }
  ]
}
```

**What happens:** Puku validates that output conforms to the schema. If the output structure doesn't match (e.g., missing required fields or invalid enum values), the command exits with an error and the pipeline fails immediately.

## Chapter 3: Session Isolation

### 3.3 The Solution: Fresh Sessions

The key principle: separate CI jobs should use separate Puku sessions.

```bash
# Job 1: Development (Session A)
puku-cli -p "Create a user authentication module at src/auth.ts with email/password login, export a login function, and use bcrypt for password hashing"

# Job 2: Review (Session B - separate invocation)
puku-cli -p "Review src/feature.ts for security issues"
```

**Expected Output for Job 1:**
```
Created src/feature.ts with implementation
```

**Expected Output for Job 2:**
```json
{"findings":[{"severity":"low","file":"src/feature.ts","line":42,"description":"Missing JSDoc comment"}]}
```

**What happens:** Each job invokes Puku in a fresh context. Job 1 builds the feature without knowledge of what the review will find. Job 2 reviews the code objectively because it has no prior commitment to the implementation. This prevents rationalization bias where the model defends its own prior work.


## Chapter 4: Project Context with PUKU.md

### 4.3 PUKU.md Structure for CI/CD

Create `PUKU.md` in the project root:

```markdown
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
```

**What happens:** When Puku starts in this project directory, it automatically reads `PUKU.md` and loads the code review standards. Every session will output findings in the specified JSON format without requiring manual instructions about output requirements.

---

### 4.4 Severity Levels

Define severity levels in PUKU.md:

| Level | Criteria | Action |
|-------|----------|--------|
| critical | Auth bypass, SQLi, XSS, secrets exposure | Block merge immediately |
| high | Unhandled promise rejections, memory leaks | Require fix before merge |
| medium | Missing error handling, code smells | Suggest improvements |
| low | Style issues, missing JSDoc | Optional fixes |

**What happens:** When Puku reviews code and finds issues, it classifies each finding according to these definitions. The classification determines the merge gate outcome: critical findings block the PR, high findings require fixes, medium/low findings are informational.

---

### 4.5 Rejected Patterns

Document patterns that should always fail review:

```markdown
## Rejected Patterns
- console.log() in production code
- eval() or Function() constructors
- Synchronous file I/O in request handlers
- Hardcoded credentials (use environment variables)
```

**What happens:** Puku detects these patterns during review and flags them as failures. Any rejected pattern triggers a high or critical severity finding that enforces the merge gate policy.


## Chapter 5: Building the GitHub Actions Workflow

### 5.3 Create the Workflow File

Create `.github/workflows/puku-review.yml`:

```yaml
name: Puku CLI Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Puku CLI Review
        env:
          PUKU_API_KEY: ${{ secrets.PUKU_API_KEY }}
        run: |
          puku -p "Review the changes in this PR" \
            --output-format json \
            --json-schema '{
              "type": "object",
              "properties": {
                "findings": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "severity": {"type": "string"},
                      "file": {"type": "string"},
                      "line": {"type": "number"},
                      "description": {"type": "string"}
                    }
                  }
                }
              }
            }' > findings.json

      - name: Parse and Enforce
        run: |
          if grep -q '"severity": "critical"' findings.json; then
            echo "Critical issues found. Blocking merge."
            exit 1
          fi
          echo "No critical issues. Proceeding."
```

### 5.4 Setting Up Secrets

Add your Puku API key as a GitHub secret:

1. Navigate to the repository Settings
2. Select Secrets and variables, then Actions
3. Create a new secret named `PUKU_API_KEY`

**What happens:** GitHub Actions workflow can now access `secrets.PUKU_API_KEY` environment variable. Puku CLI will use this API key for authentication. Without this secret, the workflow fails at the Puku invocation step with an authentication error.

---

### 5.5 Local Testing

Test the non-interactive mode locally before pushing:

```bash
puku-cli -p "Review src/auth.ts for security issues" \
  --output-format json \
  --json-schema '{
    "type": "object",
    "properties": {
      "findings": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "severity": {"type": "string", "enum": ["critical", "high", "medium", "low"]},
            "file": {"type": "string"},
            "line": {"type": "number"},
            "description": {"type": "string"}
          }
        }
      }
    }
  }' 2>&1 | jq '.structured_output'
```

**Expected Output:**
```json
{
  "findings": [
    {
      "severity": "critical",
      "file": "src/auth.js",
      "line": 42,
      "description": "SQL injection vulnerability in user lookup"
    }
  ]
}
```

**What happens:** The command runs, produces JSON output, and exits. If critical issues are found, you can fix them locally before pushing. This validates your workflow configuration and PUKU.md settings work correctly.


## Chapter 6: Deduplication and Delta Review

### 6.3 Fetching Prior Findings

Retrieve findings from a previous run to avoid duplicates:

```bash
gh run list --workflow=puku-review.yml --status=completed \
  --json artifactsUrl --jq '.[0].artifactsUrl'
```

**Expected Output:**
```
https://api.github.com/repos/owner/repo/actions/artifacts/12345678
```

**What happens:** The command queries GitHub API for the most recent completed workflow run and extracts the artifact URL. If no completed runs exist, output is empty. This URL can be used to download prior findings for deduplication.

---

### 6.4 Delta Review Logic

Complete the script to filter changed files:

```python
# scripts/delta_review.py
import json
import subprocess

# Get list of changed files in this PR
result = subprocess.run(
    ["git", "diff", "--name-only", "origin/main"],
    capture_output=True, text=True
)
changed_files = result.stdout.strip().split("\n")

# Filter findings to only changed files
with open("findings.json") as f:
    findings = json.load(f)

filtered = [f for f in findings["findings"] if f["file"] in changed_files]
print(json.dumps({"findings": filtered}, indent=2))
```

**Expected Output:**
```json
{
  "findings": [
    {
      "severity": "high",
      "file": "src/auth.js",
      "line": 42,
      "description": "SQL injection vulnerability"
    }
  ]
}
```

**What happens:** The script filters findings to only include issues in files that changed in this PR. Findings for unchanged files are removed. If a file was modified and had a critical finding previously, that finding appears again. New findings on unchanged files are excluded.


## Chapter 7: Error Handling and Retry Logic

### 7.3 Retry Implementation

Add retry logic to the workflow:

```yaml
- name: Run Puku Review with Retry
  run: |
    for i in 1 2 3; do
      puku -p "Review the PR changes" \
        --output-format json > findings.json && break
      echo "Attempt $i failed. Retrying..."
      sleep 5
    done
```

**Expected Output (Success on first attempt):**
```
<no output>
```
Exit code: 0

**Expected Output (Success on third attempt):**
```
Attempt 1 failed. Retrying...
Attempt 2 failed. Retrying...
<no output>
```
Exit code: 0

**What happens:** The loop attempts up to 3 runs. On success, the `&& break` exits the loop immediately. On failure, it prints a message, waits 5 seconds, then retries. If all 3 attempts fail, the loop exits and the step fails.

---

### 7.4 Fallback Strategy

When all retries fail, the workflow should report degraded status:

```yaml
- name: Fallback Check
  if: failure()
  run: |
    echo "Puku API unavailable. Running basic checks."
    npm run lint
```

**Expected Output:**
```
Puku API unavailable. Running basic checks.

> npm run lint

lint running...
```

**What happens:** This step only runs if the previous step failed. It provides graceful degradation by running basic static checks (linting) instead of completely failing the pipeline. The workflow exits with lint results rather than a hard failure.
