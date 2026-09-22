# Images, patches and output pages

`import_image` accepts the official ChatGPT file input protocol:
`_meta["openai/fileParams"] = ["file"]`, with required `download_url` and
`file_id`, and optional `mime_type` and `file_name`.
See [OpenAI file inputs](https://developers.openai.com/plugins/reference#define-file-inputs).

The runtime downloads the referenced file, fully decodes it with sharp, checks the
actual format, dimensions, MIME and destination extension, then atomically saves
its original bytes. It returns path, SHA-256, byte count, width, height and format.
It never reads browser cookies, generates images, or calls an image model API.
Signed URLs are not returned or written to audit logs.

Only HTTPS `*.oaiusercontent.com` and the exact ChatGPT attachment host
`oaisdmntprnorthcentralus.blob.core.windows.net` and
`oaisdmntprcentralus.blob.core.windows.net` are accepted, including every
redirect. Other Azure storage accounts are not accepted.
Downloads time out after 30 seconds; at most 20 MiB, 40 million pixels, 16384 pixels
per side; single-frame PNG/JPEG/WebP only. These are separate from text-file limits.
A file hosted elsewhere fails explicitly rather than widening network access.
Use `expectedSha256: null` to create; use the prior import hash to replace. Private
paths, symlinks, hardlinks and traversal are denied. This is not an OS sandbox.
Image files may contain metadata; original bytes are preserved, not sanitized.

Live validation on 2026-09-22 passed: ChatGPT Work generated a moon image with its
native image tool, passed the real file to `import_image`, and saved a 1254×1254
PNG (1,183,182 bytes) into a local project without manual download/upload,
Codex delegation, or an image API key. This verifies the tested session, not
every ChatGPT model or account configuration.

A generated-image preview or `sandbox:/mnt/data/...` path is not a downloadable
file reference. Automatic handoff depends on ChatGPT making the image available
to file parameters in that conversation. Do not invent a URL/file ID or claim an
image was saved when the tool did not succeed. If the host cannot pass a generated
image, download/attach that image in ChatGPT and request import again.

`patch_file` accepts `path`, the hash returned by `read_file`, and 1–100
`{oldText,newText}` edits. All matches refer to the ORIGINAL file; each must occur
exactly once and ranges must not overlap. Any failed match/conflict rejects the
whole operation. Edits preserve untouched text including line endings. This is
exact text replacement, not a fuzzy unified-diff parser. Resulting file size must
fit the configured text limit.

`get_command({id,includeOutput:false})` polls status without repeating logs.
`read_command_output({id,stream:"stdout",offset:0,limit:16384})` returns one page,
`nextOffset`, `hasMore`, status, exit code and truncation. Use `stream:"stderr"`
for the other stream. Reuse `nextOffset` exactly; offsets count UTF-16 units but
surrogate pairs are never split. The limit may be exceeded by one unit to preserve
a pair. `hasMore:false` means caught up, not command completed: poll again while
running. Completed output survives restart. Pages cannot recover bytes discarded
by the total output retention cap. No per-line truncation is applied.

## Chat / 6 Pro

Live-tested in 0.4.1: Chat with 6 Pro selected generates an image; a later bridge
request imports the original from ChatGPT's library without manual transfer.
Explicitly select Web Agent Bridge in the chat. Ask it to pass the real attachment
through `file`, not put a file ID or `/mnt/data` path into `download_url`.
If needed, retrieve the original from the ChatGPT file library or re-export the
existing generated file as an attachment. Do not redraw it. A generated preview
alone is not proof of local delivery: require the import receipt with path/hash.
The observed workflow used separate generate/import requests. Tool availability
can vary across turns; reattach the plugin or start a new chat if it is missing.
Other storage regions remain denied until separately verified and added.
