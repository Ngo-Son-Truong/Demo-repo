package com.tgvault.app.data.remote

import com.tgvault.app.core.common.AppError
import com.tgvault.app.core.common.TimeProvider
import com.tgvault.app.data.remote.api.TelegramBotApi
import com.tgvault.app.domain.model.ChunkSource
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.util.concurrent.TimeUnit

/** PLAN M1-6: MockWebServer — thành công, 401, 403, 429+retry_after, 5xx, mất kết nối, multipart. */
class BotApiGatewayTest {
    private lateinit var server: MockWebServer
    private lateinit var gateway: BotApiGateway
    private val json = Json { ignoreUnknownKeys = true }

    private class ByteArrayChunkSource(private val bytes: ByteArray) : ChunkSource {
        override val length: Long get() = bytes.size.toLong()

        override fun writeTo(
            sink: OutputStream,
            onProgress: (Long) -> Unit,
        ) {
            sink.write(bytes)
            onProgress(length)
        }
    }

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val client = OkHttpClient.Builder().build()
        val api =
            Retrofit.Builder()
                .baseUrl(server.url("/"))
                .client(client)
                .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                .build()
                .create(TelegramBotApi::class.java)
        // minInterval=0, extraDelay=0 để test không phải chờ thật
        val rateLimiter =
            TelegramRateLimiter(
                TimeProvider { System.currentTimeMillis() },
                TelegramRateLimiter.Config(minIntervalMs = 0, rateLimitExtraDelayMs = 0),
            )
        gateway =
            BotApiGateway(
                api = api,
                okHttpClient = client,
                json = json,
                tokenProvider = BotTokenProvider { TEST_TOKEN },
                rateLimiter = rateLimiter,
                downloadUrlPrefix = server.url("/file/bot").toString(),
            )
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun jsonResponse(
        body: String,
        code: Int =
            200,
    ): MockResponse =
        MockResponse()
            .setResponseCode(code)
            .addHeader("Content-Type", "application/json")
            .setBody(body)

    @Test
    fun `getMe thanh cong va token nam trong path`() =
        runTest {
            server.enqueue(
                jsonResponse(
                    """{"ok":true,"result":{"id":123,"first_name":"Vault Bot","is_bot":true,"username":"vault_bot"}}""",
                ),
            )

            val me = gateway.getMe()

            assertEquals(123L, me.id)
            assertEquals("vault_bot", me.username)
            assertEquals("Vault Bot", me.firstName)
            val request = server.takeRequest(5, TimeUnit.SECONDS)
            assertEquals("/bot$TEST_TOKEN/getMe", request?.path)
        }

    @Test
    fun `401 thanh InvalidToken`() =
        runTest {
            server.enqueue(jsonResponse("""{"ok":false,"error_code":401,"description":"Unauthorized"}""", 401))
            var error: AppError? = null
            try {
                gateway.getMe()
            } catch (e: AppError) {
                error = e
            }
            assertTrue(error is AppError.InvalidToken)
        }

    @Test
    fun `403 thanh BotNoAccess`() =
        runTest {
            server.enqueue(
                jsonResponse(
                    """{"ok":false,"error_code":403,"description":"Forbidden: bot was kicked from the channel"}""",
                    403,
                ),
            )
            var error: AppError? = null
            try {
                gateway.getChat(CHAT_ID)
            } catch (e: AppError) {
                error = e
            }
            assertTrue(error is AppError.BotNoAccess)
        }

    @Test
    fun `5xx thanh Transient`() =
        runTest {
            server.enqueue(jsonResponse("""{"ok":false,"error_code":500,"description":"Internal Server Error"}""", 500))
            var error: AppError? = null
            try {
                gateway.getMe()
            } catch (e: AppError) {
                error = e
            }
            assertTrue(error is AppError.Transient)
        }

    @Test
    fun `429 retry_after duoc pause roi tu thu lai`() =
        runTest {
            server.enqueue(
                jsonResponse(
                    """{"ok":false,"error_code":429,"description":"Too Many Requests","parameters":{"retry_after":0}}""",
                    429,
                ),
            )
            server.enqueue(jsonResponse("""{"ok":true,"result":{"message_id":42}}"""))

            val sent = gateway.sendText(CHAT_ID, "hello")

            assertEquals(42L, sent.messageId)
            assertEquals(2, server.requestCount)
        }

    @Test
    fun `mat ket noi giua chung thanh Transient`() =
        runTest {
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .addHeader("Content-Type", "application/json")
                    .setBody("x".repeat(64 * 1024))
                    .setSocketPolicy(SocketPolicy.DISCONNECT_DURING_RESPONSE_BODY),
            )
            var error: AppError? = null
            try {
                gateway.getMe()
            } catch (e: AppError) {
                error = e
            }
            assertTrue(error is AppError.Transient)
        }

    @Test
    fun `sendDocument multipart dung dinh dang va streaming`() =
        runTest {
            server.enqueue(
                jsonResponse(
                    """{"ok":true,"result":{"message_id":7,"document":{"file_id":"FILEID","file_unique_id":"UNIQ","file_size":19}}}""",
                ),
            )
            val payload = "HELLO-TGVAULT-CHUNK".toByteArray()
            var progressSeen = 0L

            val sent =
                gateway.sendDocument(CHAT_ID, ByteArrayChunkSource(payload), "photo.bin", "cap-1") {
                    progressSeen = it
                }

            assertEquals(7L, sent.messageId)
            assertEquals("FILEID", sent.fileId)
            assertEquals(payload.size.toLong(), progressSeen)

            val request = server.takeRequest(5, TimeUnit.SECONDS)
            assertNotNull(request)
            assertEquals("POST", request!!.method)
            assertTrue(request.path.orEmpty().startsWith("/bot$TEST_TOKEN/sendDocument"))
            assertTrue(request.getHeader("Content-Type").orEmpty().startsWith("multipart/form-data; boundary="))

            val body = request.body.readUtf8()
            assertTrue(body.contains("name=\"chat_id\""))
            assertTrue(body.contains(CHAT_ID.toString()))
            assertTrue(body.contains("name=\"document\"; filename=\"photo.bin\""))
            assertTrue(body.contains("HELLO-TGVAULT-CHUNK"))
            assertTrue(body.contains("name=\"caption\""))
            assertTrue(body.contains("cap-1"))
            assertTrue(body.contains("name=\"disable_notification\""))
            assertTrue(body.contains("true"))
        }

    @Test
    fun `download streaming ra sink co bao tien do`() =
        runTest {
            val data = "hello-chunk-bytes"
            server.enqueue(MockResponse().setResponseCode(200).setBody(data))

            val sink = ByteArrayOutputStream()
            var lastProgress = 0L
            gateway.download("documents/file_1.bin", sink, null) { lastProgress = it }

            assertEquals(data, sink.toString(Charsets.UTF_8.name()))
            assertEquals(data.length.toLong(), lastProgress)
            val request = server.takeRequest(5, TimeUnit.SECONDS)
            assertEquals("/file/bot$TEST_TOKEN/documents/file_1.bin", request?.path)
        }

    @Test
    fun `download voi Range gui header va nhan 206`() =
        runTest {
            server.enqueue(MockResponse().setResponseCode(206).setBody("llo"))

            val sink = ByteArrayOutputStream()
            gateway.download("documents/file_1.bin", sink, 2L..4L) { }

            assertEquals("llo", sink.toString(Charsets.UTF_8.name()))
            val request = server.takeRequest(5, TimeUnit.SECONDS)
            assertEquals("bytes=2-4", request?.getHeader("Range"))
        }

    @Test
    fun `download Range bi bo qua thi nem RangeNotSupported truoc khi ghi`() =
        runTest {
            server.enqueue(MockResponse().setResponseCode(200).setBody("abcdef"))

            val sink = ByteArrayOutputStream()
            var error: AppError? = null
            try {
                gateway.download("documents/file_1.bin", sink, 2L..4L) { }
            } catch (e: AppError) {
                error = e
            }
            assertTrue(error is AppError.RangeNotSupported)
            assertEquals(0, sink.size())
        }

    @Test
    fun `watchForChannel phat hien bot duoc them lam admin`() =
        runTest {
            server.enqueue(jsonResponse("""{"ok":true,"result":true}""")) // deleteWebhook
            server.enqueue(
                jsonResponse(
                    """{"ok":true,"result":[{"update_id":10,"my_chat_member":{"chat":{"id":-1002003004,"type":"channel","title":"Vault"},"new_chat_member":{"status":"administrator"}}}]}""",
                ),
            )

            val candidate = gateway.watchForChannel().first()

            assertEquals(-1002003004L, candidate.chatId)
            assertEquals("Vault", candidate.title)
        }

    @Test
    fun `getBotRights doc quyen cua chinh bot`() =
        runTest {
            server.enqueue(
                jsonResponse(
                    """{"ok":true,"result":{"id":123,"first_name":"Vault Bot","is_bot":true,"username":"vault_bot"}}""",
                ),
            )
            server.enqueue(
                jsonResponse(
                    """{"ok":true,"result":{"status":"administrator","can_post_messages":true,"can_delete_messages":true,"can_pin_messages":false}}""",
                ),
            )

            val rights = gateway.getBotRights(CHAT_ID)

            assertTrue(rights.canPost)
            assertTrue(rights.canDelete)
            assertTrue(!rights.canPin)
            assertTrue(!rights.hasAll)
        }

    @Test
    fun `deleteMessage tin khong thay thi AlreadyGone`() =
        runTest {
            server.enqueue(
                jsonResponse(
                    """{"ok":false,"error_code":400,"description":"Bad Request: message to delete not found"}""",
                    400,
                ),
            )

            val result = gateway.deleteMessage(CHAT_ID, 555)

            assertTrue(result is DeleteResult.AlreadyGone)
        }

    @Test
    fun `deleteMessage thanh cong`() =
        runTest {
            server.enqueue(jsonResponse("""{"ok":true,"result":true}"""))
            val result = gateway.deleteMessage(CHAT_ID, 556)
            assertTrue(result is DeleteResult.Deleted)
        }

    private companion object {
        const val TEST_TOKEN = "123456789:AAEhBOweik6ad9r_QXMENQjcrGbq7C1bxptz8"
        const val CHAT_ID = -1001234567890L
    }
}
