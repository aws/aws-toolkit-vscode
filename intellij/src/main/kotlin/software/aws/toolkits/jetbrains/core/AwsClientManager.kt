package software.aws.toolkits.jetbrains.core

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.auth.AWSSessionCredentials
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import software.amazon.awssdk.core.SdkClient
import software.amazon.awssdk.core.auth.AwsCredentials
import software.amazon.awssdk.core.auth.AwsCredentialsProvider
import software.amazon.awssdk.core.auth.AwsSessionCredentials
import software.amazon.awssdk.core.client.builder.ClientHttpConfiguration
import software.amazon.awssdk.core.client.builder.SyncClientBuilder
import software.amazon.awssdk.core.regions.Region
import software.amazon.awssdk.http.apache.ApacheSdkHttpClientFactory
import software.amazon.awssdk.services.s3.S3ClientBuilder
import software.aws.toolkits.jetbrains.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegion.Companion.GLOBAL
import software.aws.toolkits.jetbrains.credentials.AwsCredentialsProfileProvider
import java.util.concurrent.ConcurrentHashMap
import kotlin.reflect.KClass

class AwsClientManager(private val project: Project) {

    private data class AwsClientKey(val profileName: String, val region: AwsRegion, val serviceClass: KClass<*>)

    private val settings = AwsSettingsProvider.getInstance(project)

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

        //TODO: We probably want to evict least recently used clients from this cache (and/or share the HTTP client so we do don't get a bunch of connection pools hanging around)
        @Suppress("UNCHECKED_CAST")
        return cachedClients.computeIfAbsent(key, { createNewClient(it) }) as T
    }

    inline fun <reified T : SdkClient> getClient(): T = this.getClient(T::class)

    @Suppress("NO_REFLECTION_IN_CLASS_PATH", "UNCHECKED_CAST")
    private fun <T : SdkClient> createNewClient(key: AwsClientKey): T {
        if (key.region != GLOBAL && GLOBAL_SERVICES.contains(key.serviceClass.simpleName)) {
            return cachedClients.computeIfAbsent(key.copy(region = GLOBAL), { createNewClient(it) }) as T
        }

        val builder = key.serviceClass.members.find { it.name == "builder" }?.call() as SyncClientBuilder<*, *>

        return builder
            .credentialsProvider(getCredentialsProvider(settings.currentProfile!!.name).toV2())
            .region(Region.of(key.region.id))
            .run {
                if (this is S3ClientBuilder) {
                    this.advancedConfiguration { it.pathStyleAccessEnabled(true) }
                }
                this
            }
            .httpConfiguration(ClientHttpConfiguration.builder().httpClientFactory(ApacheSdkHttpClientFactory.builder().build()).build()) //TODO: might want to share the ApacheClient
            .build() as T
    }

    private fun getCredentialsProvider(profileName: String): AWSCredentialsProvider {
        //TODO If we cannot find the profile name, we should report internal error
        return AwsCredentialsProfileProvider.getInstance(project).lookupProfileByName(profileName)!!.awsCredentials
    }

    private fun AWSCredentialsProvider.toV2() =
        AwsCredentialsProvider {
            val cred = this@toV2.credentials
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