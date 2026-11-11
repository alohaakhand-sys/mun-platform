package com.munpro.app.data

// A picked photo, ready for /api/upload: decoded the right way up, scaled so its longer side is at
// most [maxSide], and saved as JPEG. Phone photos are often over the site's 5 MB (photo) and
// 8 MB (cover) limits; this keeps them well under.

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

suspend fun prepareImage(context: Context, uri: Uri, maxSide: Int): ByteArray = withContext(Dispatchers.IO) {
    val bitmap: Bitmap = if (Build.VERSION.SDK_INT >= 28) {
        // ImageDecoder applies the EXIF rotation and can scale while decoding.
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
            val w = info.size.width
            val h = info.size.height
            val k = maxSide.toFloat() / maxOf(w, h)
            if (k < 1f) decoder.setTargetSize((w * k).toInt().coerceAtLeast(1), (h * k).toInt().coerceAtLeast(1))
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
    } else {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
            ?: throw IllegalStateException("That image couldn't be opened.")
    }
    val out = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
    out.toByteArray()
}
