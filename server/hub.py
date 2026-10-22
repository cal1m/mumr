"""The MUMR hub: who is in the shared world, in what order things happened, and who simulates what. No sockets here:
every connection is two callables that send it a text message (a dict) or a binary one. Nothing here knows the app.

Two roles join (the first message, {t:'join', build, name, role}):
    player   (default) a headset: takes a slot (0 to max_peers - 1), gets events, tokens and everybody's motion
    viewer   a watcher (a PC page that shows the whole world): an id from VIEWER_BASE, not a player (no slot, not listed to the
             players, no tokens). It gets every event, token change and motion packet. It may only make OWNED things (below).

A join from a page of another build is refused ({t:'refused', why:'version'}): a headset that runs an old page is the most
common cause of "half of it works".

COMING BACK. A player's hello carries a `key`. A player whose connection goes (a Wi-Fi stall makes the page give up after 4 s; a reload)
keeps its place for `resume_hold` seconds: its slot, its settings, its line-up and its owned things stay, the others are not told it
left, only its tokens go to others at once (so that nothing waits for it). A join with {resume: {slot, key}} in that time gets the same
slot back (hello.resumed: true), also when the hub still holds the old connection (it is closed then). After that time it is gone as
usual ('peer' off to everyone). First headset run, 2026-10-22: a 4 s stall made the headset come back as a new player.

Text messages (dicts) from a player:
    {t:'ev', e}            an event of the shared document: numbered and sent to everyone (viewers too), the sender too
    {t:'to', to, m}        a message for one slot
    {t:'ask', key, m}      a message for whoever OWNS the document entry `key`, and nobody else (it is not kept)
    {t:'claim', body}      ask for a token (any name the app likes, [A-Za-z0-9_.:-]{1,40})
    {t:'busy', body, on}   the holder says a hand is on the thing: nobody else gets the token meanwhile
    {t:'release', body}    the holder gives it up: nobody holds it then, or for one of `bodies` the earliest other player (a page that
                           nobody looks at: a hidden tab, a headset taken off)
    {t:'ping', c}          answered with {t:'pong', c, s}: s is the hub's clock (ms); also how the hub knows the page is alive
    {t:'clock', off}       the page's offset to the hub's clock (ms); passed on to everyone as {t:'clock', slot, off}
    {t:'bye'}              the page is closing on purpose: its place is not kept when its connection goes

THE DOCUMENT. The hub keeps a compacted copy of the events: the newest event for each thing, in the order they last happened, and
gives it to everyone who joins (hello.doc, a list of {from, e}). What an event is ABOUT is said by the event itself, so that the hub
needs no list of the app's kinds:
    key: 'mark:17'      the thing it is about. The newest event with a key is kept (an event without a key is passed on, not kept)
    drop: true          the thing is gone: the key is forgotten (the event is still passed on)
    clear: 'player:1:'  first forget every key that starts with this (an event that says all of something at once)
    scope: 'slot'       the thing belongs to the sending player: forgotten when that player leaves (everyone hears 'peer' off anyway)
    own: true           the thing is OWNED by the sending connection (a player or a viewer): only it may change or drop it, others may
                        only `ask`, and when it leaves the hub sends `gone` (an event the owner supplied with it) to everyone. At most
                        MAX_OWNED owned things per connection, and at most OWN_RATE changes a second
What an event DOES is the pages' business (client/session.js): the hub never interprets the rest of it.

Binary messages: byte 0 is the type, byte 1 becomes the sender's slot, the rest is passed on untouched to everyone else (viewers
too). A type listed in `owned` ({type: token}) is only heard from the holder of that token: two authorities cannot both be heard.
The newest packet of each (type, sender) is kept and given to everyone who joins, so that things at rest need not keep sending.

Tokens: `bodies` always exist and always have a holder while anyone is here (the earliest player; when the holder leaves or goes
silent for `silent` seconds while others are alive, the earliest one alive). Any other token is made by its first claim, and is
held by nobody once its holder leaves, goes silent or releases it.
"""
import collections
import json
import re
import secrets
import threading
import time

BIN = "bin"           # what Outbox.get() calls a motion packet: (BIN, bytes)
VIEWER_BASE = 100
MAX_VIEWERS = 8
MAX_KEPT = 2_000_000  # bytes (as JSON) of one kept event, at most
MAX_OWNED = 16        # owned things per connection
OWN_RATE = 20         # changes of owned things a connection may make in a second
MAX_TOKENS = 512
RESUME_HOLD = 10.0    # s: how long a player whose connection went keeps its place
RELEASE_HOLD = 5.0    # s: a page that gave a body up is not handed it again for this long
SILENT = 2.5          # s: a holder that said nothing for this long (pings come 4 times a second) loses its tokens. Not 1 s: a page
                      # that is not in front has its timers slowed to once a second (measured on the Quest Browser, 2026-10-15)
_NAME = re.compile(r"[A-Za-z0-9_.:-]{1,40}")
_KEY = re.compile(r"\S{1,120}")


class Outbox:
    """What is waiting to be sent to one connection. Messages (events, who holds what, who is here) all go, in order, and
    first. Motion keeps only the newest packet of each kind and sender: a headset that was taken off or whose page was
    frozen stops reading its socket, and old motion must neither pile up for it nor crowd out the messages that matter.
    A connection is only called dead when it is far behind on MESSAGES (`put_text` says False)."""

    def __init__(self, max_text=1000):
        self.cv = threading.Condition()
        self.texts = collections.deque()
        self.bins = collections.OrderedDict()          # (type, sender) -> bytes
        self.max_text, self.closed, self.dropped = max_text, False, 0

    def put_text(self, item):
        with self.cv:
            if self.closed or len(self.texts) >= self.max_text:
                return False
            self.texts.append(item)
            self.cv.notify()
            return True

    def put_bin(self, data):
        if len(data) < 2:
            return
        with self.cv:
            if self.closed:
                return
            key = (data[0], data[1])
            if key in self.bins:
                self.dropped += 1
                del self.bins[key]                      # (the newer one goes to the back)
            self.bins[key] = bytes(data)
            self.cv.notify()

    def pending(self):
        with self.cv:
            return len(self.texts), len(self.bins)

    def close(self):
        with self.cv:
            self.closed = True
            self.cv.notify_all()

    def get(self, timeout=None):
        """The next thing to send: a message as it was put in, or (BIN, bytes). None: nothing came within `timeout`
        seconds, or it is closed and everything has gone."""
        with self.cv:
            self.cv.wait_for(lambda: self.texts or self.bins or self.closed, timeout)
            if self.texts:
                return self.texts.popleft()
            if self.bins:
                return (BIN, self.bins.popitem(last=False)[1])
            return None


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and abs(v) != float("inf")


class Hub:
    def __init__(self, build_fn, now_fn=time.monotonic, max_peers=4, bodies=(), owned=None, silent=SILENT, log=None, resume_hold=RESUME_HOLD):
        self.build_fn, self.now, self.max_peers, self.silent, self.resume_hold = build_fn, now_fn, max_peers, silent, resume_hold
        self.log = log or (lambda kind, text: None)
        self.lock = threading.RLock()
        self.bodies = tuple(bodies)
        self.owned = {int(t): str(b) for t, b in (owned or {}).items()}       # packet type -> the token whose holder alone may send it
        self.peers = {}                     # slot -> { text, bin, name, order, last, conn, kill, key }
        self.parked = {}                    # slot -> { name, order, key, at }: players whose connection went, who may come back
        self.viewers = {}                   # id -> { text, bin, name, last, conn, kill }
        self.tokens = {b: None for b in self.bodies}
        self.busy = {b: False for b in self.bodies}
        self.n = 0                          # number of the last event
        self._order = 0
        self.doc = collections.OrderedDict()    # key -> { e, from, scope (a slot or None), owner (an id or None), gone }
        self.latest = {}                    # (type, slot) -> the newest motion packet of that kind from that player
        self.clock_off = {}                 # slot -> the page's offset to this clock, ms
        self._own_times = {}                # who -> when its last owned changes were (the rate limit)
        self._released = {}                 # body -> { who: when it last gave that body up }

    # ---- sending. A connection whose send fails is gone: it is taken out once the current round is over.
    def _who(self, who):
        return self.peers.get(who) if who < VIEWER_BASE else self.viewers.get(who)

    def _text(self, who, msg, dead):
        p = self._who(who)
        if not p:
            return
        try:
            p["text"](msg)
        except Exception:                   # noqa: BLE001  whatever the socket raised, it is gone
            dead.add(who)

    def _all(self, msg, dead, but=None):
        """Every player and every viewer."""
        for who in list(self.peers) + list(self.viewers):
            if who != but:
                self._text(who, msg, dead)

    def _bury(self, dead):
        for who in dead:
            p = self._who(who)
            if p and p.get("kill"):
                try:
                    p["kill"]()                 # it is given up on: its socket is closed too, so that it knows and comes back
                except Exception:               # noqa: BLE001
                    pass
            self.leave(who)

    def _mine(self, who, conn):
        """Is this still the connection that holds `who`? (An old one that is still open must not speak for a newcomer.)"""
        p = self._who(who)
        return p is not None and (conn is None or p.get("conn") is None or p["conn"] is conn)

    def _earliest(self, alive_since=None):
        best = None
        for slot, p in self.peers.items():
            if alive_since is not None and p["last"] < alive_since:
                continue
            if best is None or p["order"] < self.peers[best]["order"]:
                best = slot
        return best

    def _give(self, body, slot, dead):
        if self.tokens.get(body, "?") == slot:
            return
        self.tokens[body] = slot
        self.busy[body] = False
        self.log("token", "%s -> %s" % (body, "nobody" if slot is None else self.label(slot)))
        self._all({"t": "token", "body": body, "slot": slot}, dead)

    def label(self, who):
        """For the server's log lines."""
        return "viewer %d" % (who - VIEWER_BASE + 1) if who >= VIEWER_BASE else "player %d" % (who + 1)

    def _hello_common(self):
        everyone = sorted(list(self.peers.items()) + list(self.parked.items()))
        return {"peers": [{"slot": s, "name": p["name"]} for s, p in everyone], "tokens": dict(self.tokens), "n": self.n,
                "doc": [{"from": d["from"], "e": d["e"]} for d in self.doc.values()], "clocks": {str(s): o for s, o in self.clock_off.items()},
                "viewers": len(self.viewers)}

    # ---- the document
    def _own_allowed(self, who):
        now = self.now()
        q = self._own_times.setdefault(who, collections.deque())
        while q and now - q[0] > 1.0:
            q.popleft()
        if len(q) >= OWN_RATE:
            return False
        q.append(now)
        return True

    def _event(self, who, e, dead):
        """An event from a player or a viewer: kept as the document says, numbered, sent to everyone. False: refused."""
        if not isinstance(e, dict) or not isinstance(e.get("k"), str):
            return False
        key, own = e.get("key"), e.get("own") is True
        if key is not None and not (isinstance(key, str) and _KEY.fullmatch(key)):
            return False
        if who >= VIEWER_BASE and not (own and key is not None):
            return False                                        # (a viewer only watches, apart from the things it owns)
        ent = self.doc.get(key) if key is not None else None
        if ent is not None and ent["owner"] is not None and ent["owner"] != who:
            return False                                        # somebody else's
        if own:
            if key is None or (ent is not None and ent["owner"] is None):
                return False                                    # (owning a thing that is already there and nobody's would take it over)
            if ent is None and sum(1 for d in self.doc.values() if d["owner"] == who) >= MAX_OWNED:
                return False
            if ent is not None and not e.get("drop") and ent["e"] == e:
                return True                                     # nothing new: not worth a number
            if not self._own_allowed(who):
                return False
        if key is not None and not e.get("drop") and len(json.dumps(e, separators=(",", ":"))) > MAX_KEPT:
            return False
        clear = e.get("clear")
        if isinstance(clear, str) and clear:
            for k in [k for k, d in self.doc.items() if k.startswith(clear) and (d["owner"] is None or d["owner"] == who)]:
                del self.doc[k]
        if key is not None:
            self.doc.pop(key, None)
            if not e.get("drop"):
                gone = e.get("gone") if own and isinstance(e.get("gone"), dict) else None
                if gone is not None:
                    gone = dict(gone, key=key, drop=True)
                    gone.pop("own", None)
                self.doc[key] = {"e": e, "from": who, "scope": who if e.get("scope") == "slot" and who < VIEWER_BASE else None,
                                 "owner": who if own else None, "gone": gone}
        self.n += 1
        self._all({"t": "ev", "n": self.n, "from": who, "e": e}, dead)
        return True

    def _forget(self, who, dead):
        """A connection left: what was its own goes. Things scoped to a player go quietly (everyone hears 'peer' off), owned things
        with their `gone` event."""
        for k in [k for k, d in self.doc.items() if d["scope"] == who and d["owner"] is None]:
            del self.doc[k]
        for k, d in [(k, d) for k, d in self.doc.items() if d["owner"] == who]:
            del self.doc[k]
            if d["gone"] is not None:
                self.n += 1
                self._all({"t": "ev", "n": self.n, "from": who, "e": d["gone"]}, dead)
        self._own_times.pop(who, None)
        if who < VIEWER_BASE:
            self.clock_off.pop(who, None)
            for key in [x for x in self.latest if x[1] == who]:
                del self.latest[key]

    def _ask(self, who, msg, dead):
        key = msg.get("key")
        d = self.doc.get(key) if isinstance(key, str) else None
        if d is None or d["owner"] is None or d["owner"] == who or not self._own_allowed(who):
            return
        self._text(d["owner"], {"t": "ask", "key": key, "m": msg.get("m"), "from": who}, dead)

    def _tell_viewers(self, dead):
        """Every player hears how many are watching (a headset that is alone sends its motion only when it is watched)."""
        for slot in list(self.peers):
            self._text(slot, {"t": "viewers", "n": len(self.viewers)}, dead)

    # ---- the connections
    def join(self, send_text, send_bin, msg, conn=None, kill=None):
        """The first message of a connection. Returns the id (a player's slot or a viewer's), or None after telling why not."""
        with self.lock:
            if not isinstance(msg, dict) or msg.get("t") != "join":
                return None
            try:
                same = int(msg.get("build", 0)) == int(self.build_fn())
            except (TypeError, ValueError):
                same = False
            role = msg.get("role", "player")
            why = None if same else "version"
            if why is None and role not in ("player", "viewer"):
                why = "role"
            res = msg.get("resume") if role == "player" else None
            back = None
            if isinstance(res, dict) and isinstance(res.get("slot"), int) and isinstance(res.get("key"), str):
                q = self.parked.get(res["slot"]) or self.peers.get(res["slot"])
                if q is not None and q.get("key") == res["key"]:
                    back = res["slot"]
            if why is None and role == "player" and back is None and len(self.peers) + len(self.parked) >= self.max_peers:
                why = "full"
            if why is None and role == "viewer" and len(self.viewers) >= MAX_VIEWERS:
                why = "full"
            if why:
                try:
                    send_text({"t": "refused", "why": why})
                except Exception:           # noqa: BLE001
                    pass
                return None
            dead = set()
            name = str(msg.get("name") or "")[:24]
            if role == "viewer":
                who = next(VIEWER_BASE + i for i in range(MAX_VIEWERS) if VIEWER_BASE + i not in self.viewers)
                self.viewers[who] = {"text": send_text, "bin": send_bin, "name": name or "viewer", "last": self.now(), "conn": conn, "kill": kill}
                self._text(who, dict(self._hello_common(), t="hello", role="viewer", slot=who), dead)
            elif back is not None:
                who = back
                old = self.peers.pop(who, None) or self.parked.pop(who)
                self.parked.pop(who, None)
                if old.get("kill"):
                    try:
                        old["kill"]()                           # (the old connection is still open on this side: it is closed, its leave is ignored)
                    except Exception:           # noqa: BLE001
                        pass
                self.peers[who] = {"text": send_text, "bin": send_bin, "name": old["name"], "order": old["order"], "last": self.now(),
                                   "conn": conn, "kill": kill, "key": old["key"]}
                self.log("ws", "%s came back (its place was kept)" % self.label(who))
                given = [body for body in self.bodies if self.tokens[body] is None]
                for body in given:
                    self.tokens[body] = who
                    self.busy[body] = False
                hello = dict(self._hello_common(), t="hello", role="player", slot=who, key=old["key"], resumed=True)
                hello["peers"] = [q for q in hello["peers"] if q["slot"] != who]
                self._text(who, hello, dead)
                for body in given:
                    self._all({"t": "token", "body": body, "slot": who}, dead, but=who)
            else:
                who = next(s for s in range(self.max_peers) if s not in self.peers and s not in self.parked)
                key = secrets.token_hex(8)
                hello = dict(self._hello_common(), t="hello", role="player", slot=who, key=key)
                self._order += 1
                self.peers[who] = {"text": send_text, "bin": send_bin, "name": name or "player %d" % (who + 1), "order": self._order,
                                   "last": self.now(), "conn": conn, "kill": kill, "key": key}
                given = [body for body in self.bodies if self.tokens[body] is None]
                for body in given:
                    self.tokens[body] = who
                    self.busy[body] = False
                hello["tokens"] = dict(self.tokens)
                self._text(who, hello, dead)
                self._all({"t": "peer", "slot": who, "name": self.peers[who]["name"], "on": True}, dead, but=who)
                for body in given:                              # (the viewers that are already here must hear it too)
                    self._all({"t": "token", "body": body, "slot": who}, dead, but=who)
            for data in list(self.latest.values()):             # (the newest of everything that moves, so that it sees the world at once)
                if data[1] == who:
                    continue
                try:
                    send_bin(data)
                except Exception:           # noqa: BLE001
                    dead.add(who)
                    break
            if role == "viewer":
                self._tell_viewers(dead)
            self._bury(dead)
            return who if self._who(who) is not None else None

    def leave(self, who, conn=None):
        with self.lock:
            if not self._mine(who, conn):
                return
            dead = set()
            if who >= VIEWER_BASE:
                self.viewers.pop(who, None)
                self._forget(who, dead)
                self._tell_viewers(dead)
                self._bury(dead)
                return
            p = self.peers.pop(who, None)
            if not p:
                return
            for body in list(self.tokens):                  # (nothing waits for it: its tokens go at once)
                if self.tokens[body] == who:
                    self._give(body, self._earliest() if body in self.bodies else None, dead)
            if self.resume_hold > 0 and not p.get("bye"):
                self.parked[who] = {"name": p["name"], "order": p["order"], "key": p.get("key"), "at": self.now()}
                self.log("ws", "%s: its place is kept for %.0f s (it may come back)" % (self.label(who), self.resume_hold))
            else:
                self._gone(who, p["name"], dead)
            self._bury(dead)

    def _gone(self, who, name, dead):
        """A player is gone for good: what was its own goes, and everyone is told."""
        self._forget(who, dead)
        self._all({"t": "peer", "slot": who, "name": name, "on": False}, dead)

    # ---- what a connection says
    def text(self, who, msg, conn=None):
        with self.lock:
            if not isinstance(msg, dict) or not self._mine(who, conn):
                return
            t = msg.get("t")
            p = self._who(who)
            p["last"] = self.now()
            dead = set()
            if t == "ping":
                self._text(who, {"t": "pong", "c": msg.get("c"), "s": round(self.now() * 1000, 1)}, dead)
            elif t == "ev":
                self._event(who, msg.get("e"), dead)
            elif who >= VIEWER_BASE:
                pass                                # (a viewer: nothing else counts)
            elif t == "to":
                if msg.get("to") in self.peers:
                    self._text(msg["to"], {"t": "to", "from": who, "m": msg.get("m")}, dead)
            elif t == "ask":
                self._ask(who, msg, dead)
            elif t == "claim":
                body = msg.get("body")
                if isinstance(body, str) and _NAME.fullmatch(body):
                    if body not in self.tokens and len(self.tokens) < MAX_TOKENS:
                        self.tokens[body], self.busy[body] = None, False
                    if body in self.tokens and self.tokens[body] != who and not self.busy[body]:
                        self._give(body, who, dead)
            elif t == "busy":
                body = msg.get("body")
                if body in self.tokens and self.tokens[body] == who:
                    self.busy[body] = bool(msg.get("on"))
            elif t == "release":
                body = msg.get("body")
                if body in self.tokens and self.tokens[body] == who:
                    if body not in self.bodies:
                        self._give(body, None, dead)
                    else:
                        # a body always has a holder: the earliest other one that has not given this body up in the last RELEASE_HOLD seconds
                        # (two pages that nobody looks at would otherwise hand it to each other for ever: first two-headset run, 2026-10-22,
                        # 4800 hand-overs in 4 minutes); with nobody like that, it stays where it is
                        now = self.now()
                        gave = self._released.setdefault(body, {})
                        gave[who] = now
                        heirs = [s for s in self.peers if s != who and now - gave.get(s, -1e9) > RELEASE_HOLD]
                        heir = min(heirs, key=lambda s: self.peers[s]["order"], default=None)
                        if heir is not None:
                            self._give(body, heir, dead)
            elif t == "bye":
                p["bye"] = True
            elif t == "clock":
                if _num(msg.get("off")):
                    self.clock_off[who] = float(msg["off"])
                    self._all({"t": "clock", "slot": who, "off": float(msg["off"])}, dead, but=who)
            self._bury(dead)

    def binary(self, who, data, conn=None):
        with self.lock:
            if len(data) < 2 or not self._mine(who, conn):
                return
            p = self.peers.get(who)
            if not p:                               # (a viewer sends no motion)
                return
            p["last"] = self.now()
            body = self.owned.get(data[0])
            if body is not None and self.tokens.get(body) != who:
                return
            out = bytes([data[0], who]) + bytes(data[2:])
            self.latest[(out[0], who)] = out
            dead = set()
            for s, q in list(self.peers.items()) + list(self.viewers.items()):
                if s == who:
                    continue
                try:
                    q["bin"](out)
                except Exception:           # noqa: BLE001
                    dead.add(s)
            self._bury(dead)

    def tick(self):
        """Call a few times a second: a holder that went silent while someone else is alive loses its tokens."""
        with self.lock:
            now, dead = self.now(), set()
            for who, q in list(self.parked.items()):
                if now - q["at"] > self.resume_hold:
                    del self.parked[who]
                    self.log("ws", "%s did not come back: gone" % self.label(who))
                    self._gone(who, q["name"], dead)
            if len(self.peers) < 2:
                self._bury(dead)
                return
            for body, holder in list(self.tokens.items()):
                if holder is None or holder not in self.peers or now - self.peers[holder]["last"] <= self.silent:
                    continue
                heir = self._earliest(alive_since=now - self.silent)
                if heir is None or heir == holder:
                    continue
                self._give(body, heir if body in self.bodies else None, dead)
            self._bury(dead)
