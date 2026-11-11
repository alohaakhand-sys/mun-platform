package com.munpro.app.data

// Blogs (board A5): the web's lib/services/articleService.ts, same documents and queries under the
// same rules. Reading is cache-first (the handbook changes slowly); any write drops the copies it
// touched so the next screen reads the server again.

import com.google.firebase.firestore.AggregateSource
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.munpro.app.domain.Article
import com.munpro.app.domain.ArticleComment
import com.munpro.app.domain.MyArticle
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.builtins.ListSerializer

const val BLOGS_PUBLISHED = "blogs.published"
fun blogsMineKey(uid: String) = "blogs.mine:$uid"
fun blogKey(id: String) = "blog:$id"
fun blogCommentsKey(id: String) = "blog.comments:$id"

/** What the editor saves (ArticleEditor.buildPayload). */
data class ArticleDraft(
    val title: String,
    val content: String,
    val excerpt: String,
    val category: String,
    val tags: List<String>,
    val coverImage: String,
)

class BlogRepo(private val saved: Saved) {
    private val db = FirebaseFirestore.getInstance()
    private val articles = db.collection("articles")

    /** getAllArticles(): every published blog, newest first. */
    suspend fun published(): List<Article> =
        articles.whereEqualTo("published", true).orderBy("createdAt", Query.Direction.DESCENDING).get().await()
            .documents.mapNotNull { it.decode<Article>() }

    /** getAllArticles(false, uid): mine, drafts too, each with its comment count (a count costs one read). */
    suspend fun mine(uid: String): List<MyArticle> = coroutineScope {
        articles.whereEqualTo("authorId", uid).orderBy("createdAt", Query.Direction.DESCENDING).get().await()
            .documents.mapNotNull { it.decode<Article>() }
            .map { a -> async { MyArticle(a, runCatching { articles.document(a.id).collection("comments").count().get(AggregateSource.SERVER).await().count.toInt() }.getOrDefault(0)) } }
            .awaitAll()
    }

    suspend fun article(id: String): Article? =
        articles.document(id).get().await().takeIf { it.exists() }?.decode<Article>()

    suspend fun comments(id: String): List<ArticleComment> =
        articles.document(id).collection("comments").orderBy("createdAt", Query.Direction.ASCENDING).get().await()
            .documents.mapNotNull { it.decode<ArticleComment>() }

    /** addComment, with the web's fields. */
    suspend fun addComment(articleId: String, authorId: String, authorName: String, photo: String?, text: String): ArticleComment {
        val data = buildMap {
            put("articleId", articleId)
            put("authorId", authorId)
            put("authorName", authorName)
            if (!photo.isNullOrBlank()) put("authorPhotoURL", photo)
            put("text", text)
            put("createdAt", FieldValue.serverTimestamp())
        }
        val ref = articles.document(articleId).collection("comments").add(data).await()
        saved.remove(blogCommentsKey(articleId))
        return ArticleComment(ref.id, articleId, authorId, authorName, photo, text, System.currentTimeMillis())
    }

    /** createArticle / updateArticle. Returns the id. */
    suspend fun save(id: String?, draft: ArticleDraft, published: Boolean, authorId: String, authorName: String): String {
        val data = buildMap<String, Any?> {
            put("title", draft.title.trim())
            put("content", draft.content)
            put("excerpt", draft.excerpt.take(200))
            put("authorId", authorId)
            put("authorName", authorName)
            put("category", draft.category)
            put("tags", draft.tags)
            // The web omits an empty cover; on an update that leaves the old one, so clear it here.
            put("coverImage", draft.coverImage.trim().ifEmpty { if (id == null) null else FieldValue.delete() })
            put("published", published)
            put("updatedAt", FieldValue.serverTimestamp())
            if (id == null) put("createdAt", FieldValue.serverTimestamp())
        }.filterValues { it != null }
        val out = if (id == null) articles.add(data).await().id else { articles.document(id).update(data).await(); id }
        dropCopies(authorId, out)
        return out
    }

    suspend fun delete(id: String, authorId: String) {
        articles.document(id).delete().await()
        dropCopies(authorId, id)
    }

    private suspend fun dropCopies(uid: String, id: String) {
        saved.remove(BLOGS_PUBLISHED)
        saved.remove(blogsMineKey(uid))
        saved.remove(blogKey(id))
    }

    companion object {
        val listSerializer = ListSerializer(Article.serializer())
        val mineSerializer = ListSerializer(MyArticle.serializer())
        val commentsSerializer = ListSerializer(ArticleComment.serializer())
    }
}
