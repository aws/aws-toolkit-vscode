package software.aws.toolkits.core.credentials

import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider
import software.aws.toolkits.core.credentials.EnvironmentVariableToolkitCredentialsProviderFactory.Companion.TYPE

class EnvironmentVariableToolkitCredentialsProvider : ToolkitCredentialsProvider {
    private val awsCredentialsProvider = EnvironmentVariableCredentialsProvider.create()

    /**
     * Uses the factory ID as the ID for the provider as there is only one instance for Environment Variable Credentials Provider
     */
    override val id: String
        get() = TYPE
    override val displayName: String
        get() = DISPLAY_NAME

    override fun getCredentials(): AwsCredentials = awsCredentialsProvider.credentials

    companion object {
        const val DISPLAY_NAME = "Environment Variables"
    }
}

class EnvironmentVariableToolkitCredentialsProviderFactory : ToolkitCredentialsProviderFactory(TYPE) {
    init {
        val credentialsProvider = EnvironmentVariableToolkitCredentialsProvider()
        try {
            credentialsProvider.credentials
            add(credentialsProvider)
        } catch (_: Exception) {
            // We can't create creds from env vars, so dont add it
        }
    }

    companion object {
        const val TYPE = "envVars"
    }
}