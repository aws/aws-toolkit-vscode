// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.doThrow
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.reset
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import com.nhaarman.mockitokotlin2.verifyNoMoreInteractions
import com.nhaarman.mockitokotlin2.whenever
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.CompletableFutureAssert
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class AwsResourceCacheTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private val mockClock = mock<Clock>()
    private val mockResource = mock<Resource.Cached<String>>()
    private val sut = DefaultAwsResourceCache(projectRule.project, mockClock, 1000)

    @Before
    fun setup() {
        sut.clear()
        reset(mockClock, mockResource)
        whenever(mockResource.expiry()).thenReturn(DEFAULT_EXPIRY)
        whenever(mockClock.instant()).thenReturn(Instant.now())
    }

    @Test
    fun basicCachingWorks() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello")

        assertThat(sut.getResource(mockResource)).hasValue("hello")
        assertThat(sut.getResource(mockResource)).hasValue("hello")
        verifyResourceCalled(times = 1)
    }

    @Test
    fun expirationWorks() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello")

        assertThat(sut.getResource(mockResource)).hasValue("hello")
        whenever(mockClock.instant()).thenReturn(Instant.now().plus(DEFAULT_EXPIRY))
        assertThat(sut.getResource(mockResource)).hasValue("hello")
        verifyResourceCalled(times = 2)
    }

    @Test
    fun exceptionsAreBubbledWhenNoEntry() {
        whenever(mockResource.fetch(any(), any(), any())).doThrow(RuntimeException("BOOM"))

        assertThat(sut.getResource(mockResource)).hasException
    }

    @Test
    fun exceptionsAreLoggedButStaleEntryReturnedByDefault() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello").doThrow(RuntimeException("BOOM"))

        assertThat(sut.getResource(mockResource)).hasValue("hello")
        whenever(mockClock.instant()).thenReturn(Instant.now().plus(DEFAULT_EXPIRY))
        assertThat(sut.getResource(mockResource)).hasValue("hello")
    }

    @Test
    fun exceptionsAreBubbledWhenExistingEntryExpiredAndUseStaleIsFalse() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello").doThrow(RuntimeException("BOOM"))

        assertThat(sut.getResource(mockResource)).hasValue("hello")
        whenever(mockClock.instant()).thenReturn(Instant.now().plus(DEFAULT_EXPIRY))
        assertThat(sut.getResource(mockResource, useStale = false)).hasException
    }

    @Test
    fun cacheEntriesAreSeparatedByRegionAndCredentials() {
        whenever(mockResource.fetch(any(), any(), any())).thenAnswer {
            val region = it.getArgument<AwsRegion>(1)
            val cred = it.getArgument<ToolkitCredentialsProvider>(2)
            "${region.id}-${cred.id}"
        }

        assertThat(sut.getResource(mockResource, region = US_WEST_1, credentialProvider = CRED1)).hasValue("us-west-1-cred1")
        assertThat(sut.getResource(mockResource, region = US_WEST_2, credentialProvider = CRED1)).hasValue("us-west-2-cred1")
        assertThat(sut.getResource(mockResource, region = US_WEST_1, credentialProvider = CRED2)).hasValue("us-west-1-cred2")
        assertThat(sut.getResource(mockResource, region = US_WEST_2, credentialProvider = CRED2)).hasValue("us-west-2-cred2")
        assertThat(sut.getResource(mockResource, region = US_WEST_2, credentialProvider = CRED2)).hasValue("us-west-2-cred2")

        verifyResourceCalled(times = 4)
    }

    @Test
    fun cacheCanBeCleared() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello").thenReturn("goodbye")

        assertThat(sut.getResource(mockResource)).hasValue("hello")
        assertThat(sut.getResource(mockResource)).hasValue("hello")
        sut.clear()
        assertThat(sut.getResource(mockResource)).hasValue("goodbye")
        assertThat(sut.getResource(mockResource)).hasValue("goodbye")
        verifyResourceCalled(times = 2)
    }

    @Test
    fun cacheCanBeClearedByKey() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello").thenReturn("goodbye")
        assertThat(sut.getResource(mockResource)).hasValue("hello")
        sut.clear(mockResource)
        assertThat(sut.getResource(mockResource)).hasValue("goodbye")
        verifyResourceCalled(times = 2)
    }

    @Test
    fun cacheCanBeClearedByKeyAndConnection() {
        val incrementer = AtomicInteger(0)
        whenever(mockResource.fetch(any(), any(), any())).thenAnswer {
            val region = it.getArgument<AwsRegion>(1)
            val cred = it.getArgument<ToolkitCredentialsProvider>(2)
            "${region.id}-${cred.id}-${incrementer.getAndIncrement()}"
        }

        val usw1Cred1 = sut.getResource(mockResource, US_WEST_1, CRED1).value
        val usw1Cred2 = sut.getResource(mockResource, US_WEST_1, CRED2).value
        val usw2Cred1 = sut.getResource(mockResource, US_WEST_2, CRED1).value
        val usw2Cred2 = sut.getResource(mockResource, US_WEST_2, CRED2).value

        sut.clear(mockResource, region = US_WEST_1, credentialProvider = CRED1)

        assertThat(sut.getResource(mockResource, US_WEST_1, CRED1)).wait().isCompletedWithValueMatching { it != usw1Cred1 }
        assertThat(sut.getResource(mockResource, US_WEST_1, CRED2)).hasValue(usw1Cred2)
        assertThat(sut.getResource(mockResource, US_WEST_2, CRED1)).hasValue(usw2Cred1)
        assertThat(sut.getResource(mockResource, US_WEST_2, CRED2)).hasValue(usw2Cred2)
        verifyResourceCalled(times = 5)
    }

    @Test
    fun canForceCacheRefresh() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello").thenReturn("goodbye")
        assertThat(sut.getResource(mockResource)).hasValue("hello")
        assertThat(sut.getResource(mockResource, forceFetch = true)).hasValue("goodbye")
        assertThat(sut.getResource(mockResource)).hasValue("goodbye")
        verifyResourceCalled(times = 2)
    }

    @Test
    fun expirationOccursOnExpiryTime() {
        assertExpectedExpiryFunctions({ minusMillis(1) }, shouldExpire = false) // before expiry
        assertExpectedExpiryFunctions({ this }, shouldExpire = true) // on expiry
        assertExpectedExpiryFunctions({ plusMillis(1) }, shouldExpire = true) // after expiry
    }

    @Test
    fun viewsCanBeCreatedOnTopOfOtherCachedItems() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello")
        val viewResource = Resource.View(mockResource) { toList() }

        assertThat(sut.getResource(mockResource)).hasValue("hello")
        assertThat(sut.getResource(viewResource)).hasValue(listOf('h', 'e', 'l', 'l', 'o'))
        verifyResourceCalled(times = 1)
    }

    @Test
    fun clearingViewsClearTheUnderlyingCachedResource() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello")
        val viewResource = Resource.View(mockResource) { toList() }
        sut.getResource(viewResource).value
        sut.clear(viewResource)
        sut.getResource(viewResource).value

        verifyResourceCalled(times = 2)
    }

    @Test
    fun multipleCallsInDifferentThreadsStillOnlyCallTheUnderlyingResourceOnce() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello")
        val concurrency = 50

        val executor = Executors.newFixedThreadPool(concurrency)
        try {
            val futures = (1 until concurrency).map {
                val future = CompletableFuture<String>()
                executor.submit { sut.getResource(mockResource).whenComplete { result, error -> when {
                    result != null -> future.complete(result)
                    error != null -> future.completeExceptionally(error)
                } } }
                future
            }.toTypedArray()
            CompletableFuture.allOf(*futures).value
        } finally {
            executor.shutdown()
        }

        verifyResourceCalled(times = 1)
    }

    private fun assertExpectedExpiryFunctions(expiryFunction: Instant.() -> Instant, shouldExpire: Boolean) {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello", "goodbye")
        whenever(mockResource.expiry()).thenReturn(Duration.ofSeconds(1))
        val now = Instant.now()
        val expiry = now.plus(Duration.ofSeconds(1))
        whenever(mockClock.instant()).thenReturn(now)
        assertThat(sut.getResource(mockResource)).hasValue("hello")

        whenever(mockClock.instant()).thenReturn(expiryFunction(expiry))
        when (shouldExpire) {
            true -> assertThat(sut.getResource(mockResource)).hasValue("goodbye")
            false -> assertThat(sut.getResource(mockResource)).hasValue("hello")
        }

        sut.clear()
    }

    private fun verifyResourceCalled(times: Int, resource: Resource.Cached<*> = mockResource) {
        verify(resource, times(times)).fetch(any(), any(), any())
        verify(resource, times(times)).expiry()
        verifyNoMoreInteractions(resource)
    }

    companion object {
        private val CRED1 = DummyToolkitCredentialsProvider("cred1")
        private val CRED2 = DummyToolkitCredentialsProvider("cred2")
        private val US_WEST_1 = AwsRegion("us-west-1", "USW1")
        private val US_WEST_2 = AwsRegion("us-west-2", "USW2")

        private val TIMEOUT = Duration.ofSeconds(1)
        private val DEFAULT_EXPIRY = Duration.ofMinutes(10)
        private fun <T> CompletableFutureAssert<T>.wait(): CompletableFutureAssert<T> {
            try {
                matches { it.get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS) != null }
            } catch (e: Exception) {
                // suppress
            }
            return this
        }

        private fun <T> CompletableFutureAssert<T>.hasValue(value: T) {
            wait().isCompletedWithValue(value)
        }

        private val <T> CompletionStage<T>.value get() = toCompletableFuture().get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS)

        private val <T> CompletableFutureAssert<T>.hasException get() = this.wait().isCompletedExceptionally

        private class DummyToolkitCredentialsProvider(override val id: String) : ToolkitCredentialsProvider() {
            override val displayName: String get() = id

            override fun resolveCredentials(): AwsCredentials {
                TODO("not implemented")
            }
        }
    }
}