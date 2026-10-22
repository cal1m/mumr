"""The hub (server/hub.py): slots and the version check, the self-describing document, owned things, tokens, motion.

    py -3 -m unittest discover -s server/tests -p "test_*.py"
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import hub  # noqa: E402

BUILD = 7


class FakePeer:
    def __init__(self):
        self.texts, self.bins = [], []

    def of(self, t):
        return [m for m in self.texts if m.get("t") == t]

    def events(self):
        return [m["e"] for m in self.of("ev")]


class Clock:
    def __init__(self):
        self.t = 100.0

    def __call__(self):
        return self.t


def join(h, name="p", role=None, build=BUILD):
    p = FakePeer()
    msg = {"t": "join", "build": build, "name": name}
    if role:
        msg["role"] = role
    p.id = h.join(p.texts.append, p.bins.append, msg)
    return p


def make(n=2, **kw):
    clock = Clock()
    h = hub.Hub(lambda: BUILD, clock, **kw)
    return h, clock, [join(h, f"p{i}") for i in range(n)]


def doc_keys(h):
    return list(h.doc.keys())


class JoinTest(unittest.TestCase):
    def test_slots_names_and_the_bodies_go_to_the_first(self):
        h, _, (a, b) = make(bodies=("sim", "holo"))
        self.assertEqual((a.id, b.id), (0, 1))
        self.assertEqual(a.of("hello")[0]["tokens"], {"sim": 0, "holo": 0})
        hb = b.of("hello")[0]
        self.assertEqual((hb["role"], hb["slot"], hb["peers"], hb["doc"], hb["n"]), ("player", 1, [{"slot": 0, "name": "p0"}], [], 0))
        self.assertEqual(a.of("peer"), [{"t": "peer", "slot": 1, "name": "p1", "on": True}])

    def test_another_build_is_refused_and_takes_no_slot(self):
        h, _, (a,) = make(1)
        old = join(h, build=BUILD + 1)
        self.assertIsNone(old.id)
        self.assertEqual(old.texts, [{"t": "refused", "why": "version"}])
        self.assertEqual(a.of("peer"), [])
        self.assertEqual(join(h).id, 1)

    def test_full_and_unknown_roles_are_refused(self):
        h, _, _ = make(2, max_peers=2)
        self.assertEqual(join(h).texts, [{"t": "refused", "why": "full"}])
        self.assertEqual(join(h, role="feed").texts, [{"t": "refused", "why": "role"}])
        self.assertIsNone(h.join(lambda m: None, lambda b: None, {"t": "hello"}))

    def test_a_watcher_that_came_first_hears_who_holds_a_body(self):
        h = hub.Hub(lambda: BUILD, Clock(), bodies=("cube",))
        v = join(h, "pc", role="viewer")
        self.assertEqual(v.of("hello")[0]["tokens"], {"cube": None})
        join(h, "p0")
        self.assertEqual(v.of("token"), [{"t": "token", "body": "cube", "slot": 0}])

    def test_a_viewer_is_not_a_player(self):
        h, _, (a,) = make(1, bodies=("sim",))
        v = join(h, "pc", role="viewer")
        self.assertEqual(v.id, hub.VIEWER_BASE)
        hv = v.of("hello")[0]
        self.assertEqual((hv["role"], hv["peers"], hv["tokens"]), ("viewer", [{"slot": 0, "name": "p0"}], {"sim": 0}))
        self.assertEqual(a.of("peer"), [], "the players are not told of a viewer as a player")
        self.assertEqual(a.of("viewers"), [{"t": "viewers", "n": 1}], "but how many watch")
        b = join(h, "p1")
        self.assertEqual(b.of("hello")[0]["peers"], [{"slot": 0, "name": "p0"}], "nor is it listed to a newcomer")
        self.assertEqual(b.of("hello")[0]["viewers"], 1)
        h.text(v.id, {"t": "claim", "body": "sim"})
        h.text(v.id, {"t": "to", "to": 0, "m": {"k": "x"}})
        h.text(v.id, {"t": "ev", "e": {"k": "game", "key": "game:floor", "value": 1}})
        self.assertEqual(h.tokens["sim"], 0)
        self.assertEqual(a.of("to"), [])
        self.assertEqual(a.of("ev"), [], "a viewer cannot change the world")
        h.leave(v.id)
        self.assertEqual(a.of("viewers")[-1], {"t": "viewers", "n": 0})


class DocumentTest(unittest.TestCase):
    def test_events_are_numbered_and_go_to_everyone_the_sender_and_viewers_too(self):
        h, _, (a, b) = make()
        v = join(h, role="viewer")
        h.text(1, {"t": "ev", "e": {"k": "hello there"}})
        for p in (a, b, v):
            self.assertEqual(p.of("ev"), [{"t": "ev", "n": 1, "from": 1, "e": {"k": "hello there"}}])
        self.assertEqual(h.doc, {}, "no key: passed on, not kept")

    def test_the_newest_event_of_a_key_is_kept_and_moves_to_the_end(self):
        h, _, (a,) = make(1)
        for e in ({"k": "set", "key": "game:a", "value": 1}, {"k": "set", "key": "game:b", "value": 2}, {"k": "set", "key": "game:a", "value": 3}):
            h.text(0, {"t": "ev", "e": e})
        self.assertEqual(doc_keys(h), ["game:b", "game:a"])
        b = join(h, "late")
        self.assertEqual([d["e"]["value"] for d in b.of("hello")[0]["doc"]], [2, 3])
        self.assertEqual(b.of("hello")[0]["doc"][0]["from"], 0)
        self.assertEqual(b.of("hello")[0]["n"], 3)

    def test_drop_forgets_and_clear_forgets_a_prefix(self):
        h, _, (a,) = make(1)
        for key in ("mark:1", "mark:2", "player:0:hue", "player:0:size"):
            h.text(0, {"t": "ev", "e": {"k": "x", "key": key}})
        h.text(0, {"t": "ev", "e": {"k": "mark-", "key": "mark:1", "drop": True}})
        self.assertEqual(doc_keys(h), ["mark:2", "player:0:hue", "player:0:size"])
        h.text(0, {"t": "ev", "e": {"k": "player", "key": "player:0:*", "clear": "player:0:", "state": {}}})
        self.assertEqual(doc_keys(h), ["mark:2", "player:0:*"], "an event that says all of it replaces the pieces")
        self.assertEqual(len(a.of("ev")), 6, "every one of them was passed on")

    def test_things_scoped_to_a_player_go_with_it_and_the_rest_stays(self):
        h, _, (a, b) = make()
        h.text(1, {"t": "ev", "e": {"k": "frame", "key": "frame:1", "scope": "slot", "line": {"dist": 3}}})
        h.text(1, {"t": "ev", "e": {"k": "room", "key": "room", "data": [1, 2]}})
        h.leave(1)
        self.assertEqual(doc_keys(h), ["room"], "the room this player supplied stays for whoever comes next")
        c = join(h, "next")
        self.assertEqual([d["e"]["k"] for d in c.of("hello")[0]["doc"]], ["room"])
        self.assertEqual(c.of("hello")[0]["doc"][0]["from"], 1)

    def test_an_event_too_large_to_keep_is_refused(self):
        h, _, (a,) = make(1)
        h.text(0, {"t": "ev", "e": {"k": "room", "key": "room", "data": "x" * (hub.MAX_KEPT + 1)}})
        self.assertEqual((h.doc, a.of("ev")), ({}, []))

    def test_a_key_that_is_not_one_is_refused(self):
        h, _, (a,) = make(1)
        for key in ("", "a b", 5, "x" * 121):
            h.text(0, {"t": "ev", "e": {"k": "x", "key": key}})
        h.text(0, {"t": "ev", "e": {"key": "no kind"}})
        self.assertEqual(a.of("ev"), [])


class OwnedTest(unittest.TestCase):
    CAM = {"k": "cam+", "key": "cam:w1", "own": True, "gone": {"k": "cam-", "id": "w1"}, "id": "w1", "x": 1}

    def test_only_the_owner_changes_it_and_it_goes_with_the_owner(self):
        h, _, (a, b) = make()
        v = join(h, "webcam page", role="viewer")
        h.text(v.id, {"t": "ev", "e": self.CAM})
        self.assertEqual(h.doc["cam:w1"]["owner"], v.id)
        h.text(0, {"t": "ev", "e": dict(self.CAM, x=2)})
        h.text(0, {"t": "ev", "e": {"k": "cam-", "key": "cam:w1", "drop": True}})
        h.text(0, {"t": "ev", "e": {"k": "steal", "key": "cam:w1"}})
        self.assertEqual(h.doc["cam:w1"]["e"]["x"], 1, "a player cannot move, drop or overwrite somebody else's thing")
        h.text(v.id, {"t": "ev", "e": dict(self.CAM, x=3)})
        self.assertEqual(h.doc["cam:w1"]["e"]["x"], 3)
        n = h.n
        h.text(v.id, {"t": "ev", "e": dict(self.CAM, x=3)})
        self.assertEqual(h.n, n, "the same again is not worth a number")
        h.leave(v.id)
        self.assertNotIn("cam:w1", h.doc)
        gone = a.of("ev")[-1]
        self.assertEqual((gone["from"], gone["e"]), (v.id, {"k": "cam-", "id": "w1", "key": "cam:w1", "drop": True}))
        self.assertEqual(b.of("ev")[-1], gone)

    def test_ask_goes_to_the_owner_only(self):
        h, _, (a, b, c) = make(3)
        h.text(0, {"t": "ev", "e": self.CAM})
        h.text(1, {"t": "ask", "key": "cam:w1", "m": {"x": 5}})
        self.assertEqual(a.of("ask"), [{"t": "ask", "key": "cam:w1", "m": {"x": 5}, "from": 1}])
        self.assertEqual(c.of("ask"), [])
        h.text(0, {"t": "ask", "key": "cam:w1", "m": {}})
        h.text(1, {"t": "ask", "key": "nobody's", "m": {}})
        self.assertEqual(len(a.of("ask")), 1, "not to oneself, not for a key nobody owns")

    def test_a_thing_that_is_there_and_nobodys_cannot_be_taken_over(self):
        h, _, (a,) = make(1)
        h.text(0, {"t": "ev", "e": {"k": "room", "key": "room"}})
        h.text(0, {"t": "ev", "e": {"k": "room", "key": "room", "own": True}})
        self.assertIsNone(h.doc["room"]["owner"])
        h.text(0, {"t": "ev", "e": {"k": "x", "own": True}})
        self.assertEqual(len(a.of("ev")), 1, "owned needs a key")

    def test_the_cap_and_the_rate(self):
        h, clock, (a,) = make(1)
        for i in range(hub.MAX_OWNED + 3):
            clock.t += 0.1
            h.text(0, {"t": "ev", "e": {"k": "c", "key": f"c:{i}", "own": True}})
        self.assertEqual(sum(1 for d in h.doc.values() if d["owner"] == 0), hub.MAX_OWNED)
        clock.t += 5
        for i in range(hub.OWN_RATE + 5):
            h.text(0, {"t": "ev", "e": {"k": "c", "key": "c:0", "own": True, "i": i}})
        self.assertEqual(h.doc["c:0"]["e"]["i"], hub.OWN_RATE - 1, "changes beyond the rate in one second are not heard")


class TokenTest(unittest.TestCase):
    def test_claim_busy_release_and_a_token_made_by_its_first_claim(self):
        h, _, (a, b) = make(bodies=("sim",))
        h.text(1, {"t": "claim", "body": "cube"})
        self.assertEqual(h.tokens, {"sim": 0, "cube": 1})
        self.assertEqual(a.of("token")[-1], {"t": "token", "body": "cube", "slot": 1})
        h.text(1, {"t": "busy", "body": "cube", "on": True})
        h.text(0, {"t": "claim", "body": "cube"})
        self.assertEqual(h.tokens["cube"], 1, "a hand is on it")
        h.text(1, {"t": "busy", "body": "cube", "on": False})
        h.text(0, {"t": "claim", "body": "cube"})
        self.assertEqual(h.tokens["cube"], 0)
        h.text(0, {"t": "release", "body": "cube"})
        self.assertIsNone(h.tokens["cube"])
        h.text(0, {"t": "release", "body": "sim"})
        self.assertEqual(h.tokens["sim"], 1, "a body goes to the earliest other player")
        h2, _, (only,) = make(1, bodies=("sim",))
        h2.text(0, {"t": "release", "body": "sim"})
        self.assertEqual(h2.tokens["sim"], 0, "and stays when there is nobody else")
        h.text(0, {"t": "claim", "body": "not a name!"})
        self.assertNotIn("not a name!", h.tokens)

    def test_two_pages_that_both_give_a_body_up_do_not_hand_it_back_and_forth(self):
        h, clock, (a, b) = make(bodies=("cube",))
        h.text(0, {"t": "release", "body": "cube"})
        self.assertEqual(h.tokens["cube"], 1)
        h.text(1, {"t": "release", "body": "cube"})
        self.assertEqual(h.tokens["cube"], 1, "player 1 gave it up a moment ago: it stays")
        h.text(1, {"t": "release", "body": "cube"})
        self.assertEqual(len([m for m in a.of("token") if m["body"] == "cube"]), 1)
        clock.t += hub.RELEASE_HOLD + 1
        h.text(1, {"t": "release", "body": "cube"})
        self.assertEqual(h.tokens["cube"], 0, "after a while it may go back")

    def test_when_the_holder_leaves_a_body_goes_to_the_earliest_and_a_token_to_nobody(self):
        h, _, (a, b, c) = make(3, bodies=("sim",))
        h.text(0, {"t": "claim", "body": "cube"})
        h.leave(0)
        self.assertEqual(h.tokens, {"sim": 1, "cube": None})
        self.assertIn({"t": "token", "body": "cube", "slot": None}, c.of("token"))

    def test_a_silent_holder_loses_its_tokens_but_not_when_alone(self):
        h, clock, (a, b) = make(bodies=("sim",))
        h.text(0, {"t": "claim", "body": "cube"})
        clock.t += hub.SILENT + 0.5
        h.text(1, {"t": "ping", "c": 1})
        h.tick()
        self.assertEqual(h.tokens, {"sim": 1, "cube": None})
        h2, clock2, (only,) = make(1, bodies=("sim",))
        clock2.t += 60
        h2.tick()
        self.assertEqual(h2.tokens["sim"], 0)


class MotionTest(unittest.TestCase):
    def test_the_slot_byte_is_written_by_the_hub_and_owned_types_only_come_from_the_holder(self):
        h, _, (a, b) = make(bodies=("sim",), owned={1: "sim"})
        v = join(h, role="viewer")
        h.binary(1, bytes([2, 9, 5, 5]))
        self.assertEqual(a.bins, [bytes([2, 1, 5, 5])])
        self.assertEqual(v.bins, [bytes([2, 1, 5, 5])])
        self.assertEqual(b.bins, [], "not back to the sender")
        h.binary(1, bytes([1, 1, 7]))
        self.assertEqual(len(a.bins), 1, "state from one who does not hold the token is not heard")
        h.binary(0, bytes([1, 0, 7]))
        self.assertEqual(b.bins[-1], bytes([1, 0, 7]))
        h.binary(v.id, bytes([2, 0, 1]))
        self.assertEqual(len(a.bins), 1, "a viewer sends no motion")

    def test_a_newcomer_gets_the_newest_of_everything_that_moves_and_a_leaver_takes_its_own_away(self):
        h, _, (a, b) = make(bodies=("sim",), owned={1: "sim"})
        h.binary(0, bytes([1, 0, 1]))
        h.binary(0, bytes([1, 0, 2]))
        h.binary(1, bytes([2, 1, 3]))
        c = join(h, "late")
        self.assertEqual(sorted(c.bins), [bytes([1, 0, 2]), bytes([2, 1, 3])])
        h.leave(1)
        self.assertEqual(list(h.latest), [(1, 0)])

    def test_clock_offsets_go_to_the_others_and_into_hellos(self):
        h, _, (a, b) = make()
        h.text(1, {"t": "clock", "off": 12.5})
        self.assertEqual(a.of("clock"), [{"t": "clock", "slot": 1, "off": 12.5}])
        self.assertEqual(b.of("clock"), [])
        self.assertEqual(join(h, role="viewer").of("hello")[0]["clocks"], {"1": 12.5})
        h.text(1, {"t": "clock", "off": float("nan")})
        self.assertEqual(len(a.of("clock")), 1)

    def test_ping_is_answered_with_the_hubs_clock(self):
        h, clock, (a,) = make(1)
        h.text(0, {"t": "ping", "c": 42})
        self.assertEqual(a.of("pong"), [{"t": "pong", "c": 42, "s": 100000.0}])


class DeadTest(unittest.TestCase):
    def test_a_connection_whose_send_fails_is_given_up_on(self):
        h, _, (a,) = make(1, bodies=("sim",))
        killed = []

        def broken(m):
            if m.get("t") == "ev":
                raise OSError("gone")
        bid = h.join(broken, lambda d: None, {"t": "join", "build": BUILD}, kill=lambda: killed.append(1))
        self.assertEqual(bid, 1)
        h.text(0, {"t": "ev", "e": {"k": "x"}})
        self.assertEqual(killed, [1])
        self.assertNotIn(1, h.peers)
        self.assertEqual(a.of("peer")[-1]["on"], False)

    def test_an_old_connection_cannot_speak_for_a_newcomer_in_its_slot(self):
        h = hub.Hub(lambda: BUILD, Clock())
        old, new = object(), object()
        a = FakePeer()
        h.join(a.texts.append, a.bins.append, {"t": "join", "build": BUILD}, conn=old)
        h.leave(0, conn=old)
        b = FakePeer()
        h.join(b.texts.append, b.bins.append, {"t": "join", "build": BUILD}, conn=new)
        h.text(0, {"t": "ev", "e": {"k": "x"}}, conn=old)
        h.leave(0, conn=old)
        self.assertEqual((b.of("ev"), 0 in h.peers), ([], True))


class OutboxTest(unittest.TestCase):
    def test_messages_first_and_only_the_newest_motion_of_each_kind_and_sender(self):
        o = hub.Outbox()
        o.put_bin(bytes([2, 0, 1]))
        o.put_bin(bytes([2, 1, 1]))
        o.put_bin(bytes([2, 0, 2]))
        o.put_text("a")
        self.assertEqual([o.get(0) for _ in range(4)], ["a", (hub.BIN, bytes([2, 1, 1])), (hub.BIN, bytes([2, 0, 2])), None])
        self.assertEqual(o.dropped, 1)

    def test_too_many_messages_waiting_says_so(self):
        o = hub.Outbox(max_text=2)
        self.assertEqual([o.put_text(i) for i in range(3)], [True, True, False])


if __name__ == "__main__":
    unittest.main()
