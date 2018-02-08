package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.credentials.AwsCredentialsProfileProvider
import software.aws.toolkits.jetbrains.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.core.credentials.CredentialProfile
import java.lang.ref.WeakReference

@State(name = "settings", storages = [(Storage("aws.xml"))])
class AwsSettingsProvider(private val project: Project) : PersistentStateComponent<AwsSettingsProvider.SettingsState> {

    private val credentialsProfileProvider = AwsCredentialsProfileProvider.getInstance(project)
    private val listeners = mutableListOf<WeakReference<SettingsChangedListener>>()

    data class SettingsState(
        var currentProfile: String = AwsCredentialsProfileProvider.DEFAULT_PROFILE,
        var currentRegion: String = AwsRegionProvider.DEFAULT_REGION
    )

    private var settingsState: SettingsState = SettingsState()

    var currentProfile: CredentialProfile?
        get() {
            return credentialsProfileProvider.lookupProfileByName(settingsState.currentProfile)
                    ?: credentialsProfileProvider.lookupProfileByName(AwsCredentialsProfileProvider.DEFAULT_PROFILE)
                    ?: if (credentialsProfileProvider.getProfiles().isEmpty()) null else credentialsProfileProvider.getProfiles()[0]
        }
        set(value) {
            val newVal = value?.name ?: AwsCredentialsProfileProvider.DEFAULT_PROFILE
            if (settingsState.currentProfile != newVal) {
                settingsState.currentProfile = newVal
                notifyListeners { it.profileChanged() }
            }
        }

    var currentRegion: AwsRegion
        get() = AwsRegionProvider.getInstance(project).lookupRegionById(settingsState.currentRegion)
        set(value) {
            if (settingsState.currentRegion != value.id) {
                settingsState.currentRegion = value.id
                notifyListeners { it.regionChanged() }
            }
        }

    override fun loadState(settingsState: SettingsState) {
        this.settingsState.currentRegion = settingsState.currentRegion
        this.settingsState.currentProfile = settingsState.currentProfile
    }

    override fun getState(): SettingsState = settingsState

    fun addListener(listener: SettingsChangedListener): AwsSettingsProvider {
        listeners.add(WeakReference(listener))
        return this
    }

    private fun notifyListeners(action: (SettingsChangedListener) -> Unit) {
        listeners.forEach { it.get()?.run(action) }
    }

    companion object {
        @JvmStatic
        fun getInstance(project: Project): AwsSettingsProvider {
            return ServiceManager.getService(project, AwsSettingsProvider::class.java)
        }
    }
}

interface SettingsChangedListener {
    fun regionChanged() {}
    fun profileChanged() {}
}