package software.aws.toolkits.jetbrains.core

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.auth.AWSSessionCredentials
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import software.amazon.awssdk.core.SdkClient
import software.amazon.awssdk.core.auth.AwsCredentials
import software.amazon.awssdk.core.auth.AwsCredentialsProvider
import software.amazon.awssdk.core.auth.AwsSessionCredentials
import software.amazon.awssdk.core.client.builder.ClientHttpConfiguration
import software.amazon.awssdk.core.client.builder.SyncClientBuilder
import software.amazon.awssdk.core.regions.Region
import software.amazon.awssdk.http.apache.ApacheSdkHttpClientFactory
import software.amazon.awssdk.services.s3.S3ClientBuilder
import software.aws.toolkits.jetbrains.core.credentials.AwsCredentialsProfileProvider
import software.aws.toolkits.jetbrains.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegion.Companion.GLOBAL
import java.lang.reflect.Modifier
import java.util.concurrent.ConcurrentHashMap
import kotlin.reflect.KClass

class AwsClientManager internal constructor(
    project: Project,
    private val settings: AwsSettingsProvider,
    private val credentialsProfileProvider: AwsCredentialsProfileProvider
) : Disposable {
    init {
        Disposer.register(project, this)
    }

    private data class AwsClientKey(val profileName: String, val region: AwsRegion, val serviceClass: KClass<*>)

    private val httpClient = ApacheSdkHttpClientFactory.builder().build().createHttpClient()

    companion object {

        private val GLOBAL_SERVICES = setOf("IAMClient")
        @JvmStatic
        fun getInstance(project: Project): AwsClientManager {
            return ServiceManager.getService(project, AwsClientManager::class.java)
        }
    }

    private val cachedClients = ConcurrentHashMap<AwsClientKey, Any>()

    fun <T : SdkClient> getClient(clz: KClass<T>): T {
        val key = AwsClientKey(
                profileName = settings.currentProfile!!.name,
                region = settings.currentRegion,
                serviceClass = clz
        )

        @Suppress("UNCHECKED_CAST")
        return cachedClients.computeIfAbsent(key, { createNewClient(it) }) as T
    }

    inline fun <reified T : SdkClient> getClient(): T = this.getClient(T::class)

    override fun dispose() {
        cachedClients.values.mapNotNull { it as? AutoCloseable }.forEach { it.close() }
        httpClient.close()
    }

    @Suppress("NO_REFLECTION_IN_CLASS_PATH", "UNCHECKED_CAST")
    private fun <T : SdkClient> createNewClient(key: AwsClientKey): T {
        if (key.region != GLOBAL && GLOBAL_SERVICES.contains(key.serviceClass.simpleName)) {
            return cachedClients.computeIfAbsent(key.copy(region = GLOBAL), { createNewClient(it) }) as T
        }

        val builderMethod = key.serviceClass.java.methods.find { it.name == "builder" && Modifier.isStatic(it.modifiers) && Modifier.isPublic(it.modifiers) }
                ?: throw IllegalArgumentException("Expected service interface to have a public static `builder()` method.")
        val builder = builderMethod.invoke(null) as SyncClientBuilder<*, *>

        return builder
                .credentialsProvider(getCredentialsProvider(settings.currentProfile!!.name).toV2())
                .region(Region.of(key.region.id))
                .run {
                    if (this is S3ClientBuilder) {
                        this.advancedConfiguration { it.pathStyleAccessEnabled(true) }
                    }
                    this
                }
                .httpConfiguration(ClientHttpConfiguration.builder().httpClient(httpClient).build())
                .build() as T
    }

    private fun getCredentialsProvider(profileName: String): AWSCredentialsProvider {
        //TODO If we cannot find the profile name, we should report internal error
        return credentialsProfileProvider.lookupProfileByName(profileName)!!.awsCredentials
    }

    private fun AWSCredentialsProvider.toV2() =
            AwsCredentialsProvider {
                val cred = this@toV2.credentials ?: throw IllegalStateException("Credentials should not be null")
                when (cred) {
                    is AWSSessionCredentials -> AwsSessionCredentials.create(
                            cred.awsAccessKeyId,
                            cred.awsSecretKey,
                            cred.sessionToken
                    )
                    else -> AwsCredentials.create(cred.awsAccessKeyId, cred.awsSecretKey)
                }
            }
}