# PP-OCRv5 worker protocol (JSON Lines)

## Process
`venv_ppocrv5\Scripts\python.exe -m src.workers.ppocrv5_worker`

## Requests (stdin, one JSON object per line)

### ping
`{"request_id":"...", "command":"ping"}`

### recognize
`{"request_id":"...", "command":"recognize", "field_name":"name_en", "crop_path":"..."}`

### shutdown
`{"command":"shutdown", "request_id":"..."}`

## Responses (stdout only)
One JSON line per request. Diagnostics on stderr (discarded by client).

## Integrity
Worker refuses service if `en_PP-OCRv5_rec_mobile.onnx` SHA-256 mismatch.

## Client
`src/workers/ppocrv5_client.py` — lazy start, one restart + one retry on failure.
