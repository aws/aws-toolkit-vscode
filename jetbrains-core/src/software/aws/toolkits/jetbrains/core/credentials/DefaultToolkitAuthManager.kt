// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger

// TODO: unify with CredentialManager
@State(name = "authManager", storages = [Storage("aws.xml")])
class DefaultToolkitAuthManager : ToolkitAuthManager, PersistentStateComponent<ToolkitAuthManagerState> {
    private var state = ToolkitAuthManagerState()
    private val connections = mutableListOf<ToolkitConnection>()

    override fun listConnections(): List<ToolkitConnection> = connections.toList()

    override fun createConnection(profile: AuthProfile): ToolkitConnection {
        val connection = connectionFromProfile(profile)
        connections.add(connection)

        return connection
    }

    override fun deleteConnection(connection: ToolkitConnection) {
        connections.removeAll { it == connection }
    }

    override fun deleteConnection(connectionId: String) {
        connections.removeAll { it.id == connectionId }
    }

    override fun getConnection(connectionId: String) = connections.firstOrNull { it.id == connectionId }

    override fun getState(): ToolkitAuthManagerState? {
        val data = connections.mapNotNull {
            when (it) {
                is ManagedBearerSsoConnection -> {
                    ManagedSsoProfile(
                        startUrl = it.startUrl,
                        ssoRegion = it.region,
                        scopes = it.scopes
                    )
                }

                else -> {
                    LOG.error { "Couldn't serialize $it" }
                    null
                }
            }
        }

        state.ssoProfiles = data

        return state
    }

    override fun loadState(state: ToolkitAuthManagerState) {
        this.state = state
        val newConnections = state.ssoProfiles.filterNotNull().map {
            connectionFromProfile(it)
        }

        connections.clear()
        connections.addAll(newConnections)
    }

    private fun connectionFromProfile(profile: AuthProfile) = when (profile) {
        is ManagedSsoProfile -> {
            ManagedBearerSsoConnection(
                startUrl = profile.startUrl,
                region = profile.ssoRegion,
                scopes = profile.scopes
            )
        }
    }

    companion object {
        private val LOG = getLogger<DefaultToolkitAuthManager>()
    }
}

data class ToolkitAuthManagerState(
    // TODO: can't figure out how to make deserializer work with polymorphic types
    var ssoProfiles: List<ManagedSsoProfile> = emptyList()
)
