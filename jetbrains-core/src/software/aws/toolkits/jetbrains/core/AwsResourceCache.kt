// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.util.Alarm
import com.intellij.util.AlarmFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import software.amazon.awssdk.core.SdkClient
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.ToolkitCredentialsChangeListener
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettings
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.toEnvironmentVariables
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.ExecutableType
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentMap
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import kotlin.reflect.KClass

// Getting resources can take a long time on a slow connection or if there are a lot of resources. This call should
// always be done in an async context so it should be OK to take multiple seconds.
private val DEFAULT_TIMEOUT = Duration.ofSeconds(30)

/**
 * Intended to prevent repeated unnecessary calls to AWS to understand resource state.
 *
 * Will cache responses from AWS by [AwsRegion]/[ToolkitCredentialsProvider] - generically applicable to any AWS call.
 */
interface AwsResourceCache {
    /**
     * Get a [resource] either by making a call or returning it from the cache if present and unexpired.
     *
     * @param[useStale] if an exception occurs attempting to refresh the resource return a cached version if it exists (even if it's expired). Default: true
     * @param[forceFetch] force the resource to refresh (and update cache) even if a valid cache version exists. Default: false
     */
    fun <T> getResource(
        resource: Resource<T>,
        region: AwsRegion,
        credentialProvider: ToolkitCredentialsProvider,
        useStale: Boolean = true,
        forceFetch: Boolean = false
    ): CompletionStage<T>

    /**
     * @see [getResource]
     */
    fun <T> getResource(
        resource: Resource<T>,
        connectionSettings: ConnectionSettings,
        useStale: Boolean = true,
        forceFetch: Boolean = false
    ): CompletionStage<T> = getResource(resource, connectionSettings.region, connectionSettings.credentials, useStale, forceFetch)

    /**
     * Blocking version of [getResource]
     *
     * @param[region] the specific [AwsRegion] to use for this resource
     * @param[credentialProvider] the specific [ToolkitCredentialsProvider] to use for this resource
     */
    fun <T> getResourceNow(
        resource: Resource<T>,
        region: AwsRegion,
        credentialProvider: ToolkitCredentialsProvider,
        timeout: Duration = DEFAULT_TIMEOUT,
        useStale: Boolean = true,
        forceFetch: Boolean = false
    ): T = wait(timeout) { getResource(resource, region, credentialProvider, useStale, forceFetch) }

    /**
     * Blocking version of [getResource]
     */
    fun <T> getResourceNow(
        resource: Resource<T>,
        connectionSettings: ConnectionSettings,
        timeout: Duration = DEFAULT_TIMEOUT,
        useStale: Boolean = true,
        forceFetch: Boolean = false
    ): T = getResourceNow(resource, connectionSettings.region, connectionSettings.credentials, timeout, useStale, forceFetch)

    /**
     * Gets the [resource] if it exists in the cache.
     *
     * @param[region] the specific [AwsRegion] to use for this resource
     * @param[credentialProvider] the specific [ToolkitCredentialsProvider] to use for this resource
     */
    fun <T> getResourceIfPresent(resource: Resource<T>, region: AwsRegion, credentialProvider: ToolkitCredentialsProvider, useStale: Boolean = true): T?

    /**
     * Gets the [resource] if it exists in the cache.
     */
    fun <T> getResourceIfPresent(resource: Resource<T>, connectionSettings: ConnectionSettings, useStale: Boolean = true): T? =
        getResourceIfPresent(resource, connectionSettings.region, connectionSettings.credentials, useStale)

    /**
     * Clears the contents of the cache across all regions, credentials and resource types.
     */
    suspend fun clear() // TODO: ultimately all of these calls need to be made suspend - start with this one to resolve UI lock

    /**
     * Clears the contents of the cache for the specific [ConnectionSettings]
     */
    fun clear(connectionSettings: ConnectionSettings)

    /**
     * Clears the contents of the cache for the specific [resource] type] & [ConnectionSettings]
     */
    fun clear(resource: Resource<*>, connectionSettings: ConnectionSettings)

    companion object {
        @JvmStatic
        fun getInstance(): AwsResourceCache = service()

        private fun <T> wait(timeout: Duration, call: () -> CompletionStage<T>) = try {
            call().toCompletableFuture().get(timeout.toMillis(), TimeUnit.MILLISECONDS)
        } catch (e: ExecutionException) {
            throw e.cause ?: e
        }
    }
}

/**
 * Get a [resource] either by making a call or returning it from the cache if present and unexpired. Uses the currently [AwsRegion]
 * & [ToolkitCredentialsProvider] active in [AwsConnectionManager].
 *
 * @param[useStale] if an exception occurs attempting to refresh the resource return a cached version if it exists (even if it's expired). Default: true
 * @param[forceFetch] force the resource to refresh (and update cache) even if a valid cache version exists. Default: false
 */
fun <T> Project.getResource(resource: Resource<T>, useStale: Boolean = true, forceFetch: Boolean = false): CompletionStage<T> =
    AwsResourceCache.getInstance().getResource(resource, this.getConnectionSettings(), useStale, forceFetch)

/**
 * Blocking version of [getResource]
 *
 * @param[useStale] if an exception occurs attempting to refresh the resource return a cached version if it exists (even if it's expired). Default: true
 * @param[forceFetch] force the resource to refresh (and update cache) even if a valid cache version exists. Default: false
 */
fun <T> Project.getResourceNow(resource: Resource<T>, timeout: Duration = DEFAULT_TIMEOUT, useStale: Boolean = true, forceFetch: Boolean = false): T =
    AwsResourceCache.getInstance().getResourceNow(resource, this.getConnectionSettings(), timeout, useStale, forceFetch)

/**
 * Gets the [resource] if it exists in the cache.
 *
 * @param[useStale] return a cached version if it exists (even if it's expired). Default: true
 */
fun <T> Project.getResourceIfPresent(resource: Resource<T>, useStale: Boolean = true): T? =
    AwsResourceCache.getInstance().getResourceIfPresent(resource, this.getConnectionSettings(), useStale)

/**
 * Clears the contents of the cache for the specific [resource] type, in the currently active [ConnectionSettings]
 */
fun Project.clearResourceForCurrentConnection(resource: Resource<*>) =
    AwsResourceCache.getInstance().clear(resource, this.getConnectionSettings())

/**
 * Clears the contents of the cache of all resource types for the currently active [ConnectionSettings]
 */
fun Project.clearResourceForCurrentConnection() =
    AwsResourceCache.getInstance().clear(this.getConnectionSettings())

private fun Project.getConnectionSettings(): ConnectionSettings = AwsConnectionManager.getInstance(this).connectionSettings()
    ?: throw IllegalStateException("Bug: ResourceCache was accessed with invalid ConnectionSettings")

sealed class Resource<T> {

    /**
     * A [Cached] resource is one whose fetch is potentially expensive, the result of which should be memoized for a period of time ([expiry]).
     */
    abstract class Cached<T> : Resource<T>() {
        abstract fun fetch(region: AwsRegion, credentials: ToolkitCredentialsProvider): T
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
    class View<Input, Output>(val underlying: Resource<Input>, private val transform: Input.() -> Output) : Resource<Output>() {
        @Suppress("UNCHECKED_CAST")
        fun doMap(input: Any) = transform(input as Input)
    }
}

fun <Input, Output> Resource<out Iterable<Input>>.map(transform: (Input) -> Output): Resource<List<Output>> = Resource.View(this) { map(transform) }

fun <T> Resource<out Iterable<T>>.filter(predicate: (T) -> Boolean): Resource<List<T>> = Resource.View(this) { filter(predicate) }

fun <T> Resource<out Iterable<T>>.find(predicate: (T) -> Boolean): Resource<T?> = Resource.View(this) { find(predicate) }

class ClientBackedCachedResource<ReturnType, ClientType : SdkClient>(
    private val sdkClientClass: KClass<ClientType>,
    override val id: String,
    private val expiry: Duration?,
    private val fetchCall: ClientType.() -> ReturnType
) : Resource.Cached<ReturnType>() {

    constructor(sdkClientClass: KClass<ClientType>, id: String, fetchCall: ClientType.() -> ReturnType) : this(sdkClientClass, id, null, fetchCall)

    override fun fetch(region: AwsRegion, credentials: ToolkitCredentialsProvider): ReturnType {
        val client = AwsClientManager.getInstance().getClient(sdkClientClass, credentials, region)
        return fetchCall(client)
    }

    override fun expiry(): Duration = expiry ?: super.expiry()
    override fun toString(): String = "ClientBackedCachedResource(id='$id')"
}

class ExecutableBackedCacheResource<ReturnType, ExecType : ExecutableType<*>>(
    private val executableTypeClass: KClass<ExecType>,
    override val id: String,
    private val expiry: Duration? = null,
    private val fetchCall: GeneralCommandLine.() -> ReturnType
) : Resource.Cached<ReturnType>() {

    override fun fetch(region: AwsRegion, credentials: ToolkitCredentialsProvider): ReturnType {
        val executableType = ExecutableType.getExecutable(executableTypeClass.java)

        val executable = ExecutableManager.getInstance().getExecutableIfPresent(executableType).let {
            when (it) {
                is ExecutableInstance.Executable -> it
                is ExecutableInstance.InvalidExecutable, is ExecutableInstance.UnresolvedExecutable ->
                    throw IllegalStateException((it as ExecutableInstance.BadExecutable).validationError)
            }
        }

        return fetchCall(
            executable.getCommandLine()
                .withEnvironment(region.toEnvironmentVariables())
                .withEnvironment(credentials.resolveCredentials().toEnvironmentVariables())
        )
    }

    override fun expiry(): Duration = expiry ?: super.expiry()
    override fun toString(): String = "ExecutableBackedCacheResource(id='$id')"
}

class DefaultAwsResourceCache(
    private val clock: Clock,
    private val maximumCacheEntries: Int,
    private val maintenanceInterval: Duration
) : AwsResourceCache, Disposable, ToolkitCredentialsChangeListener, CoroutineScope by ApplicationThreadPoolScope("DefaultAwsResourceCache") {

    @Suppress("unused")
    constructor() : this(Clock.systemDefaultZone(), MAXIMUM_CACHE_ENTRIES, DEFAULT_MAINTENANCE_INTERVAL)

    private val cache = ConcurrentHashMap<CacheKey, Entry<*>>()
    private val alarm = AlarmFactory.getInstance().create(Alarm.ThreadToUse.POOLED_THREAD, this)

    init {
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(CredentialManager.CREDENTIALS_CHANGED, this)
        scheduleCacheMaintenance()
    }

    override fun <T> getResource(
        resource: Resource<T>,
        region: AwsRegion,
        credentialProvider: ToolkitCredentialsProvider,
        useStale: Boolean,
        forceFetch: Boolean
    ): CompletionStage<T> = when (resource) {
        is Resource.View<*, T> -> getResource(resource.underlying, region, credentialProvider, useStale, forceFetch).thenApply { resource.doMap(it as Any) }
        is Resource.Cached<T> -> Context(resource, region, credentialProvider, useStale, forceFetch).also { getCachedResource(it) }.future
    }

    private fun <T> getCachedResource(context: Context<T>) {
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                @Suppress("UNCHECKED_CAST")
                val result = cache.compute(context.cacheKey) { _, value ->
                    fetchIfNeeded(context, value as Entry<T>?)
                } as Entry<T>
                context.future.complete(result.value)
            } catch (e: Throwable) {
                context.future.completeExceptionally(e)
            }
        }
    }

    private fun runCacheMaintenance() {
        try {
            var totalWeight = 0
            val entries = cache.entries.asSequence().onEach { totalWeight += it.value.weight }.toList()
            var exceededWeight = totalWeight - maximumCacheEntries
            if (exceededWeight <= 0) return
            entries.sortedBy { it.value.expiry }.forEach { (key, value) ->
                if (exceededWeight <= 0) return@runCacheMaintenance
                if (cache.computeRemoveIf(key) { it === value }) {
                    exceededWeight -= value.weight
                }
            }
        } finally {
            scheduleCacheMaintenance()
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
                val entry = cache.getTyped<T>(CacheKey(resource.id, region.id, credentialProvider.id))
                when {
                    entry != null && (useStale || entry.notExpired) -> entry.value
                    else -> null
                }
            }
            is Resource.View<*, T> -> getResourceIfPresent(resource.underlying, region, credentialProvider, useStale)?.let { resource.doMap(it) }
        }

    override fun clear(resource: Resource<*>, connectionSettings: ConnectionSettings) {
        when (resource) {
            is Resource.Cached<*> -> cache.remove(CacheKey(resource.id, connectionSettings.region.id, connectionSettings.credentials.id))
            is Resource.View<*, *> -> clear(resource.underlying, connectionSettings)
        }
    }

    override suspend fun clear() {
        coroutineScope { launch { cache.clear() } }
    }

    override fun clear(connectionSettings: ConnectionSettings) {
        cache.keys.removeIf { it.credentialsId == connectionSettings.credentials.id && it.regionId == connectionSettings.region.id }
    }

    override fun dispose() {
        launch { clear() }
    }

    override fun providerRemoved(identifier: CredentialIdentifier) = clearByCredential(identifier.id)

    override fun providerModified(identifier: CredentialIdentifier) = clearByCredential(identifier.id)

    private fun clearByCredential(providerId: String) {
        cache.keys.removeIf { it.credentialsId == providerId }
    }

    private fun <T> fetchIfNeeded(context: Context<T>, currentEntry: Entry<T>?) = when {
        currentEntry == null -> fetch(context)
        currentEntry.notExpired && !context.forceFetch -> currentEntry
        context.useStale -> fetchWithFallback(context, currentEntry)
        else -> fetch(context)
    }

    private fun <T> fetchWithFallback(context: Context<T>, currentEntry: Entry<T>) = try {
        fetch(context)
    } catch (e: Exception) {
        LOG.warn(e) { "Failed to fetch resource using ${context.cacheKey}, falling back to expired entry" }
        currentEntry
    }

    private fun <T> fetch(context: Context<T>): Entry<T> {
        val value = context.resource.fetch(context.region, context.credentials)
        return Entry(clock.instant().plus(context.resource.expiry()), value)
    }

    private val Entry<*>.notExpired get() = clock.instant().isBefore(expiry)

    companion object {
        private val LOG = getLogger<DefaultAwsResourceCache>()
        private const val MAXIMUM_CACHE_ENTRIES = 1000
        private val DEFAULT_MAINTENANCE_INTERVAL: Duration = Duration.ofMinutes(5)

        private data class CacheKey(val resourceId: String, val regionId: String, val credentialsId: String)

        private class Context<T>(
            val resource: Resource.Cached<T>,
            val region: AwsRegion,
            val credentials: ToolkitCredentialsProvider,
            val useStale: Boolean,
            val forceFetch: Boolean
        ) {
            val cacheKey = CacheKey(resource.id, region.id, credentials.id)
            val future = CompletableFuture<T>()
        }

        private class Entry<T>(val expiry: Instant, val value: T) {
            val weight = when (value) {
                is Collection<*> -> value.size
                else -> 1
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
                } else v
            }
            return removed
        }
    }
}
