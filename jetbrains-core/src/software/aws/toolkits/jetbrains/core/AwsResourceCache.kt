// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.google.common.cache.CacheBuilder
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import software.amazon.awssdk.core.SdkClient
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import kotlin.reflect.KClass

/**
 * Intended to prevent repeated unnecessary calls to AWS to understand resource state.
 *
 * Will cache responses from AWS by [AwsRegion]/[ToolkitCredentialsProvider] - generically applicable to any AWS call.
 */
interface AwsResourceCache {

    /**
     * Get a [resource] either by making a call or returning it from the cache if present and unexpired. Uses the currently [AwsRegion]
     * & [ToolkitCredentialsProvider] active in [ProjectAccountSettingsManager].
     *
     * @param[useStale] if an exception occurs attempting to refresh the resource return a cached version if it exists (even if it's expired). Default: true
     * @param[forceFetch] force the resource to refresh (and update cache) even if a valid cache version exists. Default: false
     */
    fun <T> getResource(resource: Resource<T>, useStale: Boolean = true, forceFetch: Boolean = false): CompletionStage<T>

    /**
     * @see [getResource]
     *
     * @param[region] the specific [AwsRegion] to use for this resource
     * @param[credentialProvider] the specific [ToolkitCredentialsProvider] to use for this resource
     */
    fun <T> getResource(
        resource: Resource<T>,
        region: AwsRegion,
        credentialProvider: ToolkitCredentialsProvider,
        useStale: Boolean = true,
        forceFetch: Boolean = false
    ): CompletionStage<T>

    /**
     * Clears the contents of the cache across all regions, credentials and resource types.
     */
    fun clear()

    /**
     * Clears the contents of the cache for the specific [resource] type, in the currently active [AwsRegion] & [ToolkitCredentialsProvider]
     */
    fun clear(resource: Resource<*>)

    /**
     * Clears the contents of the cache for the specific [resource] type, [AwsRegion] & [ToolkitCredentialsProvider]
     */
    fun clear(resource: Resource<*>, region: AwsRegion, credentialProvider: ToolkitCredentialsProvider)

    companion object {
        @JvmStatic
        fun getInstance(project: Project): AwsResourceCache = ServiceManager.getService(project, AwsResourceCache::class.java)
    }
}

fun <T> Project.getResource(resource: Resource<T>, useStale: Boolean = true, forceFetch: Boolean = false) =
    AwsResourceCache.getInstance(this).getResource(resource, useStale, forceFetch)

sealed class Resource<T> {

    /**
     * A [Cached] resource is one whose fetch is potentially expensive, the result of which should be memoized for a period of time ([expiry]).
     */
    abstract class Cached<T> : Resource<T>() {
        abstract fun fetch(project: Project, region: AwsRegion, credentials: ToolkitCredentialsProvider): T
        open fun expiry(): Duration = DEFAULT_EXPIRY

        companion object {
            private val DEFAULT_EXPIRY = Duration.ofMinutes(10)
        }
    }

    /**
     * A [View] resource depends on some other underlying [Resource] and then performs some [transform] of the [underlying]'s result
     * in order to return the desired type [Output]. The [transform] result is not cached, [transform]s are re-applied on each fetch - thus should
     * should be relatively cheap.
     */
    class View<Input, Output>(internal val underlying: Resource<Input>, private val transform: Input.() -> Output) : Resource<Output>() {
        @Suppress("UNCHECKED_CAST")
        internal fun doMap(input: Any) = transform(input as Input)
    }
}

class ClientBackedCachedResource<ReturnType, ClientType : SdkClient>(
    private val sdkClientClass: KClass<ClientType>,
    private val fetchCall: ClientType.() -> ReturnType
) : Resource.Cached<ReturnType>() {
    override fun fetch(project: Project, region: AwsRegion, credentials: ToolkitCredentialsProvider): ReturnType {
        val client = AwsClientManager.getInstance(project).getClient(sdkClientClass, credentials, region)
        return fetchCall(client)
    }
}

class DefaultAwsResourceCache(private val project: Project, private val clock: Clock, maximumCacheEntries: Long) : AwsResourceCache {

    @Suppress("unused")
    constructor(project: Project) : this(project, Clock.systemDefaultZone(), MAXIMUM_CACHE_ENTRIES)

    private val cache = CacheBuilder.newBuilder().maximumSize(maximumCacheEntries).build<Key<*>, Entry<*>>().asMap()
    private val accountSettings = ProjectAccountSettingsManager.getInstance(project)

    override fun <T> getResource(resource: Resource<T>, useStale: Boolean, forceFetch: Boolean) =
        getResource(resource, accountSettings.activeRegion, accountSettings.activeCredentialProvider, useStale, forceFetch)

    override fun <T> getResource(
        resource: Resource<T>,
        region: AwsRegion,
        credentialProvider: ToolkitCredentialsProvider,
        useStale: Boolean,
        forceFetch: Boolean
    ): CompletionStage<T> = when (resource) {
        is Resource.View<*, T> -> getResource(resource.underlying, region, credentialProvider, useStale, forceFetch).thenApply { resource.doMap(it as Any) }
        is Resource.Cached<T> -> {
            val future = CompletableFuture<T>()
            val key = Key(resource, region, credentialProvider)
            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    @Suppress("UNCHECKED_CAST")
                    val result = cache.compute(key) { _, value -> fetchIfNeeded(key, value as Entry<T>?, useStale, forceFetch) } as Entry<T>
                    future.complete(result.value)
                } catch (e: Exception) {
                    future.completeExceptionally(e)
                }
            }
            future
        }
    }

    override fun clear(resource: Resource<*>) {
        clear(resource, accountSettings.activeRegion, accountSettings.activeCredentialProvider)
    }

    override fun clear(resource: Resource<*>, region: AwsRegion, credentialProvider: ToolkitCredentialsProvider) {
        when (resource) {
            is Resource.Cached<*> -> cache.remove(Key(resource, region, credentialProvider))
            is Resource.View<*, *> -> clear(resource.underlying, region, credentialProvider)
        }
    }

    override fun clear() {
        cache.clear()
    }

    private fun <T> fetchIfNeeded(key: Key<T>, currentEntry: Entry<T>?, useStale: Boolean, forceFetch: Boolean) = when {
        currentEntry == null -> fetch(key)
        clock.instant().isBefore(currentEntry.expiry) && !forceFetch -> currentEntry
        !useStale -> fetch(key)
        else -> try {
            fetch(key)
        } catch (e: Exception) {
            LOG.warn(e) { "Failed to fetch resource using $key, falling back to expired entry" }
            currentEntry
        } as Entry<T>
    }

    private fun <T> fetch(key: Key<T>): Entry<T> {
        val value = key.resource.fetch(project, key.region, key.credentials)
        return Entry(clock.instant().plus(key.resource.expiry()), value)
    }

    companion object {
        private val LOG = getLogger<DefaultAwsResourceCache>()
        private const val MAXIMUM_CACHE_ENTRIES = 100L

        private data class Key<T>(val resource: Resource.Cached<T>, val region: AwsRegion, val credentials: ToolkitCredentialsProvider)
        private class Entry<T>(val expiry: Instant, val value: T)
    }
}