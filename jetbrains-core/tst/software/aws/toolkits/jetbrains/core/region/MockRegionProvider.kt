package software.aws.toolkits.jetbrains.core.region

import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.ToolkitRegionProvider

class MockRegionProvider: ToolkitRegionProvider {

    override fun defaultRegion(): AwsRegion = regions.getValue(defaultRegionKey)

    override fun regions(): Map<String, AwsRegion> = regions

    companion object {
        private val usEast = AwsRegion("us-east-1", "US East (N. Virginia)")

        var defaultRegionKey = "us-east-1"
        val regions = mutableMapOf<String, AwsRegion>("us-east-1" to usEast)
    }
}