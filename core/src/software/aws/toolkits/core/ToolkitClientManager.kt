// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core

import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.awscore.client.builder.AwsDefaultClientBuilder
import software.amazon.awssdk.core.SdkClient
import software.amazon.awssdk.core.client.config.SdkAdvancedClientOption
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.regions.Region
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.ToolkitRegionProvider
import java.lang.reflect.Modifier
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import kotlin.reflect.KClass

/**
 * An SPI for caching of AWS clients inside of a toolkit
 */
abstract class ToolkitClientManager {
    data class AwsClientKey(
        val credentialProviderId: String,
        val region: AwsRegion,
        val serviceClass: KClass<out SdkClient>
    )

    private val cachedClients = ConcurrentHashMap<AwsClientKey, SdkClient>()

    protected abstract val userAgent: String

    protected abstract fun sdkHttpClient(): SdkHttpClient

    inline fun <reified T : SdkClient> getClient(
        credProvider: ToolkitCredentialsProvider,
        region: AwsRegion
    ): T = this.getClient(T::class, credProvider, region)

    @Suppress("UNCHECKED_CAST")
    open fun <T : SdkClient> getClient(
        sdkClass: KClass<T>,
        credProvider: ToolkitCredentialsProvider,
        region: AwsRegion
    ): T {
        val key = AwsClientKey(
            credentialProviderId = credProvider.id,
            region = region,
            serviceClass = sdkClass
        )

        val serviceId = key.serviceClass.java.getField("SERVICE_NAME").get(null) as String
        if (serviceId !in GLOBAL_SERVICE_DENY_LIST && getRegionProvider().isServiceGlobal(region, serviceId)) {
            val globalRegion = getRegionProvider().getGlobalRegionForService(region, serviceId)
            return cachedClients.computeIfAbsent(key.copy(region = globalRegion)) { createNewClient(sdkClass, globalRegion, credProvider) } as T
        }

        return cachedClients.computeIfAbsent(key) { createNewClient(sdkClass, region, credProvider) } as T
    }

    protected abstract fun getRegionProvider(): ToolkitRegionProvider

    /**
     * Calls [AutoCloseable.close] on all managed clients and clears the cache
     */
    protected fun shutdown() {
        cachedClients.values.map { it }.forEach { it.close() }
        cachedClients.clear()
    }

    protected fun invalidateSdks(providerId: String) {
        val invalidClients = cachedClients.entries.filter { it.key.credentialProviderId == providerId }
        cachedClients.entries.removeAll(invalidClients)
        invalidClients.forEach { it.value.close() }
    }

    @TestOnly
    fun cachedClients() = cachedClients

    /**
     * Creates a new client for the requested [AwsClientKey]
     */
    @Suppress("UNCHECKED_CAST")
    protected open fun <T : SdkClient> createNewClient(
        sdkClass: KClass<T>,
        region: AwsRegion,
        credProvider: ToolkitCredentialsProvider
    ): T = createNewClient(sdkClass, sdkHttpClient(), Region.of(region.id), credProvider, userAgent)

    companion object {
        private val GLOBAL_SERVICE_DENY_LIST = setOf(
            // sts is regionalized but does not identify as such in metadata
            "sts"
        )

        fun <T : SdkClient> createNewClient(
            sdkClass: KClass<T>,
            httpClient: SdkHttpClient,
            region: Region,
            credProvider: AwsCredentialsProvider,
            userAgent: String,
            endpointOverride: String? = null
        ): T {
            val builderMethod = sdkClass.java.methods.find {
                it.name == "builder" && Modifier.isStatic(it.modifiers) && Modifier.isPublic(it.modifiers)
            } ?: throw IllegalArgumentException("Expected service interface to have a public static `builder()` method.")

            val builder = builderMethod.invoke(null) as AwsDefaultClientBuilder<*, *>

            @Suppress("UNCHECKED_CAST")
            return builder
                .httpClient(httpClient)
                .credentialsProvider(credProvider)
                .region(region)
                .overrideConfiguration {
                    it.putAdvancedOption(SdkAdvancedClientOption.USER_AGENT_PREFIX, userAgent)
                }
                .also { _ ->
                    endpointOverride?.let {
                        builder.endpointOverride(URI.create(it))
                    }
                }
                .build() as T
        }
    }
}
