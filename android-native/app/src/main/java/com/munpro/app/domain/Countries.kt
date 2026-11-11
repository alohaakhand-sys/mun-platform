package com.munpro.app.domain

// Port of src/lib/data/countries.ts (lookup half) and mobile/src/lib/country.ts.
// Countries are stored as ISO codes ("fr") on committees and applications. The web draws flags
// from its own image route; the phone uses the system's emoji flags.

private val BY_CODE: Map<String, Country> = COUNTRIES.associateBy { it.code.lowercase() }
private val BY_NAME: Map<String, Country> = COUNTRIES.associateBy { it.name.lowercase() }
private val ISO_CODE_RE = Regex("^[a-z]{2}(-[a-z]{3})?$")

fun isCountryCode(value: String): Boolean {
    if (value.isEmpty()) return false
    val v = value.lowercase()
    return ISO_CODE_RE.matches(v) && BY_CODE.containsKey(v)
}

fun getCountry(codeOrName: String?): Country? {
    if (codeOrName.isNullOrEmpty()) return null
    val key = codeOrName.lowercase().trim()
    return BY_CODE[key] ?: BY_NAME[key]
}

fun getCountryName(codeOrName: String?): String = getCountry(codeOrName)?.name ?: codeOrName.orEmpty()

/** The name, or what was stored when it isn't a known country. */
fun countryName(codeOrName: String?): String = getCountryName(codeOrName).ifEmpty { codeOrName.orEmpty() }

/** The Security Council's permanent five (veto holders), by ISO code. */
val P5_CODES = setOf("cn", "fr", "ru", "gb", "us")

fun flagEmoji(codeOrName: String?): String {
    val code = (getCountry(codeOrName)?.code ?: codeOrName ?: "").uppercase()
    if (!Regex("^[A-Z]{2}$").matches(code)) return "🏳️"
    val sb = StringBuilder()
    for (ch in code) sb.appendCodePoint(0x1F1A5 + ch.code)
    return sb.toString()
}

fun searchCountries(query: String): List<Country> {
    val q = query.trim().lowercase()
    if (q.isEmpty()) return COUNTRIES
    return COUNTRIES.filter { it.name.lowercase().contains(q) || it.code.lowercase().contains(q) }
}
