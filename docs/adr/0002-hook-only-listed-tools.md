# 0002. Hook only the tools that are measured

Status: accepted (2026-11-25, recorded after the fact; decided in 2.1.0)

## Context
The card counts the tool output that enters the conversation, by tool, and the files read again unchanged. A
`tool.call` hook sees every call and its result. A catch-all hook would be the shortest code, but a hook on a tool
turns off that tool's move to the background and its live output.

## Decision
Hook only the tools whose output is measured: Read, Grep, Glob, WebFetch, WebSearch (measure only) and Edit, Write,
NotebookEdit (forget the edited path, then measure). Each hook awaits `next(e)` and returns its result unchanged; the
measuring never throws.

## Consequences
- Bash and other long-running tools keep their background move and live output.
- Tool output from tools not on the list is not counted: the TOOL OUTPUT figure is a lower bound.
- A new tool to measure means a new hook entry, and a check that the tool has no background or live behaviour to lose.
