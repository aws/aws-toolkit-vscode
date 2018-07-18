package software.aws.toolkits.jetbrains.core.region

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.PartitionParser
import software.aws.toolkits.core.region.ServiceEndpointResource
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.jetbrains.core.RemoteResourceManager
import java.util.concurrent.Callable

class AwsRegionProvider private constructor(remoteResourceManager: RemoteResourceManager) : ToolkitRegionProvider {
    private val regions: Map<String, AwsRegion>

    init {
        val result = ApplicationManager.getApplication().executeOnPooledThread(
            Callable<Map<String, AwsRegion>> {
                val partitions = PartitionParser.parse(remoteResourceManager.resolveStream(ServiceEndpointResource))

                //TODO: handle non-standard AWS partitions based on account type
                partitions?.partitions?.find { it.partition == "aws" }?.regions?.map { (key, region) ->
                    key to AwsRegion(key, region.description)
                }?.toMap() ?: emptyMap()
            }
        )

        regions = result.get()
    }

    override fun regions() = regions

    override fun defaultRegion() = regions[DEFAULT_REGION]!!

    companion object {
        private const val DEFAULT_REGION = "us-east-1"

        @JvmStatic
        fun getInstance(): ToolkitRegionProvider {
            return ServiceManager.getService(ToolkitRegionProvider::class.java)
        }
    }
}