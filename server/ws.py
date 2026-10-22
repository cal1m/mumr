"""WebSocket (RFC 6455) on a connection that http.server already accepted: the upgrade answer and the frames.
Standard library only. Nothing here knows about the app (see hub.py).
From Nudgy (KTE/Project2, simulator/mr/ws.py), unchanged apart from this line.
"""
import base64
import hashlib
import struct

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
TEXT, BINARY, CLOSE, PING, PONG = 1, 2, 8, 9, 10
MAX_FRAME = 4_000_000


def accept_key(key):
    return base64.b64encode(hashlib.sha1((key.strip() + GUID).encode()).digest()).decode()


def accept(handler):
    """Answer a BaseHTTPRequestHandler's request with 101 Switching Protocols. False: it is no WebSocket request."""
    h = handler.headers
    key = h.get("Sec-WebSocket-Key")
    if not key or "websocket" not in (h.get("Upgrade") or "").lower():
        return False
    handler.send_response(101, "Switching Protocols")
    handler.send_header("Upgrade", "websocket")
    handler.send_header("Connection", "Upgrade")
    handler.send_header("Sec-WebSocket-Accept", accept_key(key))
    handler.end_headers()
    handler.wfile.flush()
    return True


def _exactly(rfile, n):
    buf = b""
    while len(buf) < n:
        part = rfile.read(n - len(buf))
        if not part:
            return None
        buf += part
    return buf


def read_frame(rfile):
    """The next whole message as (opcode, payload), pieces joined; a ping or a pong as it is. None: closed or broken."""
    opcode, whole = None, b""
    while True:
        head = _exactly(rfile, 2)
        if head is None:
            return None
        fin, op, masked, n = head[0] & 0x80, head[0] & 0x0F, head[1] & 0x80, head[1] & 0x7F
        if n == 126:
            ext = _exactly(rfile, 2)
            if ext is None:
                return None
            n = struct.unpack(">H", ext)[0]
        elif n == 127:
            ext = _exactly(rfile, 8)
            if ext is None:
                return None
            n = struct.unpack(">Q", ext)[0]
        if n > MAX_FRAME or len(whole) + n > MAX_FRAME:
            return None
        mask = _exactly(rfile, 4) if masked else None
        if masked and mask is None:
            return None
        data = _exactly(rfile, n) if n else b""
        if data is None:
            return None
        if mask:
            data = bytes(b ^ mask[i & 3] for i, b in enumerate(data)) if n < 64 else _unmask(data, mask)
        if op == CLOSE:
            return CLOSE, data                   # (with its code and reason: close_info)
        if op in (PING, PONG):
            return op, data
        if op != 0:
            opcode = op
        whole += data
        if fin:
            return (opcode, whole) if opcode is not None else None


def close_info(payload):
    """(code, reason) from the payload of a close frame; (None, '') when it says nothing."""
    if len(payload) < 2:
        return None, ""
    return struct.unpack(">H", payload[:2])[0], payload[2:].decode("utf-8", "replace")


def _unmask(data, mask):
    n = len(data)
    key = (mask * (n // 4 + 1))[:n]
    return (int.from_bytes(data, "big") ^ int.from_bytes(key, "big")).to_bytes(n, "big")


def write_frame(wfile, opcode, payload):
    n = len(payload)
    if n < 126:
        head = bytes([0x80 | opcode, n])
    elif n < 65536:
        head = bytes([0x80 | opcode, 126]) + struct.pack(">H", n)
    else:
        head = bytes([0x80 | opcode, 127]) + struct.pack(">Q", n)
    wfile.write(head + payload)
    wfile.flush()
