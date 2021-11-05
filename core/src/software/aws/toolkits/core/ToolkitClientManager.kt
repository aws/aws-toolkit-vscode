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
    ): T = this.getClient(T::class, ConnectionSettings(credProvider, region))

    @Suppress("UNCHECKED_CAST")
    fun <T : SdkClient> getClient(
        sdkClass: KClass<T>,
        connection: ConnectionSettings
    ): T {
        val key = AwsClientKey(
            credentialProviderId = connection.credentials.id,
            region = connection.region,
            serviceClass = sdkClass
        )

        val serviceId = key.serviceClass.java.getField("SERVICE_METADATA_ID").get(null) as String
        if (serviceId !in GLOBAL_SERVICE_DENY_LIST && getRegionProvider().isServiceGlobal(connection.region, serviceId)) {
            val globalRegion = getRegionProvider().getGlobalRegionForService(connection.region, serviceId)
            return cachedClients.computeIfAbsent(key.copy(region = globalRegion)) { createNewClient(sdkClass, connection.copy(region = globalRegion)) } as T
        }

        return cachedClients.computeIfAbsent(key) { createNewClient(sdkClass, connection) } as T
    }

    protected abstract fun getRegionProvider(): ToolkitRegionProvider

    /**
     * Allow implementations to apply customizations to clients before they are built
     */
    protected open fun clientCustomizer(connection: ConnectionSettings, builder: AwsClientBuilder<*, *>) {}

    /**
     * Calls [AutoCloseable.close] on all managed clients and clears the cache
     */
    protected fun shutdown() {
        cachedClients.values.forEach { it.close() }
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
    open fun <T : SdkClient> createNewClient(
        sdkClass: KClass<T>,
        connection: ConnectionSettings
    ): T = createNewClient(
        sdkClass = sdkClass,
        httpClient = sdkHttpClient(),
        region = Region.of(connection.region.id),
        credProvider = connection.credentials,
        userAgent = userAgent,
        clientCustomizer = { builder -> clientCustomizer(connection, builder) }
    )

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
            userAgent: String? = null,
            endpointOverride: String? = null,
            clientCustomizer: (AwsClientBuilder<*, *>) -> Unit = {}
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
                .overrideConfiguration { configuration ->
                    userAgent?.let { configuration.putAdvancedOption(SdkAdvancedClientOption.USER_AGENT_PREFIX, it) }
                    configuration.retryPolicy(RetryMode.STANDARD)
                }
                .also { _ ->
                    endpointOverride?.let {
                        builder.endpointOverride(URI.create(it))
                    }
                }
                .apply(clientCustomizer)
                .build() as T
        }
    }
}
