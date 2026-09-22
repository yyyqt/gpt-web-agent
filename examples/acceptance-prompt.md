Use only the Web Agent Bridge connection for the following local project task.
First call workspace_info and list_files to confirm the disposable demo workspace.
Do not operate outside it, read credentials, deploy, publish, or contact external services.

Create a new directory named bridge-demo-acceptance (if it already exists, stop
and report the conflict). In it, create sum.cjs exporting `(a, b) => a - b`, and a
sum.test.cjs file using node:assert/strict to assert that sum(2, 3) is 5.
Run `node sum.test.cjs` in that directory with start_command, then poll get_command
until it exits. Show the actual failing exit code and the relevant error.
Read sum.cjs, correct it to addition using write_file with its exact SHA-256, and
run the same test again. Wait for completion and report the final exit code.
Save a completed task checkpoint only if the test succeeds. Give the relative
paths to the files and distinguish actual tool evidence from any inference.
