package software.aws.toolkits.jetbrains.core

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.services.codecommit.AWSCodeCommit
import com.amazonaws.services.codecommit.AWSCodeCommitClientBuilder
import com.amazonaws.services.lambda.AWSLambda
import com.amazonaws.services.lambda.AWSLambdaClientBuilder
import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.region.AwsRegion
import software.aws.toolkits.jetbrains.credentials.AwsCredentialsProfileProvider
import java.util.concurrent.ConcurrentHashMap
import kotlin.reflect.KClass

class AwsClientManager(private val project: Project) {

    private data class AwsClientKey(val profileName: String, val region: AwsRegion, val serviceClass: KClass<*>)

    private val settings = AwsSettingsProvider.getInstance(project)

    companion object {
        private val serviceClientBuilder = mapOf(
                AmazonS3::class to AmazonS3ClientBuilder.standard(),
                AWSLambda::class to AWSLambdaClientBuilder.standard(),
                AWSCodeCommit::class to AWSCodeCommitClientBuilder.standard()
                //TODO more clients go here
        )

        @JvmStatic
        fun getInstance(project: Project): AwsClientManager {
            return ServiceManager.getService(project, AwsClientManager::class.java)
        }
    }

    private val cachedClients = ConcurrentHashMap<AwsClientKey, Any>()

    fun <T : Any> getClient(clz: KClass<T>): T {
        val key = AwsClientKey(profileName = settings.currentProfile!!.name, region = settings.currentRegion, serviceClass = clz)

        //TODO: We probably want to evict least recently used clients from this cache (and/or share the HTTP client so we do don't get a bunch of connection pools hanging around)
        @Suppress("UNCHECKED_CAST")
        return cachedClients.computeIfAbsent(key, { createNewClient(it) }) as T
    }

    inline fun <reified T: Any> getClient(): T = this.getClient(T::class)

    private fun <T : Any> createNewClient(key: AwsClientKey): T {
        @Suppress("UNCHECKED_CAST")
        return serviceClientBuilder.getValue(key.serviceClass).apply {
            this.credentials = getCredentialsProvider(key.profileName)
            this.region = key.region.id
        }.build() as T
    }

    private fun getCredentialsProvider(profileName: String): AWSCredentialsProvider {
        //TODO If we cannot find the profile name, we should report internal error
        return AwsCredentialsProfileProvider.getInstance(project).lookupProfileByName(profileName)!!.awsCredentials
    }
}