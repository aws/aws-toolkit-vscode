package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import software.amazon.awssdk.http.apache.ApacheSdkHttpClientFactory
import software.aws.toolkits.core.ToolkitClientManager
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import javax.security.auth.login.CredentialNotFoundException

class AwsClientManager internal constructor(
    project: Project
) : ToolkitClientManager(), Disposable {
    private val accountSettingsManager = ProjectAccountSettingsManager.getInstance(project)

    init {
        Disposer.register(project, this)
    }

    override fun dispose() {
        shutdown()
    }

    override fun getCredentialsProvider(): ToolkitCredentialsProvider {
        try {
            return accountSettingsManager.activeCredentialProvider
        } catch (e: CredentialNotFoundException) {
            // TODO: Notify user

            // Throw canceled exception to stop any task relying on this call
            throw ProcessCanceledException(e)
        }
    }

    override fun getRegion(): AwsRegion {
        return accountSettingsManager.activeRegion
    }

    companion object {
        @JvmStatic
        fun getInstance(project: Project): AwsClientManager {
            return ServiceManager.getService(project, AwsClientManager::class.java)
        }
    }
}