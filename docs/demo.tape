# Canonical demo recording for AgentCI Guard.
#
# Render the GIF with:
#   brew install vhs        # https://github.com/charmbracelet/vhs
#   vhs docs/demo.tape      # writes docs/demo.gif
#
# Run from the repo root after `pnpm build` so dist/ exists.

Output docs/demo.gif

Set Shell bash
Set FontSize 16
Set Width 1100
Set Height 780
Set Padding 20
Set Theme "Dracula"

# Alias the local build to the published command name (hidden from the recording).
Hide
Type "export PS1='$ '"
Enter
Type "alias agentci='node dist/cli.js'"
Enter
Type "clear"
Enter
Show

Type "agentci scan examples/vulnerable"
Sleep 800ms
Enter
Sleep 4s

Type "agentci explain agentci/untrusted-ai-write-token"
Sleep 800ms
Enter
Sleep 4s
