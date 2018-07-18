package software.aws.toolkits.core.region

import software.amazon.awssdk.regions.Region

data class AwsRegion(val id: String, val name: String) {
    companion object {
        val GLOBAL = AwsRegion(Region.AWS_GLOBAL.value(), "Global")
    }
}