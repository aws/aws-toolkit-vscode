// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.util.Alarm
import com.intellij.util.AlarmFactory
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import org.jetbrains.annotations.VisibleForTesting
import software.amazon.awssdk.core.SdkClient
import software.aws.toolkits.core.ClientConnectionSettings
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.core.credentials.ToolkitCredentialsChangeListener
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.getConnectionSettingsOrThrow
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentMap
import kotlin.reflect.KClass

typealias AwsResourceCache = migration.software.aws.toolkits.jetbrains.core.AwsResourceCache

/**
 * Get a [resource] either by making a call or returning it from the cache if present and unexpired. Uses the currently [AwsRegion]
 * & [ToolkitCredentialsProvider] active in [AwsConnectionManager].
 *
 * @param[useStale] if an exception occurs attempting to refresh the resource return a cached version if it exists (even if it's expired). Default: true
 * @param[forceFetch] force the resource to refresh (and update cache) even if a valid cache version exists. Default: false
 */
fun <T> Project.getResource(resource: Resource<T>, useStale: Boolean = true, forceFetch: Boolean = false): CompletionStage<T> =
    AwsResourceCache.getInstance().getResource(resource, this.getConnectionSettingsOrThrow(), useStale, forceFetch)

/**
 * Blocking version of [getResource]
 *
 * @param[useStale] if an exception occurs attempting to refresh the resource return a cached version if it exists (even if it's expired). Default: true
 * @param[forceFetch] force the resource to refresh (and update cache) even if a valid cache version exists. Default: false
 */
fun <T> Project.getResourceNow(resource: Resource<T>, timeout: Duration = Duration.ofSeconds(30), useStale: Boolean = true, forceFetch: Boolean = false): T =
    AwsResourceCache.getInstance().getResourceNow(resource, this.getConnectionSettingsOrThrow(), timeout, useStale, forceFetch)

/**
 * Gets the [resource] if it exists in the cache.
 *
 * @param[useStale] return a cached version if it exists (even if it's expired). Default: true
 */
fun <T> ConnectionSettings.getResourceIfPresent(resource: Resource<T>, useStale: Boolean = true): T? =
    AwsResourceCache.getInstance().getResourceIfPresent(resource, this, useStale)

/**
 * Gets the [resource] if it exists in the cache.
 *
 * @see [ConnectionSettings.getResourceIfPresent]
 */
fun <T> Project.getResourceIfPresent(resource: Resource<T>, useStale: Boolean = true): T? =
    getConnectionSettingsOrThrow().getResourceIfPresent(resource, useStale)

/**
 * Clears the contents of the cache for the specific [resource] type, in the currently active [ConnectionSettings]
 */
fun Project.clearResourceForCurrentConnection(resource: Resource<*>) =
    AwsResourceCache.getInstance().clear(resource, this.getConnectionSettingsOrThrow())

/**
 * Clears the contents of the cache of all resource types for the currently active [ConnectionSettings]
 */
fun Project.clearResourceForCurrentConnection() =
    AwsResourceCache.getInstance().clear(this.getConnectionSettingsOrThrow())

sealed class Resource<T> {

    /**
     * A [Cached] resource is one whose fetch is potentially expensive, the result of which should be memoized for a period of time ([expiry]).
     */
    abstract class Cached<T> : Resource<T>() {
        abstract fun fetch(connectionSettings: ClientConnectionSettings<*>): T
        open fun expiry(): Duration = DEFAULT_EXPIRY
        abstract val id: String

        companion object {
            private val DEFAULT_EXPIRY = Duration.ofMinutes(10)
        }
    }

    /**
     * A [View] resource depends on some other underlying [Resource] and then performs some [transform] of the [underlying]'s result
     * in order to return the desired type [Output]. The [transform] result is not cached, [transform]s are re-applied on each fetch - thus should
     * should be relatively cheap.
     */
    class View<Input, Output>(val underlying: Resource<Input>, private val transform: (Input, AwsRegion) -> Output) : Resource<Output>() {
        @Suppress("UNCHECKED_CAST")
        fun doMap(input: Any, region: AwsRegion) = transform(input as Input, region)
    }

    companion object {
        fun <Input, Output> view(underlying: Resource<Input>, transform: Input.() -> Output): Resource<Output> =
            View(underlying) { input, _ -> transform(input) }
    }
}

fun <Input, Output> Resource<out Iterable<Input>>.map(transform: (Input) -> Output): Resource<List<Output>> = Resource.view(this) { map(transform) }

fun <T> Resource<out Iterable<T>>.filter(predicate: (T) -> Boolean): Resource<List<T>> = Resource.view(this) { filter(predicate) }

fun <T> Resource<out Iterable<T>>.find(predicate: (T) -> Boolean): Resource<T?> = Resource.view(this) { find(predicate) }

class ClientBackedCachedResource<ReturnType, ClientType : SdkClient>(
    private val sdkClientClass: KClass<ClientType>,
    override val id: String,
    private val expiry: Duration?,
    private val fetchCall: ClientType.() -> ReturnType
) : Resource.Cached<ReturnType>() {

    constructor(sdkClientClass: KClass<ClientType>, id: String, fetchCall: ClientType.() -> ReturnType) : this(sdkClientClass, id, null, fetchCall)

    override fun fetch(connectionSettings: ClientConnectionSettings<*>): ReturnType {
        val client = AwsClientManager.getInstance().getClient(sdkClientClass, connectionSettings)
        return fetchCall(client)
    }

    override fun expiry(): Duration = expiry ?: super.expiry()
    override fun toString(): String = "ClientBackedCachedResource(id='$id')"
}

@ExperimentalCoroutinesApi
class DefaultAwsResourceCache(
    private val clock: Clock,
    private val maximumCacheEntries: Int,
    private val maintenanceInterval: Duration
) : AwsResourceCache, Disposable, ToolkitCredentialsChangeListener {
    private val coroutineScope = disposableCoroutineScope(this)

    @Suppress("unused")
    constructor() : this(Clock.systemDefaultZone(), MAXIMUM_CACHE_ENTRIES, DEFAULT_MAINTENANCE_INTERVAL)

    private val cache = ConcurrentHashMap<CacheKey, Entry<*>>()
    private val alarm = AlarmFactory.getInstance().create(Alarm.ThreadToUse.POOLED_THREAD, this)

    init {
        ApplicationManager.getApplication().messageBus.connect(this).apply {
            subscribe(CredentialManager.CREDENTIALS_CHANGED, this@DefaultAwsResourceCache)

            subscribe(
                BearerTokenProviderListener.TOPIC,
                object : BearerTokenProviderListener {
                    override fun onChange(providerId: String, newScopes: List<String>?) {
                        clearByCredential(providerId)
                    }
                }
            )
        }
        scheduleCacheMaintenance()
    }

    override fun <T> getResource(
        resource: Resource<T>,
        region: AwsRegion,
        credentialProvider: ToolkitCredentialsProvider,
        useStale: Boolean,
        forceFetch: Boolean
    ): CompletionStage<T> = when (resource) {
        is Resource.View<*, T> -> getResource(
            resource.underlying,
            region,
            credentialProvider,
            useStale,
            forceFetch
        ).thenApply { resource.doMap(it as Any, region) }
        is Resource.Cached<T> -> Context(resource, region, ConnectionSettings(credentialProvider, region), useStale, forceFetch)
            .also { getCachedResource(it) }
            .future
    }

    override fun <T> getResource(
        resource: Resource<T>,
        region: AwsRegion,
        tokenProvider: ToolkitBearerTokenProvider,
        useStale: Boolean,
        forceFetch: Boolean
    ): CompletionStage<T> = when (resource) {
        is Resource.View<*, T> -> getResource(
            resource.underlying,
            region,
            tokenProvider,
            useStale,
            forceFetch
        ).thenApply { resource.doMap(it as Any, region) }
        is Resource.Cached<T> -> Context(resource, region, TokenConnectionSettings(tokenProvider, region), useStale, forceFetch)
            .also { getCachedResource(it) }
            .future
    }

    private fun <T> getCachedResource(context: Context<T>) {
        ApplicationManager.getApplication().executeOnPooledThread {
            var currentValue: Entry<T>? = null
            try {
                @Suppress("UNCHECKED_CAST")
                val result = cache.compute(context.cacheKey) { _, value ->
                    currentValue = value as Entry<T>?
                    fetchIfNeeded(context, currentValue)
                } as Entry<T>

                coroutineScope.launch {
                    try {
                        context.future.complete(result.value.await())
                    } catch (e: Throwable) {
                        val previousValue = currentValue
                        if (context.useStale && previousValue != null && previousValue.value.isCompleted && !previousValue.value.isCompletedExceptionally) {
                            context.future.complete(previousValue.value.getCompleted())
                        } else {
                            context.future.completeExceptionally(e)
                        }
                    }
                }
            } catch (e: Throwable) {
                context.future.completeExceptionally(e)
            }
        }
    }

    private fun runCacheMaintenance() {
        try {
            doRunCacheMaintenance()
        } finally {
            scheduleCacheMaintenance()
        }
    }

    @VisibleForTesting
    internal fun doRunCacheMaintenance() {
        var totalWeight = 0
        cache.entries.removeIf { it.value.value.isCompletedExceptionally }
        val entries = cache.entries.asSequence().filter { it.value.value.isCompleted }.onEach { totalWeight += it.value.weight }.toList()
        var exceededWeight = totalWeight - maximumCacheEntries
        if (exceededWeight <= 0) return
        entries.sortedBy { it.value.expiry }.forEach { (key, value) ->
            if (exceededWeight <= 0) return@doRunCacheMaintenance
            if (cache.computeRemoveIf(key) { it === value }) {
                exceededWeight -= value.weight
            }
        }
    }

    private fun scheduleCacheMaintenance() {
        if (!alarm.isDisposed) {
            alarm.addRequest(this::runCacheMaintenance, maintenanceInterval.toMillis())
        }
    }

    override fun <T> getResourceIfPresent(resource: Resource<T>, region: AwsRegion, credentialProvider: ToolkitCredentialsProvider, useStale: Boolean): T? =
        when (resource) {
            is Resource.Cached<T> -> {
                val key = CacheKey(resource.id, region.id, credentialProvider.id)
                val entry = cache.getTyped<T>(key)
                when {
                    entry != null && (useStale || entry.notExpired) &&
                        entry.value.isCompleted && entry.value.getCompletionExceptionOrNull() == null -> entry.value.getCompleted()
                    else -> null
                }
            }
            is Resource.View<*, T> -> getResourceIfPresent(resource.underlying, region, credentialProvider, useStale)?.let {
                resource.doMap(
                    it,
                    region
                )
            }
        }

    override fun <T> getResourceIfPresent(resource: Resource<T>, region: AwsRegion, tokenProvider: ToolkitBearerTokenProvider, useStale: Boolean): T? =
        when (resource) {
            is Resource.Cached<T> -> {
                val key = CacheKey(resource.id, region.id, tokenProvider.id)
                val entry = cache.getTyped<T>(key)
                when {
                    entry != null && (useStale || entry.notExpired) &&
                        entry.value.isCompleted && entry.value.getCompletionExceptionOrNull() == null -> entry.value.getCompleted()
                    else -> null
                }
            }
            is Resource.View<*, T> -> getResourceIfPresent(resource.underlying, region, tokenProvider, useStale)?.let {
                resource.doMap(
                    it,
                    region
                )
            }
        }

    override fun clear(resource: Resource<*>, connectionSettings: ClientConnectionSettings<*>) {
        when (resource) {
            is Resource.Cached<*> -> cache.remove(CacheKey(resource.id, connectionSettings.region.id, connectionSettings.providerId))
            is Resource.View<*, *> -> clear(resource.underlying, connectionSettings)
        }
    }

    override suspend fun clear() {
        coroutineScope { launch { cache.clear() } }
    }

    override fun clear(connectionSettings: ClientConnectionSettings<*>) {
        cache.keys.removeIf { it.providerId == connectionSettings.providerId && it.regionId == connectionSettings.region.id }
    }

    override fun dispose() {
        coroutineScope.launch { clear() }
    }

    override fun providerRemoved(identifier: CredentialIdentifier) = clearByCredential(identifier.id)

    override fun providerModified(identifier: CredentialIdentifier) = clearByCredential(identifier.id)

    private fun clearByCredential(providerId: String) {
        cache.keys.removeIf { it.providerId == providerId }
    }

    private fun <T> fetchIfNeeded(context: Context<T>, currentEntry: Entry<T>?) = when {
        currentEntry == null -> fetch(context)
        currentEntry.value.isCompletedExceptionally -> fetch(context)
        currentEntry.notExpired && !context.forceFetch -> currentEntry
        context.useStale -> fetchWithFallback(context, currentEntry)
        else -> fetch(context)
    }

    private val Deferred<*>.isCompletedExceptionally get() = isCompleted && getCompletionExceptionOrNull() != null

    private fun <T> fetchWithFallback(context: Context<T>, currentEntry: Entry<T>) = try {
        fetch(context)
    } catch (e: Exception) {
        LOG.warn(e) { "Failed to fetch resource using ${context.cacheKey}, falling back to expired entry" }
        currentEntry
    }

    private fun <T> fetch(context: Context<T>): Entry<T> {
        val value = coroutineScope.async {
            context.resource.fetch(context.connectionSettings)
        }

        return Entry(clock.instant().plus(context.resource.expiry()), value)
    }

    private val Entry<*>.notExpired get() = value.isActive || clock.instant().isBefore(expiry)

    @VisibleForTesting
    internal fun hasCacheEntry(resourceId: String): Boolean = cache.filterKeys { it.resourceId == resourceId }.isNotEmpty()

    companion object {
        private val LOG = getLogger<DefaultAwsResourceCache>()
        private const val MAXIMUM_CACHE_ENTRIES = 1000
        private val DEFAULT_MAINTENANCE_INTERVAL: Duration = Duration.ofMinutes(5)

        private data class CacheKey(val resourceId: String, val regionId: String, val providerId: String)

        private class Context<T>(
            val resource: Resource.Cached<T>,
            val region: AwsRegion,
            val connectionSettings: ClientConnectionSettings<*>,
            val useStale: Boolean,
            val forceFetch: Boolean
        ) {
            val cacheKey = CacheKey(resource.id, region.id, connectionSettings.providerId)
            val future = CompletableFuture<T>()
        }

        private class Entry<T>(val expiry: Instant, val value: Deferred<T>) {
            val weight: Int
                get() = if (value.isCompleted && value.getCompletionExceptionOrNull() == null) {
                    when (val underlying = value.getCompleted()) {
                        is Collection<*> -> underlying.size
                        else -> 1
                    }
                } else {
                    1
                }
        }

        private fun <T> ConcurrentMap<CacheKey, Entry<*>>.getTyped(key: CacheKey) = this[key]?.let {
            @Suppress("UNCHECKED_CAST")
            it as Entry<T>
        }

        /**
         * Atomically apply a [predicate] to the value at [key] (if it exists) and remove if matched.
         *
         * @return - true if removal occurred else false
         */
        private fun <K, V> ConcurrentHashMap<K, V>.computeRemoveIf(key: K, predicate: (V) -> Boolean): Boolean {
            var removed = false
            computeIfPresent(key) { _, v ->
                if (predicate(v)) {
                    removed = true
                    null
                } else {
                    v
                }
            }
            return removed
        }
    }
}
