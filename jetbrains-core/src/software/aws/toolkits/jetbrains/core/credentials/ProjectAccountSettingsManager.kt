package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project
import com.intellij.util.messages.MessageBus
import com.intellij.util.messages.Topic
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager.Companion.ACCOUNT_SETTINGS_CHANGED
import software.aws.toolkits.jetbrains.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

interface ProjectAccountSettingsManager {
    /**
     * Used to be notified about updates to the active account settings by subscribing to [ACCOUNT_SETTINGS_CHANGED]
     */
    interface AccountSettingsChangedNotifier {
        fun activeCredentialsChanged(credentialsProvider: ToolkitCredentialsProvider) {}
        fun activeRegionChanged(value: AwsRegion) {}
    }

    var activeRegion: AwsRegion
    var activeCredentialProvider: ToolkitCredentialsProvider
        @Throws(CredentialProviderNotFound::class) get

    fun hasActiveCredentials(): Boolean {
        return try {
            activeCredentialProvider
            true
        } catch (_: CredentialProviderNotFound) {
            false
        }
    }

    /**
     * Returns the list of all valid [ToolkitCredentialsProvider]
     */
    fun credentialProviders(): List<ToolkitCredentialsProvider>

    companion object {
        /***
         * [MessageBus] topic for when the active credential profile or region is changed
         */
        val ACCOUNT_SETTINGS_CHANGED: Topic<ProjectAccountSettingsManager.AccountSettingsChangedNotifier> =
            Topic.create(
                "AWS Account setting changed",
                ProjectAccountSettingsManager.AccountSettingsChangedNotifier::class.java
            )

        fun getInstance(project: Project): ProjectAccountSettingsManager =
            ServiceManager.getService(project, ProjectAccountSettingsManager::class.java)
    }
}

data class AccountState(
    var activeProfile: String? = null,
    var activeRegion: String = AwsRegionProvider.getInstance().defaultRegion.id
)

@State(name = "accountSettings", storages = [Storage("aws.xml")])
class DefaultProjectAccountSettingsManager internal constructor(private val project: Project) :
    ProjectAccountSettingsManager, PersistentStateComponent<AccountState> {

    private val applicationCredentialManager = ApplicationCredentialManager.getInstance()
    private val regionProvider = AwsRegionProvider.getInstance()
    private var state = AccountState()

    override var activeRegion: AwsRegion
        get() = regionProvider.lookupRegionById(state.activeRegion)
        set(value) {
            state.activeRegion = value.id
            project.messageBus.syncPublisher(ACCOUNT_SETTINGS_CHANGED).activeRegionChanged(value)
        }

    override var activeCredentialProvider: ToolkitCredentialsProvider
        @Throws(CredentialProviderNotFound::class)
        get() {
            return state.activeProfile?.let {
                return applicationCredentialManager.getCredentialProvider(it)
            } ?: throw CredentialProviderNotFound("No active credential provider configured")
        }
        set(value) {
            state.activeProfile = value.id
            project.messageBus.syncPublisher(ACCOUNT_SETTINGS_CHANGED).activeCredentialsChanged(value)
        }

    override fun getState() = state

    override fun loadState(state: AccountState) {
        this.state = state
    }

    /**
     * Returns the list of all valid [ToolkitCredentialsProvider]
     */
    override fun credentialProviders(): List<ToolkitCredentialsProvider> {
        return applicationCredentialManager.getCredentialProviders()
    }
}