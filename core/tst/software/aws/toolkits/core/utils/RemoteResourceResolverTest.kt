// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.eq
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.mockito.invocation.InvocationOnMock
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.util.concurrent.Callable
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import kotlin.streams.toList

class RemoteResourceResolverTest {

    @Rule
    @JvmField
    val tempPath = TemporaryFolder()

    @Test
    fun canDownloadAFileOnce() {
        val urlFetcher = mock<UrlFetcher> {
            on { fetch(eq(PRIMARY_URL), any()) }.doAnswer(writeDataToFile("data"))
        }

        val cachePath = tempPath.newFolder().toPath()
        val sut = DefaultRemoteResourceResolver(urlFetcher, cachePath, immediateExecutor)

        val resource = resource()

        val firstCall = sut.resolve(resource).toCompletableFuture().get()
        val secondCall = sut.resolve(resource).toCompletableFuture().get()

        assertThat(firstCall).isEqualTo(secondCall)
        assertThat(firstCall).hasContent("data")
        verify(urlFetcher).fetch(eq(PRIMARY_URL), any())
        assertThat(Files.list(cachePath).use { it.toList() }).hasSize(1)
    }

    @Test
    fun expiredFileIsDownloadedAgain() {
        val urlFetcher = mock<UrlFetcher> {
            on { fetch(eq(PRIMARY_URL), any()) }.doAnswer(writeDataToFile("first")).doAnswer(writeDataToFile("second"))
        }

        val sut = DefaultRemoteResourceResolver(urlFetcher, tempPath.newFolder().toPath(), immediateExecutor)

        val resource = resource(ttl = Duration.ofMillis(1))

        val firstCall = sut.resolve(resource).toCompletableFuture().get()
        Thread.sleep(100)
        val secondCall = sut.resolve(resource).toCompletableFuture().get()

        assertThat(firstCall).isEqualTo(secondCall)
        assertThat(secondCall).hasContent("second")
        verify(urlFetcher, times(2)).fetch(eq(PRIMARY_URL), any())
    }

    @Test
    fun failureToHitUrlFallsBackToCurrentCopy() {
        val urlFetcher = mock<UrlFetcher> {
            on { fetch(eq(PRIMARY_URL), any()) }.doAnswer(writeDataToFile("data")).thenThrow(RuntimeException("BOOM!"))
        }

        val sut = DefaultRemoteResourceResolver(urlFetcher, tempPath.newFolder().toPath(), immediateExecutor)

        val resource = resource(ttl = Duration.ofMillis(1))

        val firstCall = sut.resolve(resource).toCompletableFuture().get()
        val secondCall = sut.resolve(resource).toCompletableFuture().get()

        assertThat(firstCall).isEqualTo(secondCall)
        assertThat(firstCall).hasContent("data")
    }

    @Test
    fun usesInitialValueIfNoOtherValueAvailable() {
        val initialValue = "initialValue".byteInputStream()

        val urlFetcher = mock<UrlFetcher> {
            on { fetch(eq(PRIMARY_URL), any()) }.thenThrow(RuntimeException("BOOM!"))
        }

        val sut = DefaultRemoteResourceResolver(urlFetcher, tempPath.newFolder().toPath(), immediateExecutor)

        val resource = resource(initialValue = initialValue)

        val result = sut.resolve(resource).toCompletableFuture().get()
        assertThat(result).hasContent("initialValue")
    }

    @Test(expected = RuntimeException::class)
    fun noCurrentOrInitialValueAndExceptionHittingUrlBubbles() {
        val urlFetcher = mock<UrlFetcher> {
            on { fetch(eq(PRIMARY_URL), any()) }.thenThrow(RuntimeException("BOOM!"))
        }

        val sut = DefaultRemoteResourceResolver(urlFetcher, tempPath.newFolder().toPath(), immediateExecutor)

        sut.resolve(resource()).toCompletableFuture().get()
    }

    @Test
    fun canFallbackDownListOfUrls() {

        val urlFetcher = mock<UrlFetcher> {
            on { fetch(eq(PRIMARY_URL), any()) }.thenThrow(RuntimeException("BOOM!"))
            on { fetch(eq(SECONDARY_URL), any()) }.doAnswer(writeDataToFile("data"))
        }

        val sut = DefaultRemoteResourceResolver(urlFetcher, tempPath.newFolder().toPath(), immediateExecutor)

        assertThat(sut.resolve(resource(urls = listOf(PRIMARY_URL, SECONDARY_URL))).toCompletableFuture().get()).hasContent("data")
    }

    private companion object {
        fun resource(
            name: String = "resource",
            urls: List<String> = listOf(PRIMARY_URL),
            ttl: Duration? = Duration.ofMillis(1000),
            initialValue: InputStream? = null
        ) = object : RemoteResource {
            override val urls: List<String> = urls
            override val name: String = name
            override val ttl: Duration? = ttl
            override val initialValue = initialValue?.let { { it } }
        }

        fun writeDataToFile(data: String): (InvocationOnMock) -> Unit = { invocation ->
            (invocation.arguments[1] as Path).writeText(data)
        }

        val immediateExecutor: (Callable<Path>) -> CompletionStage<Path> = { CompletableFuture.completedFuture(it.call()) }

        const val PRIMARY_URL = "http://example.com"
        const val SECONDARY_URL = "http://example2.com"
    }
}
