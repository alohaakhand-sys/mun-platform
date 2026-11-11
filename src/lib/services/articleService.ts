import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp, limit as fsLimit
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export interface ArticleData {
  id: string;
  title: string;
  content: string;
  excerpt?: string;
  authorId: string;
  authorName: string;
  category: "Guide" | "Analysis" | "Tips" | "News";
  tags: string[];
  coverImage?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  published: boolean;
}

export interface CommentData {
  id: string;
  articleId: string;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  text: string;
  createdAt?: Timestamp;
}

/**
 * `max` caps the read for the HOMEPAGE handbook strip, which only ever shows the
 * newest handful. Firestore bills per document returned and the homepage is the
 * busiest anonymous route, so an uncapped fetch there burns the Spark daily read
 * budget. The cap rides the existing published+createdAt query, so no new index.
 */
export async function getAllArticles(publishedOnly = true, authorId?: string, max?: number): Promise<ArticleData[]> {
  try {
    const ref = collection(db, "articles");
    let q;
    if (publishedOnly) {
      q = query(ref, where("published", "==", true), orderBy("createdAt", "desc"));
    } else if (authorId) {
      q = query(ref, where("authorId", "==", authorId), orderBy("createdAt", "desc"));
    } else {
      q = query(ref, where("published", "==", true), orderBy("createdAt", "desc"));
    }
    if (max) q = query(q, fsLimit(max));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ArticleData));
  } catch (error) {
    console.error("Error fetching articles:", error);
    return [];
  }
}

export async function getArticleById(articleId: string): Promise<ArticleData | null> {
  try {
    const snap = await getDoc(doc(db, "articles", articleId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as ArticleData;
  } catch (error) {
    console.error("Error fetching article:", error);
    return null;
  }
}

export async function createArticle(
  data: Omit<ArticleData, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = collection(db, "articles");
  const docRef = await addDoc(ref, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return docRef.id;
}

export async function updateArticle(articleId: string, data: Partial<ArticleData>): Promise<void> {
  await updateDoc(doc(db, "articles", articleId), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteArticle(articleId: string): Promise<void> {
  await deleteDoc(doc(db, "articles", articleId));
}

export async function getArticleComments(articleId: string): Promise<CommentData[]> {
  try {
    const ref = collection(db, "articles", articleId, "comments");
    const q = query(ref, orderBy("createdAt", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CommentData));
  } catch (error) {
    console.error("Error fetching comments:", error);
    return [];
  }
}

export async function addComment(
  articleId: string,
  data: Omit<CommentData, "id" | "createdAt">
): Promise<string> {
  const ref = collection(db, "articles", articleId, "comments");
  const docRef = await addDoc(ref, { ...data, createdAt: serverTimestamp() });
  return docRef.id;
}
