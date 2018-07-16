package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.awscore.client.builder.AwsDefaultClientBuilder
import software.amazon.awssdk.core.SdkClient
import software.amazon.awssdk.core.client.builder.ClientHttpConfiguration
import software.amazon.awssdk.http.apache.ApacheSdkHttpClientFactory
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3ClientBuilder
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegion.Companion.GLOBAL
import java.lang.reflect.Modifier
import java.util.concurrent.ConcurrentHashMap
import javax.security.auth.login.CredentialNotFoundException
import kotlin.reflect.KClass

class AwsClientManager internal constructor(
    project: Project
) : Disposable {
    init {
        Disposer.register(project, this)
    }

    private val accountSettingsManager = ProjectAccountSettingsManager.getInstance(project)

    private data class AwsClientKey(val profileName: String, val region: AwsRegion, val serviceClass: KClass<out SdkClient>)

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
                profileName = accountSettingsManager.activeCredentialProvider.id,
                region = accountSettingsManager.activeRegion,
                serviceClass = clz
        )

        @Suppress("UNCHECKED_CAST")
        return cachedClients.computeIfAbsent(key) { createNewClient(it) } as T
    }

    inline fun <reified T : SdkClient> getClient(): T = this.getClient(T::class)

    override fun dispose() {
        cachedClients.values.mapNotNull { it as? AutoCloseable }.forEach { it.close() }
        httpClient.close()
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T : SdkClient> createNewClient(key: AwsClientKey): T {
        if (key.region != GLOBAL && GLOBAL_SERVICES.contains(key.serviceClass.simpleName)) {
            return cachedClients.computeIfAbsent(key.copy(region = GLOBAL)) { createNewClient(it) } as T
        }

        val builderMethod = key.serviceClass.java.methods.find { it.name == "builder" && Modifier.isStatic(it.modifiers) && Modifier.isPublic(it.modifiers) }
                ?: throw IllegalArgumentException("Expected service interface to have a public static `builder()` method.")
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

    private fun getCredentialsProvider(): AwsCredentialsProvider {
        try {
            return accountSettingsManager.activeCredentialProvider
        } catch (e: CredentialNotFoundException) {
            // TODO: Notify user

            // Throw canceled exception to stop any task relying on this call
            throw ProcessCanceledException(e)
        }
    }
}