package software.aws.toolkits.core.region

/**
 * An SPI to provide regions supported by this toolkit
 */
interface ToolkitRegionProvider {
    /**
     * Returns a map of region ID([AwsRegion.id]) to [AwsRegion]
     */
    fun regions(): Map<String, AwsRegion>
    fun defaultRegion(): AwsRegion

    fun lookupRegionById(regionId: String): AwsRegion {
        return regions()[regionId] ?: defaultRegion()
    }

    fun isServiceSupported(region: AwsRegion, serviceName: String): Boolean
}