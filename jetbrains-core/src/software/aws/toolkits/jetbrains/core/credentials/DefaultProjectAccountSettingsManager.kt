// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.credentials.profiles.DEFAULT_PROFILE_ID
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

data class ConnectionSettingsState(
    var activeProfile: String? = null,
    var activeRegion: String? = null,
    var recentlyUsedProfiles: List<String> = mutableListOf(),
    var recentlyUsedRegions: List<String> = mutableListOf()
)

@State(name = "accountSettings", storages = [Storage("aws.xml")])
class DefaultProjectAccountSettingsManager(private val project: Project) : ProjectAccountSettingsManager(project),
    PersistentStateComponent<ConnectionSettingsState> {
    override fun getState(): ConnectionSettingsState = ConnectionSettingsState(
        activeProfile = selectedCredentialIdentifier?.id,
        activeRegion = selectedRegion?.id,
        recentlyUsedProfiles = recentlyUsedProfiles.elements(),
        recentlyUsedRegions = recentlyUsedRegions.elements()
    )

    override fun loadState(state: ConnectionSettingsState) {
        // This can be called more than once, so we need to re-do our init sequence
        connectionState = ConnectionState.INITIALIZING

        // Load reversed so that oldest is as the bottom
        state.recentlyUsedRegions.reversed()
            .forEach { recentlyUsedRegions.add(it) }

        state.recentlyUsedProfiles.reversed()
            .forEach { recentlyUsedProfiles.add(it) }

        // Load all the initial state on BG thread, so e don't block the UI or loading of other components
        GlobalScope.launch(Dispatchers.Default) {
            val credentialId = state.activeProfile ?: DEFAULT_PROFILE_ID
            val credentials = tryOrNull {
                CredentialManager.getInstance().getCredentialIdentifierById(credentialId)
            }

            val regionId = state.activeRegion ?: AwsRegionProvider.getInstance().defaultRegion().id
            val region = AwsRegionProvider.getInstance().allRegions()[regionId]
            val partition = region?.partitionId?.let { AwsRegionProvider.getInstance().partitions()[it] }

            changeConnectionSettings(credentials, partition, region)
        }
    }
}
