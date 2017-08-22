package com.amazonaws.intellij.core

import com.amazonaws.intellij.core.region.AwsRegion
import com.amazonaws.intellij.core.region.AwsRegionProvider
import com.amazonaws.intellij.credentials.AWSCredentialsProfileProvider
import com.amazonaws.intellij.credentials.CredentialProfile
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project

@State(name = "explorerSettings", storages = arrayOf(Storage("aws.xml")))
class AwsExplorerSettingsProvider(private val project: Project):
        PersistentStateComponent<AwsExplorerSettingsProvider.SettingsState> {

    private val credentialsProfileProvider: AWSCredentialsProfileProvider = AWSCredentialsProfileProvider.getInstance(project)

    data class SettingsState(
            var currentProfile: String = "default",
            var currentRegion: String = AwsRegionProvider.DEFAULT_REGION
    )
    private var settingsState: SettingsState = SettingsState()

    var currentProfile: CredentialProfile?
        get() {
            return credentialsProfileProvider.lookupProfileByName(settingsState.currentProfile) ?:
                    credentialsProfileProvider.lookupProfileByName("default") ?:
                    if (credentialsProfileProvider.getProfiles().isEmpty()) null else credentialsProfileProvider.getProfiles()[0]
        }
        set(value) {settingsState.currentProfile = value?.name ?: "default"}

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
        fun getInstance(project: Project): AwsExplorerSettingsProvider {
            return ServiceManager.getService(project, AwsExplorerSettingsProvider::class.java)
        }
    }
}