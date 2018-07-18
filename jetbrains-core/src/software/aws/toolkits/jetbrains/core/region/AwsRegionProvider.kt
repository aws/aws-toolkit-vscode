package software.aws.toolkits.jetbrains.core.region

import com.google.common.collect.ImmutableMap
import com.intellij.openapi.components.ServiceManager
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.PartitionLoader
import software.aws.toolkits.core.region.ToolkitRegionProvider

// TODO we might need to consider supporting unlaunched regions for internal use
class AwsRegionProvider private constructor() : ToolkitRegionProvider {
    private val regions: Map<String, AwsRegion>

    init {
        val partitions = PartitionLoader.parse()

        val mutableRegionMap = mutableMapOf<String, AwsRegion>()
        partitions?.partitions?.forEach {
            it.regions?.forEach { key, region -> mutableRegionMap.put(key, AwsRegion(key, region.description)) }
        }

        regions = ImmutableMap.copyOf(mutableRegionMap)
    }

    override fun regions() = regions

    override fun defaultRegion() = regions[DEFAULT_REGION]!!

    companion object {
        private const val DEFAULT_REGION = "us-east-1"

        @JvmStatic
        fun getInstance(): AwsRegionProvider {
            return ServiceManager.getService(AwsRegionProvider::class.java)
        }
    }
}