// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package migration.software.aws.toolkits.jetbrains.core

import com.intellij.openapi.components.service
import software.aws.toolkits.core.ClientConnectionSettings
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.Resource
import java.time.Duration
import java.util.concurrent.CompletionStage
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit

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
        region: AwsRegion,
        tokenProvider: ToolkitBearerTokenProvider,
        useStale: Boolean = true,
        forceFetch: Boolean = false
    ): CompletionStage<T>

    /**
     * @see [getResource]
     */
    fun <T> getResource(
        resource: Resource<T>,
        connectionSettings: ClientConnectionSettings<*>,
        useStale: Boolean = true,
        forceFetch: Boolean = false
    ): CompletionStage<T> = when (connectionSettings) {
        is ConnectionSettings -> getResource(resource, connectionSettings.region, connectionSettings.credentials, useStale, forceFetch)
        is TokenConnectionSettings -> getResource(resource, connectionSettings.region, connectionSettings.tokenProvider, useStale, forceFetch)
    }

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
        region: AwsRegion,
        tokenProvider: ToolkitBearerTokenProvider,
        timeout: Duration = DEFAULT_TIMEOUT,
        useStale: Boolean = true,
        forceFetch: Boolean = false
    ): T = wait(timeout) { getResource(resource, region, tokenProvider, useStale, forceFetch) }

    /**
     * Blocking version of [getResource]
     */
    fun <T> getResourceNow(
        resource: Resource<T>,
        connectionSettings: ClientConnectionSettings<*>,
        timeout: Duration = DEFAULT_TIMEOUT,
        useStale: Boolean = true,
        forceFetch: Boolean = false
    ): T = when (connectionSettings) {
        is ConnectionSettings -> getResourceNow(resource, connectionSettings.region, connectionSettings.credentials, timeout, useStale, forceFetch)
        is TokenConnectionSettings -> getResourceNow(resource, connectionSettings.region, connectionSettings.tokenProvider, timeout, useStale, forceFetch)
    }

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
    fun <T> getResourceIfPresent(resource: Resource<T>, region: AwsRegion, tokenProvider: ToolkitBearerTokenProvider, useStale: Boolean = true): T?

    /**
     * Gets the [resource] if it exists in the cache.
     */
    fun <T> getResourceIfPresent(resource: Resource<T>, connectionSettings: ClientConnectionSettings<*>, useStale: Boolean = true): T? =
        when (connectionSettings) {
            is ConnectionSettings -> getResourceIfPresent(resource, connectionSettings.region, connectionSettings.credentials, useStale)
            is TokenConnectionSettings -> getResourceIfPresent(resource, connectionSettings.region, connectionSettings.tokenProvider, useStale)
        }

    /**
     * Clears the contents of the cache across all regions, credentials and resource types.
     */
    suspend fun clear() // TODO: ultimately all of these calls need to be made suspend - start with this one to resolve UI lock

    /**
     * Clears the contents of the cache for the specific [ClientConnectionSettings]
     */
    fun clear(connectionSettings: ClientConnectionSettings<*>)

    /**
     * Clears the contents of the cache for the specific [resource] type] & [ClientConnectionSettings]
     */
    fun clear(resource: Resource<*>, connectionSettings: ClientConnectionSettings<*>)

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
