package com.munpro.app.domain

// Blogs, the delegate handbook (board A5; web lib/services/articleService.ts). articles/{id} with
// markdown content; articles/{id}/comments/{id}. Anyone signed in may write one.

import com.munpro.app.data.LenientMillis
import kotlinx.serialization.Serializable
import kotlin.math.roundToInt

val BLOG_CATEGORIES = listOf("Guide", "Analysis", "Tips", "News")

@Serializable
data class Article(
    val id: String = "",
    val title: String = "",
    val content: String = "",
    val excerpt: String? = null,
    val authorId: String = "",
    val authorName: String = "",
    val category: String = "Guide",
    val tags: List<String> = emptyList(),
    val coverImage: String? = null,
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
    @Serializable(with = LenientMillis::class) val updatedAt: Long? = null,
    val published: Boolean = false,
) {
    /** What the placard says without a cover: the first tag, else the category (web ArticleCard). */
    val subject: String get() = tags.firstOrNull()?.ifBlank { null } ?: category
}

@Serializable
data class ArticleComment(
    val id: String = "",
    val articleId: String = "",
    val authorId: String = "",
    val authorName: String = "",
    val authorPhotoURL: String? = null,
    val text: String = "",
    @Serializable(with = LenientMillis::class) val createdAt: Long? = null,
)

/** One of my blogs with its comment count (My blogs, A5.4). */
@Serializable
data class MyArticle(val article: Article, val comments: Int = 0)

/** "6 min read": 200 words a minute, tags stripped, at least one (web cardFormat.readingTime). */
fun readingMinutes(content: String): Int = maxOf(1, (wordCount(content.replace(Regex("<[^>]+>"), " ")) / 200f).roundToInt())

/** Tags as the web stores them: the comma-separated input, trimmed, blanks dropped. */
fun parseTags(input: String): List<String> = input.split(",").map { it.trim().removePrefix("#") }.filter { it.isNotEmpty() }
