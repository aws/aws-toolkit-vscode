package software.aws.toolkits.core

import software.amazon.awssdk.awscore.client.builder.AwsDefaultClientBuilder
import software.amazon.awssdk.core.SdkClient
import software.amazon.awssdk.core.client.builder.ClientHttpConfiguration
import software.amazon.awssdk.http.apache.ApacheSdkHttpClientFactory
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3ClientBuilder
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import java.lang.reflect.Modifier
import java.util.concurrent.ConcurrentHashMap
import kotlin.reflect.KClass

/**
 * An SPI for caching of AWS clients inside of a toolkit
 */
abstract class ToolkitClientManager {
    protected data class AwsClientKey(
        val profileName: String,
        val region: AwsRegion,
        val serviceClass: KClass<out SdkClient>
    )

    private val cachedClients = ConcurrentHashMap<AwsClientKey, SdkClient>()
    private val httpClient = ApacheSdkHttpClientFactory.builder().build().createHttpClient()

    @Suppress("UNCHECKED_CAST")
    fun <T : SdkClient> getClient(clz: KClass<T>): T {
        val key = AwsClientKey(
            profileName = getCredentialsProvider().id,
            region = getRegion(),
            serviceClass = clz
        )

        if (key.region != AwsRegion.GLOBAL && GLOBAL_SERVICES.contains(key.serviceClass.simpleName)) {
            return cachedClients.computeIfAbsent(key.copy(region = AwsRegion.GLOBAL)) { createNewClient(it) } as T
        }

        return cachedClients.computeIfAbsent(key) { createNewClient(it) } as T
    }

    inline fun <reified T : SdkClient> getClient(): T =
        this.getClient(T::class)

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
        httpClient.close()
    }

    /**
     * Creates a new client for the requested [AwsClientKey]
     */
    @Suppress("UNCHECKED_CAST")
    protected open fun <T : SdkClient> createNewClient(key: AwsClientKey): T {
        val builderMethod = key.serviceClass.java.methods.find {
            it.name == "builder" && Modifier.isStatic(it.modifiers) && Modifier.isPublic(it.modifiers)
        } ?: throw IllegalArgumentException("Expected service interface to have a public static `builder()` method.")
        val builder = builderMethod.invoke(null) as AwsDefaultClientBuilder<*, *>

        return builder
            .httpConfiguration(ClientHttpConfiguration.builder().httpClient(httpClient).build())
            .credentialsProvider(getCredentialsProvider())
            .region(Region.of(key.region.id))
            .also {
                if (it is S3ClientBuilder) {
                    it.advancedConfiguration { it.pathStyleAccessEnabled(true) }
                }
            }
            .build() as T
    }

    companion object {
        private val GLOBAL_SERVICES = setOf("IAMClient")
    }
}