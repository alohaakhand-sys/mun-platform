package com.munpro.app.domain.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// PORTED FROM src/lib/services/sessionChatModel.test.ts — case for case, minus the threadKeyFor
// block (threadKeyFor is not ported to Lists.kt).

class SessionChatModelTest {
    private val T0 = 1_700_000_000_000L

    private fun msg(
        threadKey: String = "u_in", fromRole: String = "delegate", fromUid: String = "u_in", fromName: String = "Rahim",
        country: String = "India", text: String = "hello", sentAt: Long = T0,
    ) = SessionChatMessage(threadKey = threadKey, fromRole = fromRole, fromUid = fromUid, fromName = fromName, country = country, text = text, sentAt = sentAt)

    // ── normalizeChatText ───────────────────────────────────────────────────────

    @Test fun `trims`() {
        assertEquals("hi", normalizeChatText("  hi  "))
    }

    @Test fun `clamps to the ceiling the rules enforce`() {
        assertEquals(CHAT_MAX_CHARS, normalizeChatText("x".repeat(CHAT_MAX_CHARS + 50)).length)
    }

    // ── foldThreads ─────────────────────────────────────────────────────────────

    @Test fun `returns nothing for an empty feed`() {
        assertEquals(emptyList<ChatThread>(), foldThreads(emptyList(), emptyMap(), "dais"))
    }

    @Test fun `groups one delegate's messages, oldest first, and carries the display labels`() {
        val out = foldThreads(listOf(msg(text = "second", sentAt = T0 + 1000), msg(text = "first", sentAt = T0)), emptyMap(), "dais")

        assertEquals(1, out.size)
        assertEquals("u_in", out[0].key)
        assertEquals(listOf("first", "second"), out[0].messages.map { it.text })
        assertEquals("second", out[0].lastText)
        assertEquals(T0 + 1000, out[0].lastAt)
        assertEquals("India", out[0].country)
        assertEquals("Rahim", out[0].name)
    }

    @Test fun `orders threads by most recent activity`() {
        val out = foldThreads(listOf(
            msg(threadKey = "u_in", fromUid = "u_in", sentAt = T0),
            msg(threadKey = "u_fr", fromUid = "u_fr", country = "France", sentAt = T0 + 5000),
        ), emptyMap(), "dais")
        assertEquals(listOf("u_fr", "u_in"), out.map { it.key })
    }

    @Test fun `pins the broadcast lane first even when it is the stalest thread`() {
        val out = foldThreads(listOf(
            msg(threadKey = BROADCAST_THREAD, fromRole = "dais", fromUid = "u_chair", country = "", sentAt = T0),
            msg(threadKey = "u_in", sentAt = T0 + 90_000),
        ), emptyMap(), "delegate")
        assertEquals(BROADCAST_THREAD, out[0].key)
        assertTrue(out[0].isBroadcast)
        assertFalse(out[1].isBroadcast)
    }

    @Test fun `counts only the OTHER side as unread — the dais never sees its own replies as unread`() {
        val feed = listOf(
            msg(text = "a", sentAt = T0),
            msg(text = "b", sentAt = T0 + 1),
            msg(fromRole = "dais", fromUid = "u_chair", fromName = "Chair", text = "noted", sentAt = T0 + 2),
        )
        assertEquals(2, foldThreads(feed, emptyMap(), "dais")[0].unread)
        assertEquals(1, foldThreads(feed, emptyMap(), "delegate")[0].unread)
    }

    @Test fun `treats an absent seen-stamp as everything unread`() {
        assertEquals(2, foldThreads(listOf(msg(), msg(sentAt = T0 + 1)), emptyMap(), "dais")[0].unread)
    }

    @Test fun `clears unread up to the seen stamp, inclusive`() {
        val feed = listOf(msg(sentAt = T0), msg(sentAt = T0 + 10), msg(sentAt = T0 + 20))
        assertEquals(1, foldThreads(feed, mapOf("u_in" to T0 + 10), "dais")[0].unread)
        assertEquals(0, foldThreads(feed, mapOf("u_in" to T0 + 20), "dais")[0].unread)
    }

    @Test fun `clamps to zero when the seen stamp is ahead of the feed (clock skew, another device)`() {
        assertEquals(0, foldThreads(listOf(msg()), mapOf("u_in" to T0 + 999_999), "dais")[0].unread)
    }

    @Test fun `keeps seen stamps per thread — reading one delegate does not clear another`() {
        val out = foldThreads(listOf(
            msg(threadKey = "u_in", fromUid = "u_in"),
            msg(threadKey = "u_fr", fromUid = "u_fr", country = "France"),
        ), mapOf("u_in" to T0), "dais")
        assertEquals(0, out.first { it.key == "u_in" }.unread)
        assertEquals(1, out.first { it.key == "u_fr" }.unread)
    }

    // A just-sent message has no server timestamp yet. Sorting it beside stamped ones once crashed
    // (an Int 0 fallback compared against Long stamps).
    @Test fun `sorts a pending message with no timestamp first, without crashing`() {
        val out = foldThreads(listOf(msg(text = "stamped"), msg(text = "pending").copy(sentAt = null)), emptyMap(), "dais")
        assertEquals(listOf("pending", "stamped"), out[0].messages.map { it.text })
    }

    @Test fun `skips rows with no thread key rather than inventing a bucket`() {
        assertEquals(emptyList<ChatThread>(), foldThreads(listOf(msg(threadKey = "")), emptyMap(), "dais"))
    }

    @Test fun `leaves the labels blank on a dais-only thread — there is no delegate message to read them from`() {
        val out = foldThreads(listOf(msg(threadKey = "u_new", fromRole = "dais", fromUid = "u_chair", country = "", fromName = "Chair")), emptyMap(), "dais")
        assertEquals("", out[0].country)
        assertEquals("", out[0].name)
    }

    // ── totalUnread ─────────────────────────────────────────────────────────────

    @Test fun `sums every thread`() {
        val out = foldThreads(listOf(
            msg(threadKey = "u_in", fromUid = "u_in", sentAt = T0),
            msg(threadKey = "u_fr", fromUid = "u_fr", sentAt = T0 + 1),
            msg(threadKey = "u_fr", fromUid = "u_fr", sentAt = T0 + 2),
        ), emptyMap(), "dais")
        assertEquals(3, totalUnread(out))
    }

    @Test fun `is zero for an empty fold`() {
        assertEquals(0, totalUnread(emptyList()))
    }

    // ── Kotlin-only drift guards ────────────────────────────────────────────────

    @Test fun `DRIFT - normalizeChatText trims exactly the set String prototype trim does`() {
        // JS trim strips the BOM (U+FEFF) but NOT the C0 separators U+001C..U+001F; Kotlin's trim() is the reverse.
        assertEquals("hi", normalizeChatText("﻿ hi  　"))
        assertEquals("\u001Chi\u001F", normalizeChatText(" \u001Chi\u001F "))
    }
}
