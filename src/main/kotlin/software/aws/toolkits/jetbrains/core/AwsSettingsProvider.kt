package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.credentials.AwsCredentialsProfileProvider
import software.aws.toolkits.jetbrains.credentials.CredentialProfile

@State(name = "settings", storages = arrayOf(Storage("aws.xml")))
class AwsSettingsProvider(private val project: Project):
        PersistentStateComponent<AwsSettingsProvider.SettingsState> {

    private val credentialsProfileProvider: AwsCredentialsProfileProvider = AwsCredentialsProfileProvider.getInstance(project)

    data class SettingsState(
            var currentProfile: String = AwsCredentialsProfileProvider.DEFAULT_PROFILE,
            var currentRegion: String = AwsRegionProvider.DEFAULT_REGION
    )
    private var settingsState: SettingsState = SettingsState()

    var currentProfile: CredentialProfile?
        get() {
            return credentialsProfileProvider.lookupProfileByName(settingsState.currentProfile) ?:
                    credentialsProfileProvider.lookupProfileByName(AwsCredentialsProfileProvider.DEFAULT_PROFILE) ?:
                    if (credentialsProfileProvider.getProfiles().isEmpty()) null else credentialsProfileProvider.getProfiles()[0]
        }
        set(value) {settingsState.currentProfile = value?.name ?: AwsCredentialsProfileProvider.DEFAULT_PROFILE}

    var currentRegion: AwsRegion
        get() = AwsRegionProvider.getInstance(project).lookupRegionById(settingsState.currentRegion)
        set(value) { settingsState.currentRegion = value.id }

    override fun loadState(settingsState: SettingsState) {
        this.settingsState.currentRegion = settingsState.currentRegion
        this.settingsState.currentProfile = settingsState.currentProfile
    }

    override fun getState(): SettingsState {
        return settingsState
    }

    companion object {
        @JvmStatic
        fun getInstance(project: Project): AwsSettingsProvider {
            return ServiceManager.getService(project, AwsSettingsProvider::class.java)
        }
    }
}