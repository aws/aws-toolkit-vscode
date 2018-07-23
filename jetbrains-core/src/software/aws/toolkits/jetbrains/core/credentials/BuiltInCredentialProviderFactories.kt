package software.aws.toolkits.jetbrains.core.credentials

import software.aws.toolkits.core.credentials.EnvironmentVariableToolkitCredentialsProviderFactory
import software.aws.toolkits.core.credentials.ProfileToolkitCredentialsProviderFactory
import software.aws.toolkits.core.credentials.SystemPropertyToolkitCredentialsProviderFactory
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderFactory
import software.aws.toolkits.jetbrains.core.AwsSdkClient
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

class ProfileCredentialProviderFactory : CredentialProviderFactory {
    override fun createToolkitCredentialProviderFactory(): ToolkitCredentialsProviderFactory {
        return ProfileToolkitCredentialsProviderFactory(
            AwsSdkClient.getInstance().sdkHttpClient,
            AwsRegionProvider.getInstance()
        )
    }
}

class EnvironmentCredentialProviderFactory : CredentialProviderFactory {
    override fun createToolkitCredentialProviderFactory(): ToolkitCredentialsProviderFactory {
        return EnvironmentVariableToolkitCredentialsProviderFactory()
    }
}

class SystemPropertyCredentialProviderFactory : CredentialProviderFactory {
    override fun createToolkitCredentialProviderFactory(): ToolkitCredentialsProviderFactory {
        return SystemPropertyToolkitCredentialsProviderFactory()
    }
}