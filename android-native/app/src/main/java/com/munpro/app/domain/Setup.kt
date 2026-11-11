package com.munpro.app.domain

// Event setup (board C3; web organizer/events/[id]/committees, details, partners): the premade
// committee templates (src/lib/data/committeeTemplates.ts), the difficulty levels, the optional
// modules and the live-floor metrics a marking criterion can auto-fill from.

data class CommitteeTemplateGroup(val label: String, val countries: List<String>)

data class CommitteeTemplate(
    val id: String,
    val name: String,
    val shortName: String,
    val description: String,
    val countries: List<String>,
    val groups: List<CommitteeTemplateGroup> = emptyList(),
    val recommendedCapacity: Int? = null,
)

val COMMITTEE_TEMPLATES = listOf(
    CommitteeTemplate(
        id = "unsc", name = "United Nations Security Council", shortName = "UNSC",
        description = "15-member council. 5 Permanent Members (P5) with veto + 10 rotating Non-Permanent Members.",
        recommendedCapacity = 15,
        groups = listOf(
            CommitteeTemplateGroup("Permanent Members (P5)", listOf("us", "gb", "cn", "fr", "ru")),
            CommitteeTemplateGroup("Non-Permanent Members", listOf("dz", "ec", "gy", "jp", "mt", "mz", "kr", "sl", "si", "ch")),
        ),
        countries = listOf("us", "gb", "cn", "fr", "ru", "dz", "ec", "gy", "jp", "mt", "mz", "kr", "sl", "si", "ch"),
    ),
    CommitteeTemplate(
        id = "undp", name = "United Nations Development Programme", shortName = "UNDP",
        description = "36-member Executive Board allocated across five regional blocks.",
        recommendedCapacity = 36,
        groups = listOf(
            CommitteeTemplateGroup("African States (8)", listOf("dz", "td", "km", "ci", "et", "ls", "ng", "so")),
            CommitteeTemplateGroup("Asia-Pacific States (7)", listOf("bd", "cn", "in", "id", "ir", "pk", "qa")),
            CommitteeTemplateGroup("Eastern European States (4)", listOf("am", "cz", "ro", "ua")),
            CommitteeTemplateGroup("Latin American & Caribbean States (5)", listOf("br", "co", "gt", "pe", "tt")),
            CommitteeTemplateGroup("Western European & Other States (12)", listOf("at", "ca", "dk", "fi", "fr", "de", "jp", "nl", "no", "se", "gb", "us")),
        ),
        countries = listOf(
            "dz", "td", "km", "ci", "et", "ls", "ng", "so",
            "bd", "cn", "in", "id", "ir", "pk", "qa",
            "am", "cz", "ro", "ua",
            "br", "co", "gt", "pe", "tt",
            "at", "ca", "dk", "fi", "fr", "de", "jp", "nl", "no", "se", "gb", "us",
        ),
    ),
)

val COMMITTEE_DIFFICULTIES = listOf("Beginner", "Intermediate", "Advanced")

/** The committee's roster as ISO codes (older events stored names); unknown entries kept as typed. */
fun rosterCodes(c: Committee): List<String> = c.countries.map { getCountry(it)?.code?.lowercase() ?: it }

/** details/page.tsx OPTIONAL_MODULES (the live_mun key is the old spelling of livemun). */
data class OptionalModule(val key: String, val label: String, val description: String)

val OPTIONAL_MODULES = listOf(
    OptionalModule("food", "Food Coupons", "Meal slots and food coupons for delegates"),
    OptionalModule("transport", "Transport", "Shuttle routes with pickup/dropoff and capacity"),
    OptionalModule("accommodation", "Accommodation", "Hotel room blocks and booking requests"),
    OptionalModule("dresscode", "Dress Code", "Attire guidance and reference images"),
)

/** MarkingTemplate.autoFillFrom choices, in the web's order; null = manual only. */
val AUTO_FILL_SOURCES: List<Pair<String?, String>> = listOf(
    null to "Manual only",
    "speeches" to "GSL speeches",
    "caucusSpeeches" to "Caucus speeches",
    "allSpeeches" to "All speeches (GSL + caucus)",
    "speakingMinutes" to "Speaking minutes",
    "pointsRaised" to "Points raised",
    "points" to "Points recognized",
    "motionsProposed" to "Motions proposed",
    "motions" to "Motions carried",
    "votesCast" to "Votes cast",
)

fun autoFillLabel(key: String?): String = AUTO_FILL_SOURCES.firstOrNull { it.first == key }?.second ?: "Manual only"

/** details/page.tsx addStarterSet */
val STARTER_CRITERIA = listOf("Debate & Speeches", "Diplomacy & Lobbying", "Documentation", "Conduct & Discipline")
