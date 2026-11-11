package com.munpro.app.domain

// The organizer's tools (board C5; web organizer/events/[id]/modules, tools/*): the event's
// look (src/lib/data/eventLook.ts: theme colour, certificate template) and the modules'
// quick-start templates (modules/page.tsx).

data class ThemePreset(val id: String, val name: String, val hex: String)

val THEME_PRESETS = listOf(
    ThemePreset("classic-blue", "Classic Blue", "#2563eb"),
    ThemePreset("dark-diplomat", "Dark Diplomat", "#0f172a"),
    ThemePreset("emerald", "Emerald", "#059669"),
    ThemePreset("sand", "Sand", "#C2B280"),
)

private val HEX = Regex("^#[0-9a-fA-F]{6}$")

/** event.theme → "#rrggbb": a preset id or a custom hex; null = the default look. */
fun themeHex(theme: String?): String? {
    if (theme.isNullOrEmpty()) return null
    return THEME_PRESETS.firstOrNull { it.id == theme }?.hex ?: theme.takeIf { HEX.matches(it) }
}

fun hexToArgb(hex: String): Long = 0xFF000000 or hex.removePrefix("#").toLong(16)

/** eventLook.inkOn: dark text on light colours (Sand), white otherwise. */
fun inkIsDark(hex: String): Boolean {
    val n = hex.removePrefix("#").toLong(16)
    fun ch(v: Long): Double { val c = v / 255.0; return if (c <= 0.03928) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4) }
    return 0.2126 * ch((n shr 16) and 255) + 0.7152 * ch((n shr 8) and 255) + 0.0722 * ch(n and 255) > 0.45
}

data class CertificateTemplateOption(val id: String, val name: String, val pro: Boolean = false)

val CERTIFICATE_TEMPLATES = listOf(
    CertificateTemplateOption("diploma", "Classic Diploma"),
    CertificateTemplateOption("modern", "Modern Minimal"),
    CertificateTemplateOption("ornate", "Ornate Gold", pro = true),
)

fun certificateTemplate(id: String?): String = if (id == "modern" || id == "ornate") id else "diploma"

// ── Module quick starts (modules/page.tsx) ──────────────────────────────────────────────

// ── Who claims a coupon with their QR pass (web lib/data/passAudience.ts) ──────────────────

val AUDIENCE_GROUPS = listOf(
    "delegate" to "Delegates", "observer" to "Observers", "faculty" to "Faculty & team leads",
    "eb" to "EB & chairs", "staff" to "Other staff & organizers",
)
/** A meal slot saved before audiences existed keeps its old reach: approved applicants. */
val DEFAULT_MEAL_AUDIENCE = listOf("delegate", "observer", "faculty")

fun audienceLabel(groups: List<String>?, uids: Int = 0): String {
    val g = groups?.takeIf { it.isNotEmpty() } ?: DEFAULT_MEAL_AUDIENCE
    if (g.size == AUDIENCE_GROUPS.size && uids == 0) return "Everyone"
    return (AUDIENCE_GROUPS.filter { it.first in g }.map { it.second } + listOfNotNull(if (uids > 0) "$uids named" else null)).joinToString(", ").ifEmpty { "Nobody" }
}

/** The audience group of an event member (web passAudience.ts groupOf), from their member marker. */
fun audienceGroupOf(kind: String?, role: String?): String {
    val r = role.orEmpty().lowercase()
    if (kind == "applicant") return when {
        "faculty" in r || ("team" in r && ("lead" in r || "head" in r)) -> "faculty"
        "observer" in r -> "observer"
        else -> "delegate"
    }
    if (kind == "staff") {
        if (r == "director" || r == "usg" || r == "eb" || (r != "co-organizer" && "chair" in r)) return "eb"
        if ("faculty" in r) return "faculty"
    }
    return "staff"
}

fun inAudience(uid: String, kind: String?, role: String?, groups: List<String>?, uids: List<String>?): Boolean =
    uids.orEmpty().contains(uid) || (groups?.takeIf { it.isNotEmpty() } ?: DEFAULT_MEAL_AUDIENCE).contains(audienceGroupOf(kind, role))

data class FoodTemplate(val meal: String, val time: String)
val FOOD_TEMPLATES = listOf(
    FoodTemplate("Breakfast", "08:00 – 09:30"), FoodTemplate("Lunch", "12:30 – 14:00"), FoodTemplate("Dinner", "19:00 – 21:00"),
    FoodTemplate("Tea & Snacks", "16:00 – 16:30"), FoodTemplate("Gala Dinner", "20:00 – 23:00"),
)

data class RouteTemplate(val label: String, val name: String, val pickup: String, val dropoff: String, val departs: String, val returns: String, val capacity: Int)
val ROUTE_TEMPLATES = listOf(
    RouteTemplate("Airport Shuttle", "Airport → Venue", "Airport", "Venue", "", "", 30),
    RouteTemplate("Hotel → Venue", "Hotel → Venue", "Hotel Lobby", "Venue", "08:00", "18:00", 40),
    RouteTemplate("Venue → Hotel", "Venue → Hotel", "Venue", "Hotel Lobby", "18:00", "", 40),
    RouteTemplate("Social Night", "Venue → Social Night", "Venue", "Social Venue", "20:00", "23:30", 50),
    RouteTemplate("City Tour", "City Tour", "Hotel Lobby", "City Center", "10:00", "13:00", 25),
)

data class BlockTemplate(val label: String, val name: String, val roomType: String, val price: Double, val rooms: Int)
val BLOCK_TEMPLATES = listOf(
    BlockTemplate("Single Room", "Single Room", "Single", 60.0, 10),
    BlockTemplate("Twin Sharing", "Twin Sharing", "Twin", 40.0, 15),
    BlockTemplate("Triple Sharing", "Triple Sharing", "Triple", 30.0, 10),
    BlockTemplate("Suite", "Executive Suite", "Suite", 120.0, 4),
    BlockTemplate("Dormitory", "Dormitory", "Dorm", 18.0, 30),
)

val DRESS_TEMPLATES: List<Pair<String, String>> = listOf(
    "Business Formal" to "Delegates are expected to wear Western Business Formal attire — suits, blazers, ties, formal dresses, and closed dress shoes. Equivalent national formal wear is welcome.",
    "Western Formal" to "Western Business Attire is required for all committee sessions. Gentlemen: suit and tie. Ladies: formal suit, blouse, or modest formal dress.",
    "National Dress" to "Delegates are encouraged to wear their National or Cultural Dress, representing their heritage with pride. Formal attire is the alternative.",
    "Smart Casual" to "Smart Casual is acceptable for socials and informal sessions — collared shirts, neat trousers, modest dresses. No shorts, flip-flops, or athletic wear.",
    "Thematic Gala" to "For the Gala Night, delegates may wear thematic formal attire — black-tie, evening gowns, or themed elegant outfits as announced.",
)

/** One ID card: name, "Delegate of Japan" / "Chair", committee. */
@kotlinx.serialization.Serializable
data class IdCardPerson(val uid: String, val name: String, val role: String, val committee: String = "", val staff: Boolean = false)
