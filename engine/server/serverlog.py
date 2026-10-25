"""The server's own log, always on while serve.py runs (mumr-server.log in the app's folder, unless told otherwise).

Why it exists: a recorder that reads what a page sends from its frame loop goes blind exactly when it matters: when the app is
hidden, the headset is taken off, the session is blurred (Nudgy, 2026-10-22). This file is written by the server itself, from
every request and every socket, so it says what happened even then:

    server    started, on which address
    page      every fetch of an .html page (who, which), and every request that failed
    ws        a socket: opened, joined, left (why, close code, how long it was up), silent, heard again, motion replaced
    token     who holds what, every change (hub.py)
    life      the page's own life lines (engine/client/life.js), posted to /log the moment they happen

One line each: "HH:MM:SS.mmm  kind     text". Each line is written at once (the file is opened for appending each time, so it
can be read, moved or deleted while the server runs).
"""
import os
import threading
import time


def stamp(t=None):
    t = time.time() if t is None else t
    return time.strftime("%H:%M:%S", time.localtime(t)) + ".%03d" % int((t % 1) * 1000)


class ServerLog:
    def __init__(self, path, wall=time.time):
        self.path = path
        self.wall = wall
        self.lock = threading.Lock()
        self.lines = {}                   # page id -> the highest life line number written

    def __call__(self, kind, text):
        if not self.path:
            return
        line = "%s  %-8s %s\n" % (stamp(self.wall()), kind, str(text).replace("\r", " ").replace("\n", " "))
        with self.lock:
            try:
                with open(self.path, "a", encoding="utf-8") as f:
                    f.write(line)
            except OSError:
                pass                      # a log that cannot be written must not stop the server

    def life(self, msg):
        """A /log post: {pid, name, n, lines} with lines numbered n, n+1, ...; lines already written are skipped (a page that
        resends after a post that failed). False: not a post of that shape."""
        if not isinstance(msg, dict) or not isinstance(msg.get("lines"), list):
            return False
        pid = str(msg.get("pid"))[:40]
        name = str(msg.get("name") or "?")[:24]
        try:
            n = int(msg.get("n"))
        except (TypeError, ValueError):
            return False
        top = self.lines.get(pid, n - 1)
        for i, text in enumerate(msg["lines"][:200]):
            if n + i > top:
                self("life", "%s #%d  %s" % (name, n + i, str(text)[:2000]))
                top = n + i
        self.lines[pid] = top
        return True


def in_folder(folder, name="mumr-server.log"):
    return ServerLog(os.path.join(os.path.abspath(folder), name))
