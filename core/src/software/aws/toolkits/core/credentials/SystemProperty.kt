package software.aws.toolkits.core.credentials

import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.SystemPropertyCredentialsProvider
import software.aws.toolkits.core.credentials.SystemPropertyToolkitCredentialsProviderFactory.Companion.TYPE
import software.aws.toolkits.resources.message

class SystemPropertyToolkitCredentialsProvider() : ToolkitCredentialsProvider() {
    private val awsCredentialsProvider = SystemPropertyCredentialsProvider.create()

    override val id = TYPE
    override val displayName get() = message("credentials.system_props.name")

    override fun resolveCredentials(): AwsCredentials = awsCredentialsProvider.resolveCredentials()
}

class SystemPropertyToolkitCredentialsProviderFactory() : ToolkitCredentialsProviderFactory(TYPE) {
    init {
        val credentialsProvider = SystemPropertyToolkitCredentialsProvider()
        try {
            credentialsProvider.resolveCredentials()
            add(credentialsProvider)
        } catch (_: Exception) {
            // We can't create creds from sys props, so dont add it
        }
    }

    companion object {
        internal const val TYPE = "sysProps"
    }
}