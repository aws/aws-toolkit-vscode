package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.extensions.AbstractExtensionPointBean
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.util.LazyInstance
import com.intellij.util.xmlb.annotations.Attribute
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderFactory
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderRegistry

/**
 * Extension point for adding new credential providers to the internal registry
 */
interface CredentialProviderFactory {
    /**
     * Creates the [ToolkitCredentialsProviderFactory], this is called once per application
     */
    fun createToolkitCredentialProviderFactory(): ToolkitCredentialsProviderFactory
}

class CredentialProviderFactoryEP : AbstractExtensionPointBean() {
    @Attribute("implementation")
    var implementation: String? = null

    private val instance = object : LazyInstance<CredentialProviderFactory>() {
        @Throws(ClassNotFoundException::class)
        override fun getInstanceClass(): Class<CredentialProviderFactory> {
            return findClass(implementation)
        }
    }

    fun getHandler(): CredentialProviderFactory {
        return instance.value
    }
}

class ExtensionPointCredentialsProviderRegistry : ToolkitCredentialsProviderRegistry {
    private val factories = EXTENSION_POINT.extensions
        .map { it.getHandler() }
        .map { it.createToolkitCredentialProviderFactory() }

    override fun listFactories(): Collection<ToolkitCredentialsProviderFactory> = factories

    companion object {
        private const val EP_NAME = "aws.toolkit.credentialProviderFactory"
        private val EXTENSION_POINT = ExtensionPointName.create<CredentialProviderFactoryEP>(EP_NAME)
    }
}