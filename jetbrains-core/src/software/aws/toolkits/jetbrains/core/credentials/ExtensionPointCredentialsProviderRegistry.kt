package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.extensions.ExtensionPointName
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderFactory
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderRegistry

class ExtensionPointCredentialsProviderRegistry : ToolkitCredentialsProviderRegistry {
    override fun listFactories(): Collection<ToolkitCredentialsProviderFactory> {
        return EXTENSION_POINT.extensions.toSet()
    }

    companion object {
        private const val EP_NAME = "aws.toolkit.credentialProviderFactory"
        private val EXTENSION_POINT = ExtensionPointName.create<ToolkitCredentialsProviderFactory>(EP_NAME)
    }
}