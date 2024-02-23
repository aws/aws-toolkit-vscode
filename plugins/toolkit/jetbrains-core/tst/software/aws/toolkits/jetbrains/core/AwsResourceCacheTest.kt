// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.RuleChain
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runBlockingTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.any
import org.mockito.kotlin.atLeastOnce
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.mock
import org.mockito.kotlin.reset
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoMoreInteractions
import org.mockito.kotlin.whenever
import software.aws.toolkits.core.ClientConnectionSettings
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.core.utils.test.retryableAssert
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.core.utils.buildList
import software.aws.toolkits.jetbrains.utils.hasCauseWithMessage
import software.aws.toolkits.jetbrains.utils.hasException
import software.aws.toolkits.jetbrains.utils.hasValue
import software.aws.toolkits.jetbrains.utils.value
import software.aws.toolkits.jetbrains.utils.wait
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicInteger

@ExperimentalCoroutinesApi
class AwsResourceCacheTest {
    private val projectRule = ProjectRule()
    private val credentialsManager = MockCredentialManagerRule()
    private val regionProvider = MockRegionProviderRule()

    // If we don't control the order manually, regionProvider can run before projectRule which causes a NPE
    @Rule
    @JvmField
    val ruleChain = RuleChain(
        projectRule,
        credentialsManager,
        regionProvider
    )

    private val mockClock = mock<Clock>()
    private val mockResource = mock<Resource.Cached<String>>()

    private lateinit var sut: AwsResourceCache

    private lateinit var cred1Identifier: CredentialIdentifier
    private lateinit var cred1Provider: ToolkitCredentialsProvider
    private lateinit var cred2Identifier: CredentialIdentifier
    private lateinit var cred2Provider: ToolkitCredentialsProvider
    private lateinit var connectionSettings: ConnectionSettings

    @Before
    fun setUp() {
        cred1Identifier = credentialsManager.addCredentials("Cred1")
        cred1Provider = credentialsManager.getAwsCredentialProvider(cred1Identifier, regionProvider.defaultRegion())

        cred2Identifier = credentialsManager.addCredentials("Cred2")
        cred2Provider = credentialsManager.getAwsCredentialProvider(cred2Identifier, regionProvider.defaultRegion())

        connectionSettings = ConnectionSettings(credentialsManager.createCredentialProvider(), regionProvider.createAwsRegion())

        if (this::sut.isInitialized) {
            (sut as DefaultAwsResourceCache).dispose()
        }
        sut = DefaultAwsResourceCache(mockClock, 1000, Duration.ofMinutes(1))

        reset(mockClock, mockResource)
        whenever(mockResource.expiry()).thenReturn(DEFAULT_EXPIRY)
        whenever(mockResource.id).thenReturn("mock")
        whenever(mockClock.instant()).thenReturn(Instant.now())
    }

    @Test
    fun basicCachingWorks() {
        whenever(mockResource.fetch(any())).thenReturn("hello")

        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("hello")
        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("hello")

        verifyResourceCalled(times = 1)
    }

    @Test
    fun expirationWorks() {
        whenever(mockResource.fetch(any())).thenReturn("hello")

        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("hello")
        whenever(mockClock.instant()).thenReturn(Instant.now().plus(DEFAULT_EXPIRY))
        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("hello")

        verifyResourceCalled(times = 2)
    }

    @Test
    fun exceptionsAreBubbledWhenNoEntry() {
        doAnswer { throw Throwable("Bang!") }.whenever(mockResource).fetch(any())
        assertThatThrownBy { sut.getResource(mockResource, connectionSettings).value }.hasCauseWithMessage("Bang!")
    }

    @Test
    fun exceptionsAreLoggedButStaleEntryReturnedByDefault() {
        whenever(mockResource.fetch(any())).thenReturn("hello").doThrow(RuntimeException("BOOM"))

        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("hello")
        whenever(mockClock.instant()).thenReturn(Instant.now().plus(DEFAULT_EXPIRY))
        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("hello")
    }

    @Test
    fun exceptionsAreBubbledWhenExistingEntryExpiredAndUseStaleIsFalse() {
        whenever(mockResource.fetch(any())).thenReturn("hello").doThrow(RuntimeException("BOOM"))

        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("hello")
        whenever(mockClock.instant()).thenReturn(Instant.now().plus(DEFAULT_EXPIRY))
        assertThat(sut.getResource(mockResource, connectionSettings, useStale = false)).hasException
    }

    @Test
    fun cacheEntriesAreSeparatedByRegionAndCredentials() {
        whenever(mockResource.fetch(any())).thenAnswer {
            val (cred, region) = it.getArgument<ConnectionSettings>(0)
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
        whenever(mockResource.fetch(any())).thenReturn("hello").thenReturn("goodbye")

        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("hello")
        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("hello")

        runBlocking { sut.clear() }

        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("goodbye")
        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("goodbye")

        verifyResourceCalled(times = 2)
    }

    @Test
    fun cacheCanBeClearedByKey() {
        whenever(mockResource.fetch(any())).thenReturn("hello").thenReturn("goodbye")

        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("hello")
        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("hello")

        sut.clear(mockResource, connectionSettings)

        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("goodbye")
        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("goodbye")

        verifyResourceCalled(times = 2)
    }

    @Test
    fun cacheCanBeClearedByKeyAndConnection() {
        val incrementer = AtomicInteger(0)
        whenever(mockResource.fetch(any())).thenAnswer {
            val (cred, region) = it.getArgument<ConnectionSettings>(0)
            "${region.id}-${cred.id}-${incrementer.getAndIncrement()}"
        }

        val usw1Cred1 = sut.getResource(mockResource, US_WEST_1, cred1Provider).value
        val usw1Cred2 = sut.getResource(mockResource, US_WEST_1, cred2Provider).value
        val usw2Cred1 = sut.getResource(mockResource, US_WEST_2, cred1Provider).value
        val usw2Cred2 = sut.getResource(mockResource, US_WEST_2, cred2Provider).value

        sut.clear(mockResource, ConnectionSettings(cred1Provider, US_WEST_1))

        assertThat(sut.getResource(mockResource, US_WEST_1, cred1Provider)).wait().isCompletedWithValueMatching { it != usw1Cred1 }
        assertThat(sut.getResource(mockResource, US_WEST_1, cred2Provider)).hasValue(usw1Cred2)
        assertThat(sut.getResource(mockResource, US_WEST_2, cred1Provider)).hasValue(usw2Cred1)
        assertThat(sut.getResource(mockResource, US_WEST_2, cred2Provider)).hasValue(usw2Cred2)
        verifyResourceCalled(times = 5)
    }

    @Test
    fun canForceCacheRefresh() {
        whenever(mockResource.fetch(any())).thenReturn("hello").thenReturn("goodbye")

        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("hello")
        assertThat(sut.getResource(mockResource, connectionSettings, forceFetch = true)).hasValue("goodbye")
        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("goodbye")

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
        whenever(mockResource.fetch(any())).thenReturn("hello")
        val viewResource = Resource.view(mockResource) { toList() }

        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("hello")
        assertThat(sut.getResource(viewResource, connectionSettings)).hasValue(listOf('h', 'e', 'l', 'l', 'o'))
        verifyResourceCalled(times = 1)
    }

    @Test
    fun mapFilterAndFindExtensionsToEasilyCreateViews() {
        whenever(mockResource.fetch(any())).thenReturn("hello")
        val viewResource = Resource.view(mockResource) { toList() }

        val filteredAndMapped = viewResource.filter { it != 'l' }.map { it.toUpperCase() }
        assertThat(sut.getResource(filteredAndMapped, connectionSettings)).hasValue(listOf('H', 'E', 'O'))

        val find = viewResource.find { it == 'l' }
        assertThat(sut.getResource(find, connectionSettings)).hasValue('l')
    }

    @Test
    fun clearingViewsClearTheUnderlyingCachedResource() {
        whenever(mockResource.fetch(any())).thenReturn("hello")
        val viewResource = Resource.view(mockResource) { toList() }
        sut.getResource(viewResource, connectionSettings).value
        sut.clear(viewResource, connectionSettings)
        sut.getResource(viewResource, connectionSettings).value

        verifyResourceCalled(times = 2)
    }

    @Test
    fun viewsCanBeRegionAware() {
        whenever(mockResource.fetch(any())).thenReturn("hello")
        val viewResource = Resource.View(mockResource) { _, region -> region }

        assertThat(sut.getResource(viewResource, connectionSettings)).hasValue(connectionSettings.region)
    }

    @Test
    fun cacheIsRegularlyPrunedToEnsureItDoesntGrowTooLarge() {
        val localSut = DefaultAwsResourceCache(mockClock, 5, Duration.ofMillis(50))

        val now = Instant.now()
        whenever(mockClock.instant()).thenReturn(now)

        localSut.getResource(StringResource("1"), connectionSettings).value

        whenever(mockClock.instant()).thenReturn(now.plusMillis(10))

        localSut.getResource(StringResource("2"), connectionSettings).value
        localSut.getResource(StringResource("3"), connectionSettings).value
        localSut.getResource(StringResource("4"), connectionSettings).value
        localSut.getResource(StringResource("5"), connectionSettings).value
        localSut.getResource(StringResource("6"), connectionSettings).value

        retryableAssert {
            assertThat(localSut.getResourceIfPresent(StringResource("1"), connectionSettings)).isNull()
        }
    }

    @Test
    fun pruningConsidersCollectionEntriesBasedOnTheirSize() {
        val localSut = DefaultAwsResourceCache(mockClock, 5, Duration.ofMillis(50))

        val listResource = DummyResource("list", listOf("a", "b", "c", "d"))
        val now = Instant.now()
        whenever(mockClock.instant()).thenReturn(now)

        localSut.getResource(listResource, connectionSettings).value

        whenever(mockClock.instant()).thenReturn(now.plusMillis(10))

        localSut.getResource(StringResource("1"), connectionSettings).value
        localSut.getResource(StringResource("2"), connectionSettings).value

        retryableAssert {
            assertThat(localSut.getResourceIfPresent(listResource, connectionSettings)).isNull()
            assertThat(localSut.getResourceIfPresent(StringResource("1"), connectionSettings)).isNotEmpty()
            assertThat(localSut.getResourceIfPresent(StringResource("2"), connectionSettings)).isNotEmpty()
        }
    }

    @Test
    fun multipleCallsInDifferentThreadsStillOnlyCallTheUnderlyingResourceOnce() {
        whenever(mockResource.fetch(any())).thenReturn("hello")
        val concurrency = 200

        val latch = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(concurrency)
        try {
            val futures = (1 until concurrency).map {
                val future = CompletableFuture<String>()
                executor.submit {
                    latch.await()
                    sut.getResource(mockResource, connectionSettings).whenComplete { result, error ->
                        when {
                            result != null -> future.complete(result)
                            error != null -> future.completeExceptionally(error)
                        }
                    }
                }
                future
            }.toTypedArray()
            latch.countDown()
            CompletableFuture.allOf(*futures).get(10, TimeUnit.SECONDS)
        } finally {
            executor.shutdown()
        }

        verifyResourceCalled(times = 1)
    }

    @Test
    fun multipleCallsWhileFetchPendingCallTheUnderlyingResourceOnce() {
        val latch = CountDownLatch(1)
        whenever(mockResource.fetch(any())).thenAnswer {
            // don't allow the task to finish until all futures have been created
            latch.await()
            return@thenAnswer "hello"
        }

        val futures = buildList<CompletableFuture<String>> {
            repeat(20) {
                // simulate multiple calls to the same resource
                add(sut.getResource(mockResource, connectionSettings).toCompletableFuture())
            }
        }.toTypedArray()
        latch.countDown()

        // all futures should complete
        CompletableFuture.allOf(*futures).value

        // and we should have reused the same task for all of the requests
        verifyResourceCalled(times = 1)
    }

    @Test
    fun cachingShouldBeBasedOnResourceId() {
        val first = StringResource("first")
        val anotherFirst = StringResource("first")

        sut.getResource(first, connectionSettings).value
        sut.getResource(anotherFirst, connectionSettings).value

        assertThat(first.callCount).hasValue(1)
        assertThat(anotherFirst.callCount).hasValue(0)
    }

    @Test
    fun whenACredentialIdIsRemovedItsEntriesAreRemovedFromTheCache() {
        whenever(mockResource.fetch(any())).thenReturn("hello")
        getAllRegionAndCredPermutations()

        ApplicationManager.getApplication().messageBus.syncPublisher(CredentialManager.CREDENTIALS_CHANGED).providerRemoved(cred1Identifier)

        getAllRegionAndCredPermutations()

        verify(mockResource, times(2)).fetch(ConnectionSettings(cred1Provider, US_WEST_1))
        verify(mockResource, times(2)).fetch(ConnectionSettings(cred1Provider, US_WEST_2))
        verify(mockResource, times(1)).fetch(ConnectionSettings(cred2Provider, US_WEST_1))
        verify(mockResource, times(1)).fetch(ConnectionSettings(cred2Provider, US_WEST_2))
    }

    @Test
    fun whenACredentialIdIsModifiedItsEntriesAreRemovedFromTheCache() {
        whenever(mockResource.fetch(any())).thenReturn("hello")
        getAllRegionAndCredPermutations()

        ApplicationManager.getApplication().messageBus.syncPublisher(CredentialManager.CREDENTIALS_CHANGED).providerModified(cred1Identifier)

        getAllRegionAndCredPermutations()

        verify(mockResource, times(2)).fetch(ConnectionSettings(cred1Provider, US_WEST_1))
        verify(mockResource, times(2)).fetch(ConnectionSettings(cred1Provider, US_WEST_2))
        verify(mockResource, times(1)).fetch(ConnectionSettings(cred2Provider, US_WEST_1))
        verify(mockResource, times(1)).fetch(ConnectionSettings(cred2Provider, US_WEST_2))
    }

    @Test
    fun cacheExposesBlockingApi() {
        whenever(mockResource.fetch(any())).thenReturn("hello")
        assertThat(sut.getResourceNow(mockResource, connectionSettings)).isEqualTo("hello")
    }

    @Test
    fun cacheExposesBlockingApiWithRegionAndCred() {
        whenever(mockResource.fetch(any())).thenReturn("hello")
        assertThat(sut.getResourceNow(mockResource, US_WEST_1, cred1Provider)).isEqualTo("hello")
        verify(mockResource).fetch(ConnectionSettings(cred1Provider, US_WEST_1))
    }

    @Test
    fun cacheExposesBlockingApiWhereExecutionExceptionIsUnwrapped() {
        whenever(mockResource.fetch(any())).thenThrow(RuntimeException("boom"))
        assertThatThrownBy { sut.getResourceNow(mockResource, connectionSettings, timeout = Duration.ofSeconds(1)) }
            .isInstanceOf(RuntimeException::class.java)
            .hasMessage("boom")
    }

    @Test
    fun cacheExposesBlockingApiWithTimeout() {
        whenever(mockResource.fetch(any())).thenAnswer {
            Thread.sleep(50)
            "hello"
        }
        assertThatThrownBy { sut.getResourceNow(mockResource, connectionSettings, timeout = Duration.ofMillis(5)) }.isInstanceOf(TimeoutException::class.java)
    }

    @Test
    fun canConditionallyFetchOnlyIfAvailableInCache() {
        whenever(mockResource.fetch(any())).thenReturn("hello")

        assertThat(sut.getResourceIfPresent(mockResource, US_WEST_1, cred1Provider)).isNull()
        sut.getResource(mockResource, US_WEST_1, cred1Provider).value
        assertThat(sut.getResourceIfPresent(mockResource, US_WEST_1, cred1Provider)).isEqualTo("hello")
    }

    @Test
    fun canConditionallyFetchOnlyIfAvailableInCacheAndRespectExpiry() {
        whenever(mockResource.fetch(any())).thenReturn("hello")

        val now = Instant.now()
        whenever(mockClock.instant()).thenReturn(now)
        sut.getResource(mockResource, US_WEST_1, cred1Provider).value

        whenever(mockClock.instant()).thenReturn(now.plus(DEFAULT_EXPIRY).plusMillis(1))
        assertThat(sut.getResourceIfPresent(mockResource, US_WEST_1, cred1Provider, useStale = false)).isNull()
    }

    @Test
    fun canConditionallyFetchViewOnlyIfAvailableInCache() {
        whenever(mockResource.fetch(any())).thenReturn("hello")
        val viewResource = Resource.view(mockResource) { reversed() }

        assertThat(sut.getResourceIfPresent(viewResource, US_WEST_1, cred1Provider)).isNull()
        sut.getResource(viewResource, US_WEST_1, cred1Provider).value
        assertThat(sut.getResourceIfPresent(viewResource, US_WEST_1, cred1Provider)).isEqualTo("olleh")
    }

    @Test
    fun canConditionallyFetchOnlyIfAvailableWithoutExplicitCredentialsRegion() {
        whenever(mockResource.fetch(any())).thenReturn("hello")
        sut.getResource(mockResource, connectionSettings).value

        assertThat(sut.getResourceIfPresent(mockResource, connectionSettings)).isEqualTo("hello")
    }

    @Test
    fun concurrentlyRunningExceptionalResourcesGetTheSameException() {
        val latch = CountDownLatch(1)
        whenever(mockResource.fetch(any())).then {
            latch.await()
            // exception gets thrown fast enough where the second fetchIfNeeded check occurs after the first call throws
            runBlockingTest {
                delay(500)
            }
            throw RuntimeException("Boom")
        }

        val first = sut.getResource(mockResource, connectionSettings)
        val second = sut.getResource(mockResource, connectionSettings)
        latch.countDown()
        assertThatThrownBy { first.value }.hasCauseWithMessage("Boom")
        assertThatThrownBy { second.value }.hasCauseWithMessage("Boom")
        verifyResourceCalled(1, mockResource)
    }

    @Test
    fun canRecoverFromACachedException() {
        whenever(mockResource.fetch(any())).thenThrow(RuntimeException("Boom")).thenReturn("Success!")
        assertThrows<ExecutionException> { sut.getResource(mockResource, connectionSettings).value }
        assertThat(sut.getResource(mockResource, connectionSettings).value).isEqualTo("Success!")
    }

    @Test
    fun retriesReturnTheMostRecentException() {
        whenever(mockResource.fetch(any())).thenThrow(RuntimeException("Boom"), RuntimeException("Ouch"))
        assertThatThrownBy { sut.getResource(mockResource, connectionSettings).value }.hasCauseWithMessage("Boom")
        assertThatThrownBy { sut.getResource(mockResource, connectionSettings).value }.hasCauseWithMessage("Ouch")
    }

    @Test
    fun exceptionalEntriesAreRemovedFromTheCache() {
        whenever(mockResource.fetch(any())).thenThrow(RuntimeException("Boom"))
        assertThrows<ExecutionException> { sut.getResource(mockResource, connectionSettings).value }

        with(sut as DefaultAwsResourceCache) {
            doRunCacheMaintenance()
            assertThat(hasCacheEntry(mockResource.id)).isFalse
        }
    }

    private fun getAllRegionAndCredPermutations() {
        sut.getResource(mockResource, US_WEST_1, cred1Provider).value
        sut.getResource(mockResource, US_WEST_2, cred1Provider).value
        sut.getResource(mockResource, US_WEST_1, cred2Provider).value
        sut.getResource(mockResource, US_WEST_2, cred2Provider).value
    }

    private fun assertExpectedExpiryFunctions(expiryFunction: Instant.() -> Instant, shouldExpire: Boolean) {
        whenever(mockResource.fetch(any())).thenReturn("hello", "goodbye")
        whenever(mockResource.expiry()).thenReturn(Duration.ofSeconds(1))
        val now = Instant.now()
        val expiry = now.plus(Duration.ofSeconds(1))
        whenever(mockClock.instant()).thenReturn(now)
        assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("hello")

        whenever(mockClock.instant()).thenReturn(expiryFunction(expiry))
        when (shouldExpire) {
            true -> assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("goodbye")
            false -> assertThat(sut.getResource(mockResource, connectionSettings)).hasValue("hello")
        }

        runBlocking { sut.clear() }
    }

    private fun verifyResourceCalled(times: Int, resource: Resource.Cached<*> = mockResource) {
        verify(resource, times(times)).fetch(any())
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

            override fun fetch(connectionSettings: ClientConnectionSettings<*>): T {
                callCount.getAndIncrement()
                return value
            }
        }

        private class StringResource(id: String) : DummyResource<String>(id, id)

        fun dummyResource(value: String = aString()): Resource.Cached<String> = StringResource(value)
    }
}

val Resource<*>.id: String
    get() = when (this) {
        is Resource.Cached -> this.id
        is Resource.View<*, *> -> this.underlying.id
    }
