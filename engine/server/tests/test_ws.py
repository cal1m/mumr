"""WebSocket frames (engine/server/ws.py). From Nudgy's test_ws.py."""
import io
import os
import struct
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import ws  # noqa: E402


def client_frame(opcode, payload, fin=True, mask=b"\x11\x22\x33\x44"):
    """A frame as a browser sends it: masked."""
    head = bytes([(0x80 if fin else 0) | opcode])
    n = len(payload)
    if n < 126:
        head += bytes([0x80 | n])
    elif n < 65536:
        head += bytes([0x80 | 126]) + struct.pack(">H", n)
    else:
        head += bytes([0x80 | 127]) + struct.pack(">Q", n)
    return head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload))


class WsTest(unittest.TestCase):
    def test_the_accept_key_of_the_rfc(self):
        self.assertEqual(ws.accept_key("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=")

    def test_masked_frames_of_all_three_length_encodings_are_read(self):
        for n in (5, 200, 70000):
            data = bytes(i % 251 for i in range(n))
            self.assertEqual(ws.read_frame(io.BytesIO(client_frame(2, data))), (2, data))
        self.assertEqual(ws.read_frame(io.BytesIO(client_frame(1, "žluťoučký".encode()))), (1, "žluťoučký".encode()))

    def test_written_frames_are_unmasked_and_read_back(self):
        for n in (0, 5, 200, 70000):
            data = bytes(i % 251 for i in range(n))
            out = io.BytesIO()
            ws.write_frame(out, 2, data)
            raw = out.getvalue()
            self.assertEqual(raw[0], 0x82)
            self.assertEqual(raw[1] & 0x80, 0, "the server does not mask")
            self.assertEqual(ws.read_frame(io.BytesIO(raw)), (2, data))

    def test_a_message_in_pieces_comes_back_whole(self):
        raw = client_frame(1, b"one ", fin=False) + client_frame(0, b"two ", fin=False) + client_frame(0, b"three")
        self.assertEqual(ws.read_frame(io.BytesIO(raw)), (1, b"one two three"))

    def test_a_close_frame_comes_up_with_its_code_and_reason(self):
        self.assertEqual(ws.read_frame(io.BytesIO(client_frame(8, b""))), (8, b""))
        payload = struct.pack(">H", 1001) + b"going away"
        op, data = ws.read_frame(io.BytesIO(client_frame(8, payload)))
        self.assertEqual((op, ws.close_info(data)), (8, (1001, "going away")))
        self.assertEqual(ws.close_info(b""), (None, ""))
        self.assertEqual(ws.close_info(b"\x03"), (None, ""))

    def test_the_end_of_the_stream_gives_none(self):
        self.assertIsNone(ws.read_frame(io.BytesIO(b"")))
        self.assertIsNone(ws.read_frame(io.BytesIO(client_frame(2, b"abcdef")[:-2])), "cut short")

    def test_a_ping_is_handed_up_so_that_it_can_be_answered(self):
        self.assertEqual(ws.read_frame(io.BytesIO(client_frame(9, b"hi"))), (9, b"hi"))

    def test_a_frame_too_large_is_refused(self):
        head = bytes([0x82, 0x80 | 127]) + struct.pack(">Q", ws.MAX_FRAME + 1) + b"\0\0\0\0"
        self.assertIsNone(ws.read_frame(io.BytesIO(head)))


if __name__ == "__main__":
    unittest.main()
