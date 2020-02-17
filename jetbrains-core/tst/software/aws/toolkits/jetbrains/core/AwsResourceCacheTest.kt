// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.atLeastOnce
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.doThrow
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.reset
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import com.nhaarman.mockitokotlin2.verifyNoMoreInteractions
import com.nhaarman.mockitokotlin2.whenever
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.credentials.ToolkitCredentialsIdentifier
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.test.retryableAssert
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.utils.hasException
import software.aws.toolkits.jetbrains.utils.hasValue
import software.aws.toolkits.jetbrains.utils.value
import software.aws.toolkits.jetbrains.utils.wait
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicInteger

class AwsResourceCacheTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private val mockClock = mock<Clock>()
    private val mockResource = mock<Resource.Cached<String>>()
    private val sut = DefaultAwsResourceCache(projectRule.project, mockClock, 1000, Duration.ofMinutes(1))

    private lateinit var cred1Identifier: ToolkitCredentialsIdentifier
    private lateinit var cred1Provider: ToolkitCredentialsProvider
    private lateinit var cred2Identifier: ToolkitCredentialsIdentifier
    private lateinit var cred2Provider: ToolkitCredentialsProvider

    @Before
    fun setUp() {
        val credentialsManager = MockCredentialsManager.getInstance()
        credentialsManager.reset()

        cred1Identifier = credentialsManager.addCredentials("Cred1")
        cred1Provider = credentialsManager.getAwsCredentialProvider(cred1Identifier, MockRegionProvider.getInstance().defaultRegion())

        cred2Identifier = credentialsManager.addCredentials("Cred2")
        cred2Provider = credentialsManager.getAwsCredentialProvider(cred2Identifier, MockRegionProvider.getInstance().defaultRegion())

        sut.clear()
        reset(mockClock, mockResource)
        whenever(mockResource.expiry()).thenReturn(DEFAULT_EXPIRY)
        whenever(mockResource.id).thenReturn("mock")
        whenever(mockClock.instant()).thenReturn(Instant.now())
    }

    @After
    fun tearDown() {
        MockCredentialsManager.getInstance().reset()
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
        doAnswer { throw Throwable("Bang!") }.`when`(mockResource).fetch(any(), any(), any())
        assertThat(sut.getResource(mockResource)).hasException.withFailMessage("Bang!")
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

        assertThat(sut.getResource(mockResource, region = US_WEST_1, credentialProvider = cred1Provider)).hasValue("us-west-1-Cred1")
        assertThat(sut.getResource(mockResource, region = US_WEST_2, credentialProvider = cred1Provider)).hasValue("us-west-2-Cred1")
        assertThat(sut.getResource(mockResource, region = US_WEST_1, credentialProvider = cred2Provider)).hasValue("us-west-1-Cred2")
        assertThat(sut.getResource(mockResource, region = US_WEST_2, credentialProvider = cred2Provider)).hasValue("us-west-2-Cred2")
        assertThat(sut.getResource(mockResource, region = US_WEST_2, credentialProvider = cred2Provider)).hasValue("us-west-2-Cred2")

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

        val usw1Cred1 = sut.getResource(mockResource, US_WEST_1, cred1Provider).value
        val usw1Cred2 = sut.getResource(mockResource, US_WEST_1, cred2Provider).value
        val usw2Cred1 = sut.getResource(mockResource, US_WEST_2, cred1Provider).value
        val usw2Cred2 = sut.getResource(mockResource, US_WEST_2, cred2Provider).value

        sut.clear(mockResource, region = US_WEST_1, credentialProvider = cred1Provider)

        assertThat(sut.getResource(mockResource, US_WEST_1, cred1Provider)).wait().isCompletedWithValueMatching { it != usw1Cred1 }
        assertThat(sut.getResource(mockResource, US_WEST_1, cred2Provider)).hasValue(usw1Cred2)
        assertThat(sut.getResource(mockResource, US_WEST_2, cred1Provider)).hasValue(usw2Cred1)
        assertThat(sut.getResource(mockResource, US_WEST_2, cred2Provider)).hasValue(usw2Cred2)
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
    fun mapFilterAndFindExtensionsToEasilyCreateViews() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello")
        val viewResource = Resource.View(mockResource) { toList() }

        val filteredAndMapped = viewResource.filter { it != 'l' }.map { it.toUpperCase() }
        assertThat(sut.getResource(filteredAndMapped)).hasValue(listOf('H', 'E', 'O'))

        val find = viewResource.find { it == 'l' }
        assertThat(sut.getResource(find)).hasValue('l')
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
    fun cacheIsRegularlyPrunedToEnsureItDoesntGrowTooLarge() {
        val localSut = DefaultAwsResourceCache(projectRule.project, mockClock, 5, Duration.ofMillis(50))

        val now = Instant.now()
        whenever(mockClock.instant()).thenReturn(now)
        localSut.getResource(StringResource("1")).value
        whenever(mockClock.instant()).thenReturn(now.plusMillis(10))
        localSut.getResource(StringResource("2")).value
        localSut.getResource(StringResource("3")).value
        localSut.getResource(StringResource("4")).value
        localSut.getResource(StringResource("5")).value
        localSut.getResource(StringResource("6")).value

        retryableAssert {
            assertThat(localSut.getResourceIfPresent(StringResource("1"))).isNull()
        }
    }

    @Test
    fun pruningConsidersCollectionEntriesBasedOnTheirSize() {
        val localSut = DefaultAwsResourceCache(projectRule.project, mockClock, 5, Duration.ofMillis(50))

        val listResource = DummyResource("list", listOf("a", "b", "c", "d"))
        val now = Instant.now()
        whenever(mockClock.instant()).thenReturn(now)
        localSut.getResource(listResource).value
        whenever(mockClock.instant()).thenReturn(now.plusMillis(10))
        localSut.getResource(StringResource("1")).value
        localSut.getResource(StringResource("2")).value

        retryableAssert {
            assertThat(localSut.getResourceIfPresent(listResource)).isNull()
            assertThat(localSut.getResourceIfPresent(StringResource("1"))).isNotEmpty()
            assertThat(localSut.getResourceIfPresent(StringResource("2"))).isNotEmpty()
        }
    }

    @Test
    fun multipleCallsInDifferentThreadsStillOnlyCallTheUnderlyingResourceOnce() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello")
        val concurrency = 200

        val latch = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(concurrency)
        try {
            val futures = (1 until concurrency).map {
                val future = CompletableFuture<String>()
                executor.submit {
                    latch.await()
                    sut.getResource(mockResource).whenComplete { result, error ->
                        when {
                            result != null -> future.complete(result)
                            error != null -> future.completeExceptionally(error)
                        }
                    }
                }
                future
            }.toTypedArray()
            latch.countDown()
            CompletableFuture.allOf(*futures).value
        } finally {
            executor.shutdown()
        }

        verifyResourceCalled(times = 1)
    }

    @Test
    fun cachingShouldBeBasedOnId() {
        val first = StringResource("first")
        val anotherFirst = StringResource("first")

        sut.getResource(first).value
        sut.getResource(anotherFirst).value
        assertThat(first.callCount).hasValue(1)
        assertThat(anotherFirst.callCount).hasValue(0)
    }

    @Test
    fun whenACredentialIdIsRemovedItsEntriesAreRemovedFromTheCache() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello")
        getAllRegionAndCredPermutations()

        ApplicationManager.getApplication().messageBus.syncPublisher(CredentialManager.CREDENTIALS_CHANGED).providerRemoved(cred1Identifier)

        getAllRegionAndCredPermutations()

        verify(mockResource, times(2)).fetch(projectRule.project, US_WEST_1, cred1Provider)
        verify(mockResource, times(2)).fetch(projectRule.project, US_WEST_2, cred1Provider)
        verify(mockResource, times(1)).fetch(projectRule.project, US_WEST_1, cred2Provider)
        verify(mockResource, times(1)).fetch(projectRule.project, US_WEST_2, cred2Provider)
    }

    @Test
    fun whenACredentialIdIsModifiedItsEntriesAreRemovedFromTheCache() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello")
        getAllRegionAndCredPermutations()

        ApplicationManager.getApplication().messageBus.syncPublisher(CredentialManager.CREDENTIALS_CHANGED).providerModified(cred1Identifier)

        getAllRegionAndCredPermutations()

        verify(mockResource, times(2)).fetch(projectRule.project, US_WEST_1, cred1Provider)
        verify(mockResource, times(2)).fetch(projectRule.project, US_WEST_2, cred1Provider)
        verify(mockResource, times(1)).fetch(projectRule.project, US_WEST_1, cred2Provider)
        verify(mockResource, times(1)).fetch(projectRule.project, US_WEST_2, cred2Provider)
    }

    @Test
    fun cacheExposesBlockingApi() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello")
        assertThat(sut.getResourceNow(mockResource)).isEqualTo("hello")
    }

    @Test
    fun cacheExposesBlockingApiWithRegionAndCred() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello")
        assertThat(sut.getResourceNow(mockResource, US_WEST_1, cred1Provider)).isEqualTo("hello")
        verify(mockResource).fetch(projectRule.project, US_WEST_1, cred1Provider)
    }

    @Test
    fun cacheExposesBlockingApiWhereExecutionExceptionIsUnwrapped() {
        whenever(mockResource.fetch(any(), any(), any())).thenThrow(RuntimeException("boom"))
        assertThatThrownBy { sut.getResourceNow(mockResource, timeout = Duration.ofMillis(5)) }
            .isInstanceOf(RuntimeException::class.java)
            .withFailMessage("boom")
    }

    @Test
    fun cacheExposesBlockingApiWithTimeout() {
        whenever(mockResource.fetch(any(), any(), any())).thenAnswer {
            Thread.sleep(50)
            "hello"
        }
        assertThatThrownBy { sut.getResourceNow(mockResource, timeout = Duration.ofMillis(5)) }.isInstanceOf(TimeoutException::class.java)
    }

    @Test
    fun canConditionallyFetchOnlyIfAvailableInCache() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello")

        assertThat(sut.getResourceIfPresent(mockResource, US_WEST_1, cred1Provider)).isNull()
        sut.getResource(mockResource, US_WEST_1, cred1Provider).value
        assertThat(sut.getResourceIfPresent(mockResource, US_WEST_1, cred1Provider)).isEqualTo("hello")
    }

    @Test
    fun canConditionallyFetchOnlyIfAvailableInCacheAndRespectExpiry() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello")

        val now = Instant.now()
        whenever(mockClock.instant()).thenReturn(now)
        sut.getResource(mockResource, US_WEST_1, cred1Provider).value

        whenever(mockClock.instant()).thenReturn(now.plus(DEFAULT_EXPIRY).plusMillis(1))
        assertThat(sut.getResourceIfPresent(mockResource, US_WEST_1, cred1Provider, useStale = false)).isNull()
    }

    @Test
    fun canConditionallyFetchViewOnlyIfAvailableInCache() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello")
        val viewResource = Resource.View(mockResource) { reversed() }

        assertThat(sut.getResourceIfPresent(viewResource, US_WEST_1, cred1Provider)).isNull()
        sut.getResource(viewResource, US_WEST_1, cred1Provider).value
        assertThat(sut.getResourceIfPresent(viewResource, US_WEST_1, cred1Provider)).isEqualTo("olleh")
    }

    @Test
    fun canConditionallyFetchOnlyIfAvailableWithoutExplicitCredentialsRegion() {
        whenever(mockResource.fetch(any(), any(), any())).thenReturn("hello")
        sut.getResource(mockResource).value

        assertThat(sut.getResourceIfPresent(mockResource)).isEqualTo("hello")
    }

    private fun getAllRegionAndCredPermutations() {
        sut.getResource(mockResource, US_WEST_1, cred1Provider).value
        sut.getResource(mockResource, US_WEST_2, cred1Provider).value
        sut.getResource(mockResource, US_WEST_1, cred2Provider).value
        sut.getResource(mockResource, US_WEST_2, cred2Provider).value
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
        verify(resource, atLeastOnce()).id
        verifyNoMoreInteractions(resource)
    }

    companion object {
        private val US_WEST_1 = AwsRegion("us-west-1", "USW1", "aws")
        private val US_WEST_2 = AwsRegion("us-west-2", "USW2", "aws")

        private val DEFAULT_EXPIRY = Duration.ofMinutes(10)

        private open class DummyResource<T>(override val id: String, private val value: T) : Resource.Cached<T>() {
            val callCount = AtomicInteger(0)

            override fun fetch(project: Project, region: AwsRegion, credentials: ToolkitCredentialsProvider): T {
                callCount.getAndIncrement()
                return value
            }
        }

        private class StringResource(id: String) : DummyResource<String>(id, id)
    }
}
