// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core

import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.awscore.client.builder.AwsClientBuilder
import software.amazon.awssdk.awscore.client.builder.AwsDefaultClientBuilder
import software.amazon.awssdk.core.SdkClient
import software.amazon.awssdk.core.client.config.SdkAdvancedClientOption
import software.amazon.awssdk.core.retry.RetryMode
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.utils.SdkAutoCloseable
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

    inline fun <reified T : SdkClient> getClient(credProvider: ToolkitCredentialsProvider, region: AwsRegion): T =
        this.getClient(T::class, ConnectionSettings(credProvider, region))

    inline fun <reified T : SdkClient> getClient(connection: ConnectionSettings): T = this.getClient(T::class, connection)

    fun <T : SdkClient> getClient(sdkClass: KClass<T>, connection: ConnectionSettings): T {
        val key = AwsClientKey(
            credentialProviderId = connection.credentials.id,
            region = connection.region,
            serviceClass = sdkClass
        )

        val serviceId = key.serviceClass.java.getField("SERVICE_METADATA_ID").get(null) as String
        if (serviceId !in GLOBAL_SERVICE_DENY_LIST && getRegionProvider().isServiceGlobal(connection.region, serviceId)) {
            val globalRegion = getRegionProvider().getGlobalRegionForService(connection.region, serviceId)
            @Suppress("UNCHECKED_CAST")
            return cachedClients.computeIfAbsent(key.copy(region = globalRegion)) { createNewClient(sdkClass, connection.copy(region = globalRegion)) } as T
        }

        @Suppress("UNCHECKED_CAST")
        return cachedClients.computeIfAbsent(key) { createNewClient(sdkClass, connection) } as T
    }

    private fun <T : SdkClient> createNewClient(sdkClass: KClass<T>, connection: ConnectionSettings): T = constructAwsClient(
        sdkClass = sdkClass,
        credProvider = connection.credentials,
        region = Region.of(connection.region.id),
    )

    /**
     * Constructs a new low-level AWS client whose lifecycle is **NOT** managed centrally. Caller is responsible for shutting down the client
     */
    inline fun <reified T : SdkClient> createUnmanagedClient(
        credProvider: AwsCredentialsProvider,
        region: Region,
        endpointOverride: String? = null
    ): T = createUnmanagedClient(T::class, credProvider, region, endpointOverride)

    /**
     * Constructs a new low-level AWS client whose lifecycle is **NOT** managed centrally. Caller is responsible for shutting down the client
     */
    fun <T : SdkClient> createUnmanagedClient(
        sdkClass: KClass<T>,
        credProvider: AwsCredentialsProvider,
        region: Region,
        endpointOverride: String?
    ): T = constructAwsClient(sdkClass, credProvider = credProvider, region = region, endpointOverride = endpointOverride)

    protected abstract fun getRegionProvider(): ToolkitRegionProvider

    /**
     * Allow implementations to apply customizations to clients before they are built
     */
    protected open fun clientCustomizer(credentialProvider: AwsCredentialsProvider, regionId: String, builder: AwsClientBuilder<*, *>) {}

    /**
     * Calls [SdkAutoCloseable.close] on all managed clients and clears the cache
     */
    protected fun shutdown() {
        cachedClients.values.forEach { it.close() }
        cachedClients.clear()
    }

    protected fun invalidateSdks(providerId: String) {
        val invalidClients = cachedClients.entries.filter { it.key.credentialProviderId == providerId }.toSet()
        cachedClients.entries.removeAll(invalidClients)
        invalidClients.forEach { it.value.close() }
    }

    protected open fun <T : SdkClient> constructAwsClient(
        sdkClass: KClass<T>,
        credProvider: AwsCredentialsProvider,
        region: Region,
        endpointOverride: String? = null,
    ): T {
        val builderMethod = sdkClass.java.methods.find {
            it.name == "builder" && Modifier.isStatic(it.modifiers) && Modifier.isPublic(it.modifiers)
        } ?: throw IllegalArgumentException("Expected service interface to have a public static `builder()` method.")

        val builder = builderMethod.invoke(null) as AwsDefaultClientBuilder<*, *>

        @Suppress("UNCHECKED_CAST")
        return builder
            .httpClient(sdkHttpClient())
            .credentialsProvider(credProvider)
            .region(region)
            .overrideConfiguration { configuration ->
                configuration.putAdvancedOption(SdkAdvancedClientOption.USER_AGENT_PREFIX, userAgent)
                configuration.retryPolicy(RetryMode.STANDARD)
            }
            .apply {
                endpointOverride?.let {
                    endpointOverride(URI.create(it))
                }

                clientCustomizer(credProvider, region.id(), this)
            }
            .build() as T
    }

    @TestOnly
    fun cachedClients() = cachedClients

    companion object {
        private val GLOBAL_SERVICE_DENY_LIST = setOf(
            // sts is regionalized but does not identify as such in metadata
            "sts"
        )
    }
}
