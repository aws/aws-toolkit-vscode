package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction
import software.aws.toolkits.jetbrains.services.lambda.toDataClass
import java.util.concurrent.ConcurrentHashMap

//TODO to be replaced with an actual resource implementation
class AwsResourceCache(private val project: Project) {

    private val settings = AwsSettingsProvider.getInstance(project)
    private val cache = ConcurrentHashMap<String, Any>()

    @Suppress("UNCHECKED_CAST")
    fun lambdaFunctions(): List<LambdaFunction> = cache.computeIfAbsent("${settings.currentRegion.id}:${settings.currentProfile?.name}:lambdafunctions", {
        val client = AwsClientManager.getInstance(project).getClient<LambdaClient>()
        client.listFunctionsIterable().functions().map { it.toDataClass(client) }.toList()
    }) as List<LambdaFunction>

    companion object {
        fun getInstance(project: Project): AwsResourceCache = ServiceManager.getService(project, AwsResourceCache::class.java)
    }
}