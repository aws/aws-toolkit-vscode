package software.aws.toolkits.jetbrains.core.credentials

import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

class MockProjectAccountSettingsManager : ProjectAccountSettingsManager {
    override var activeRegion = AwsRegionProvider.getInstance().defaultRegion()

    override var activeCredentialProvider = object : ToolkitCredentialsProvider() {
        override val id = "MockCredentials"
        override val displayName = " Mock Credentials"

        override fun getCredentials(): AwsCredentials = AwsCredentials.create("Foo", "Bar")
    }

    override fun recentlyUsedRegions(): List<AwsRegion> {
        TODO("not implemented")
    }

    override fun recentlyUsedCredentials(): List<ToolkitCredentialsProvider> {
        TODO("not implemented")
    }
}