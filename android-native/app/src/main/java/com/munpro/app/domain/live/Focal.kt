package com.munpro.app.domain.live

// "What is the room looking at right now?" — port of src/components/session/projector/focalState.ts,
// the ONE precedence ladder the projector and the delegate console share. The order is the product
// rule:
//   vote      an open ballot outranks everything
//   result    holds the room until the chair clears it or opens the next vote
//   doc       a paper on the floor sits just under a result
//   caucus    above speaker on purpose: the GSL is suspended during a caucus but
//             `gsl.activeSpeaker` stays set, so reading the speaker first shows a stale name
//   speaker   the general speakers list
//   rollcall  attendance is being taken
//   calm      lobby / suspended / closed / an empty floor

sealed interface Focal {
    data class Vote(val vote: ActiveVote) : Focal
    data class Result(val published: PublishedVoteResult) : Focal
    data class Doc(val published: PublishedDocRef) : Focal
    data class Caucus(val caucus: CaucusState) : Focal
    data class Speaker(val speaker: SpeakerSlot) : Focal
    data object RollCall : Focal
    data object Calm : Focal
}

fun resolveFocal(s: LiveSession): Focal = when {
    s.activeVote != null -> Focal.Vote(s.activeVote)
    s.publishedResult != null -> Focal.Result(s.publishedResult)
    s.publishedDoc != null -> Focal.Doc(s.publishedDoc)
    s.caucus != null -> Focal.Caucus(s.caucus)
    s.gsl?.activeSpeaker != null -> Focal.Speaker(s.gsl.activeSpeaker)
    s.phase == Phase.ROLL_CALL -> Focal.RollCall
    else -> Focal.Calm
}

/**
 * The queue the room sees under the focal block, and whose it is ("gsl" | "caucus" | "none").
 * During a caucus the GSL is suspended, so its queue isn't advertised; an unmoderated caucus has
 * no order at all; a vote, a result and a document own the whole screen.
 */
fun focalQueue(s: LiveSession, focal: Focal): Pair<String, List<SpeakerSlot>> = when (focal) {
    is Focal.Caucus -> if (focal.caucus.kind != "moderated") "none" to emptyList() else "caucus" to focal.caucus.queue.orEmpty()
    is Focal.Speaker, Focal.Calm -> "gsl" to s.gsl?.queue.orEmpty()
    else -> "none" to emptyList()
}
