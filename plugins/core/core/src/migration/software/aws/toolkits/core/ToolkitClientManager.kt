// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package migration.software.aws.toolkits.core

import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.token.credentials.SdkTokenProvider
import software.amazon.awssdk.auth.token.signer.aws.BearerTokenSigner
import software.amazon.awssdk.awscore.AwsExecutionAttribute
import software.amazon.awssdk.awscore.AwsRequest
import software.amazon.awssdk.awscore.AwsRequestOverrideConfiguration
import software.amazon.awssdk.awscore.client.builder.AwsClientBuilder
import software.amazon.awssdk.awscore.client.builder.AwsDefaultClientBuilder
import software.amazon.awssdk.core.SdkClient
import software.amazon.awssdk.core.SdkRequest
import software.amazon.awssdk.core.client.builder.SdkSyncClientBuilder
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration
import software.amazon.awssdk.core.client.config.SdkAdvancedClientOption
import software.amazon.awssdk.core.interceptor.Context
import software.amazon.awssdk.core.interceptor.ExecutionAttributes
import software.amazon.awssdk.core.interceptor.ExecutionInterceptor
import software.amazon.awssdk.core.interceptor.SdkInternalExecutionAttribute
import software.amazon.awssdk.core.internal.http.pipeline.stages.ApplyUserAgentStage
import software.amazon.awssdk.core.internal.http.pipeline.stages.ApplyUserAgentStage.HEADER_USER_AGENT
import software.amazon.awssdk.core.retry.RetryMode
import software.amazon.awssdk.core.retry.RetryPolicy
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.utils.SdkAutoCloseable
import software.aws.toolkits.core.ClientConnectionSettings
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.ToolkitClientCustomizer
import software.aws.toolkits.core.clients.nullDefaultProfileFile
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import java.lang.reflect.Modifier
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import kotlin.reflect.KClass

/**
 * An SPI for caching of AWS clients inside of a toolkit
 */
abstract class ToolkitClientManager {
    data class AwsClientKey(
        val providerId: String,
        val region: AwsRegion,
        val serviceClass: KClass<out SdkClient>
    )

    private val cachedClients = ConcurrentHashMap<AwsClientKey, SdkClient>()

    protected abstract fun userAgent(): String

    protected abstract fun sdkHttpClient(): SdkHttpClient

    inline fun <reified T : SdkClient> getClient(credProvider: ToolkitCredentialsProvider, region: AwsRegion): T =
        this.getClient(T::class, ConnectionSettings(credProvider, region))

    inline fun <reified T : SdkClient> getClient(connection: ClientConnectionSettings<*>): T = this.getClient(T::class, connection)

    fun <T : SdkClient> getClient(sdkClass: KClass<T>, connection: ClientConnectionSettings<*>): T {
        val key = AwsClientKey(
            providerId = connection.providerId,
            region = connection.region,
            serviceClass = sdkClass
        )

        val serviceId = key.serviceClass.java.getField("SERVICE_METADATA_ID").get(null) as String
        if (serviceId !in GLOBAL_SERVICE_DENY_LIST && getRegionProvider().isServiceGlobal(connection.region, serviceId)) {
            val globalRegion = getRegionProvider().getGlobalRegionForService(connection.region, serviceId)
            @Suppress("UNCHECKED_CAST")
            return cachedClients.computeIfAbsent(key.copy(region = globalRegion)) {
                createNewClient(sdkClass, connection.withRegion(region = globalRegion))
            } as T
        }

        @Suppress("UNCHECKED_CAST")
        return cachedClients.computeIfAbsent(key) { createNewClient(sdkClass, connection) } as T
    }

    private fun <T : SdkClient> createNewClient(sdkClass: KClass<T>, connection: ClientConnectionSettings<*>): T = when (connection) {
        is ConnectionSettings -> constructAwsClient(
            sdkClass = sdkClass,
            credProvider = connection.credentials,
            region = Region.of(connection.region.id),
        )

        is TokenConnectionSettings -> constructAwsClient(
            sdkClass = sdkClass,
            tokenProvider = connection.tokenProvider,
            region = Region.of(connection.region.id),
        )
    }

    /**
     * Constructs a new low-level AWS client whose lifecycle is **NOT** managed centrally. Caller is responsible for shutting down the client
     */
    inline fun <reified T : SdkClient> createUnmanagedClient(
        credProvider: AwsCredentialsProvider,
        region: Region,
        endpointOverride: String? = null,
        clientCustomizer: ToolkitClientCustomizer? = null
    ): T = createUnmanagedClient(T::class, credProvider, region, endpointOverride, clientCustomizer)

    /**
     * Constructs a new low-level AWS client whose lifecycle is **NOT** managed centrally. Caller is responsible for shutting down the client
     */
    fun <T : SdkClient> createUnmanagedClient(
        sdkClass: KClass<T>,
        credProvider: AwsCredentialsProvider,
        region: Region,
        endpointOverride: String?,
        clientCustomizer: ToolkitClientCustomizer? = null
    ): T = constructAwsClient(sdkClass, credProvider = credProvider, region = region, endpointOverride = endpointOverride, clientCustomizer = clientCustomizer)

    protected abstract fun getRegionProvider(): ToolkitRegionProvider

    /**
     * Allow implementations to apply customizations to clients before they are built
     */
    protected open fun globalClientCustomizer(
        credentialProvider: AwsCredentialsProvider?,
        tokenProvider: SdkTokenProvider?,
        regionId: String,
        builder: AwsClientBuilder<*, *>,
        clientOverrideConfiguration: ClientOverrideConfiguration.Builder
    ) {}

    /**
     * Calls [SdkAutoCloseable.close] on all managed clients and clears the cache
     */
    protected fun shutdown() {
        cachedClients.values.forEach { it.close() }
        cachedClients.clear()
    }

    protected fun invalidateSdks(providerId: String) {
        val invalidClients = cachedClients.entries.filter { it.key.providerId == providerId }.toSet()
        cachedClients.entries.removeAll(invalidClients)
        invalidClients.forEach { it.value.close() }
    }

    protected open fun <T : SdkClient> constructAwsClient(
        sdkClass: KClass<T>,
        credProvider: AwsCredentialsProvider? = null,
        tokenProvider: SdkTokenProvider? = null,
        region: Region,
        endpointOverride: String? = null,
        clientCustomizer: ToolkitClientCustomizer? = null
    ): T {
        checkNotNull(credProvider ?: tokenProvider) { "Either a credential provider or a bearer token provider must be provided" }

        val builderMethod = sdkClass.java.methods.find {
            it.name == "builder" && Modifier.isStatic(it.modifiers) && Modifier.isPublic(it.modifiers)
        } ?: throw IllegalArgumentException("Expected service interface to have a public static `builder()` method.")

        val builder = builderMethod.invoke(null) as AwsDefaultClientBuilder<*, *>

        @Suppress("UNCHECKED_CAST")
        return builder
            .region(region)
            .apply {
                if (this is SdkSyncClientBuilder<*, *>) {
                    // async clients use CRT, and keeps trying to shut down our apache client even though it doesn't respect our client settings
                    // so only set this for sync clients
                    httpClient(sdkHttpClient())
                }

                val clientOverrideConfig = ClientOverrideConfiguration.builder()

                if (credProvider != null) {
                    credentialsProvider(credProvider)
                }

                if (tokenProvider != null) {
                    val tokenMethod = builderMethod.returnType.methods.find {
                        it.name == "tokenProvider" &&
                            it.parameterCount == 1 &&
                            it.parameters[0].type.name == "software.amazon.awssdk.auth.token.credentials.SdkTokenProvider"
                    }

                    if (tokenMethod == null) {
                        LOG.warn { "Ignoring bearer provider parameter for ${sdkClass.qualifiedName} since it's not a supported client attribute" }
                    } else {
                        tokenMethod.invoke(this, tokenProvider)
                        clientOverrideConfig.nullDefaultProfileFile()
                        // TODO: why do we need this?
                        clientOverrideConfig.putAdvancedOption(SdkAdvancedClientOption.SIGNER, BearerTokenSigner())
                    }
                }

                clientOverrideConfig.addExecutionInterceptor(object : ExecutionInterceptor {
                    override fun modifyRequest(
                        context: Context.ModifyRequest,
                        executionAttributes: ExecutionAttributes
                    ): SdkRequest {
                        val request = context.request()
                        if (request !is AwsRequest) {
                            return request
                        }

                        val clientType = executionAttributes.getAttribute(AwsExecutionAttribute.CLIENT_TYPE)
                        val sdkClient = executionAttributes.getAttribute(SdkInternalExecutionAttribute.SDK_CLIENT)
                        val serviceClientConfiguration = sdkClient.serviceClientConfiguration()
                        val retryPolicy: RetryPolicy =
                            serviceClientConfiguration.overrideConfiguration().retryPolicy().orElse(RetryPolicy.defaultRetryPolicy())
                        val toolkitUserAgent = userAgent()

                        val requestUserAgent = ApplyUserAgentStage.resolveClientUserAgent(
                            toolkitUserAgent,
                            null,
                            clientType,
                            null,
                            null,
                            retryPolicy
                        )

                        val overrideConfiguration = request.overrideConfiguration()
                            .map { config ->
                                config.toBuilder()
                                    .putHeader(HEADER_USER_AGENT, requestUserAgent)
                                    .build()
                            }
                            .orElseGet {
                                AwsRequestOverrideConfiguration.builder()
                                    .putHeader(HEADER_USER_AGENT, requestUserAgent)
                                    .build()
                            }

                        return request.toBuilder()
                            .overrideConfiguration(overrideConfiguration)
                            .build()
                    }
                })

                clientOverrideConfig.let { configuration ->
                    configuration.retryPolicy(RetryMode.STANDARD)
                }

                endpointOverride?.let {
                    endpointOverride(URI.create(it))
                }

                globalClientCustomizer(credProvider, tokenProvider, region.id(), this, clientOverrideConfig)

                clientCustomizer?.let {
                    it.customize(credProvider, tokenProvider, region.id(), this, clientOverrideConfig)
                }

                // TODO: ban overrideConfiguration outside of here
                overrideConfiguration(clientOverrideConfig.build())
            }
            .build() as T
    }

    @TestOnly
    fun cachedClients() = cachedClients

    companion object {
        private val LOG = getLogger<ToolkitClientManager>()
        private val GLOBAL_SERVICE_DENY_LIST = setOf(
            // sts is regionalized but does not identify as such in metadata
            "sts"
        )
    }
}
