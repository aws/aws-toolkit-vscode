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
import software.amazon.awssdk.services.s3.S3ClientBuilder
import software.amazon.awssdk.services.s3.internal.handlers.CreateBucketInterceptor
import software.amazon.awssdk.services.s3.internal.handlers.DecodeUrlEncodedResponseInterceptor
import software.amazon.awssdk.services.s3.internal.handlers.DisableDoubleUrlEncodingInterceptor
import software.amazon.awssdk.services.s3.internal.handlers.EnableChunkedEncodingInterceptor
import software.amazon.awssdk.services.s3.internal.handlers.EndpointAddressInterceptor
import software.amazon.awssdk.services.s3.internal.handlers.PutObjectInterceptor
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import java.lang.reflect.Modifier
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import kotlin.reflect.KClass

/**
 * An SPI for caching of AWS clients inside of a toolkit
 */
abstract class ToolkitClientManager(private val sdkHttpClient: SdkHttpClient) {
    data class AwsClientKey(
        val credentialProviderId: String,
        val region: AwsRegion,
        val serviceClass: KClass<out SdkClient>
    )

    private val cachedClients = ConcurrentHashMap<AwsClientKey, SdkClient>()

    protected abstract val userAgent: String

    inline fun <reified T : SdkClient> getClient(
        credentialsProviderOverride: ToolkitCredentialsProvider? = null,
        regionOverride: AwsRegion? = null
    ): T = this.getClient(T::class, credentialsProviderOverride, regionOverride)

    @Suppress("UNCHECKED_CAST")
    open fun <T : SdkClient> getClient(
        clz: KClass<T>,
        credentialsProviderOverride: ToolkitCredentialsProvider? = null,
        regionOverride: AwsRegion? = null
    ): T {
        val credProvider = credentialsProviderOverride ?: getCredentialsProvider()
        val region = regionOverride ?: getRegion()

        val key = AwsClientKey(
            credentialProviderId = credProvider.id,
            region = region,
            serviceClass = clz
        )

        if (key.region != AwsRegion.GLOBAL && GLOBAL_SERVICES.contains(key.serviceClass.simpleName)) {
            return cachedClients.computeIfAbsent(key.copy(region = AwsRegion.GLOBAL)) { createNewClient(it, AwsRegion.GLOBAL, credProvider) } as T
        }

        return cachedClients.computeIfAbsent(key) { createNewClient(it, region, credProvider) } as T
    }

    /**
     * Get the current active credential provider for the toolkit
     */
    protected abstract fun getCredentialsProvider(): ToolkitCredentialsProvider

    /**
     * Get the current active region for the toolkit
     */
    protected abstract fun getRegion(): AwsRegion

    /**
     * Calls [AutoCloseable.close] if client implements [AutoCloseable] and clears the cache
     */
    protected fun shutdown() {
        cachedClients.values.mapNotNull { it as? AutoCloseable }.forEach { it.close() }
    }

    protected fun invalidateSdks(providerId: String) {
        cachedClients.keys.removeIf { it.credentialProviderId == providerId }
    }

    /**
     * Used by [software.aws.toolkits.jetbrains.core.MockClientManager]
     */
    @TestOnly
    protected fun clear() = cachedClients.clear()

    @TestOnly
    fun cachedClients() = cachedClients

    /**
     * Creates a new client for the requested [AwsClientKey]
     */
    @Suppress("UNCHECKED_CAST")
    protected open fun <T : SdkClient> createNewClient(
        key: AwsClientKey,
        region: AwsRegion = key.region,
        credProvider: ToolkitCredentialsProvider = getCredentialsProvider()
    ): T {
        val sdkClass = key.serviceClass as KClass<T>
        return createNewClient(sdkClass, sdkHttpClient, Region.of(region.id), credProvider, userAgent)
    }

    companion object {
        private val GLOBAL_SERVICES = setOf("IamClient")

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
                    if (builder is S3ClientBuilder) {
                        // TODO: Remove after SDK code-gens these instead of uses class loader
                        it.addExecutionInterceptor(EndpointAddressInterceptor())
                        it.addExecutionInterceptor(CreateBucketInterceptor())
                        it.addExecutionInterceptor(PutObjectInterceptor())
                        it.addExecutionInterceptor(EnableChunkedEncodingInterceptor())
                        it.addExecutionInterceptor(DisableDoubleUrlEncodingInterceptor())
                        it.addExecutionInterceptor(DecodeUrlEncodedResponseInterceptor())
                    }
                }
                .also { _ ->
                    endpointOverride?.let {
                        builder.endpointOverride(URI.create(it))
                    }
                    if (builder is S3ClientBuilder) {
                        builder.serviceConfiguration { it.pathStyleAccessEnabled(true) }
                    }
                }
                .build() as T
        }
    }
}
