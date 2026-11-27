package com.tgvault.app.core.chunker

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import kotlin.random.Random
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test

class ChunkerTest {

    private fun data(size: Int): ByteArray = Random(42).let { rng ->
        ByteArray(size).also { rng.nextBytes(it) }
    }

    @Test
    fun `chia đúng số chunk và kích thước`() {
        val total = 3 * 1024 * 1024 + 123 // > 3 chunk 1 MiB
        val chunker = Chunker(ByteArrayInputStream(data(total)), 1024 * 1024, total.toLong())
        assertEquals(4, chunker.chunkCount)
        assertEquals(1024L * 1024, chunker.plainSizeOf(0))
        assertEquals(1024L * 1024, chunker.plainSizeOf(1))
        assertEquals(1024L * 1024, chunker.plainSizeOf(2))
        assertEquals(123L, chunker.plainSizeOf(3))
    }

    @Test
    fun `kích thước vừa tròn thì chunk cuối đủ chunkSize`() {
        val total = 2 * 1024 * 1024
        val chunker = Chunker(ByteArrayInputStream(data(total)), 1024 * 1024, total.toLong())
        assertEquals(2, chunker.chunkCount)
        assertEquals(1024L * 1024, chunker.plainSizeOf(1))
    }

    @Test
    fun `ghép các chunk ra đúng nguyên văn dữ liệu gốc`() = runTest {
        val original = data(5 * 1024 * 1024 + 777)
        val chunker = Chunker(ByteArrayInputStream(original), 1024 * 1024, original.size.toLong())
        val reassembled = ByteArrayOutputStream()
        while (true) {
            val source = chunker.next() ?: break
            val chunkOut = ByteArrayOutputStream()
            source.writeTo(chunkOut) { }
            assertEquals(source.length, chunkOut.size().toLong())
            reassembled.write(chunkOut.toByteArray())
        }
        assertArrayEquals(original, reassembled.toByteArray())
    }

    @Test
    fun `progress callback tăng dần và kết thúc đúng tổng`() = runTest {
        val original = data(300_000)
        val chunker = Chunker(ByteArrayInputStream(original), 100_000, original.size.toLong())
        val source = chunker.next()!!
        val events = mutableListOf<Long>()
        source.writeTo(ByteArrayOutputStream()) { events.add(it) }
        assertEquals(events.sorted(), events) // tăng dần
        assertEquals(100_000L, events.last())
    }

    @Test
    fun `hết chunk thì next trả null`() {
        val chunker = Chunker(ByteArrayInputStream(data(10)), 100, 10L)
        chunker.next()
        assertNull(chunker.next())
    }

    @Test
    fun `nguồn kết thúc sớm thì báo lỗi`() = runTest {
        // Khai báo 100 byte nhưng chỉ có 10
        val chunker = Chunker(ByteArrayInputStream(ByteArray(10)), 100, 100L)
        val source = chunker.next()!!
        try {
            source.writeTo(ByteArrayOutputStream()) { }
            fail("phải ném IOException khi nguồn thiếu byte")
        } catch (e: java.io.IOException) {
            // kỳ vọng
        }
    }

    @Test
    fun `từ chối tệp rỗng`() {
        try {
            Chunker(ByteArrayInputStream(ByteArray(0)), 100, 0L)
            fail("phải ném khi totalBytes = 0")
        } catch (e: IllegalArgumentException) {
            // kỳ vọng
        }
    }
}
