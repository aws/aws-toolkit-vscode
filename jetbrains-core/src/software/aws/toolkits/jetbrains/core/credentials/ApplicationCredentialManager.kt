package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.util.Disposer
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderManager

class ApplicationCredentialManager : Disposable {
    private val toolkitCredentialManager = ToolkitCredentialsProviderManager(ExtensionPointCredentialsProviderRegistry())

    init {
        Disposer.register(ApplicationManager.getApplication(), this)
    }

    @Throws(CredentialProviderNotFound::class)
    internal fun getCredentialProvider(providerId: String): ToolkitCredentialsProvider {
        return toolkitCredentialManager.getCredentialProvider(providerId)
    }

    internal fun getCredentialProviders(): List<ToolkitCredentialsProvider> {
        return toolkitCredentialManager.getCredentialProviders()
    }

    override fun dispose() {
        toolkitCredentialManager.shutDown()
    }

    companion object {
        fun getInstance(): ApplicationCredentialManager = ServiceManager.getService(ApplicationCredentialManager::class.java)
    }
}