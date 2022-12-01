// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.util.Disposer
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info

// TODO: unify with CredentialManager
@State(name = "authManager", storages = [Storage("aws.xml")])
class DefaultToolkitAuthManager : ToolkitAuthManager, PersistentStateComponent<ToolkitAuthManagerState>, Disposable {
    private var state = ToolkitAuthManagerState()
    private val connections = mutableListOf<ToolkitConnection>()
    private val transientConnections = let {
        val factoryConnections = mutableListOf<ToolkitConnection>()
        ToolkitStartupAuthFactory.EP_NAME.forEachExtensionSafe { factory ->
            factoryConnections.addAll(
                factory.buildConnections().also { connections ->
                    LOG.info { "Found transient connections from $factory: ${connections.map { it.toString() }}" }
                }
            )
        }

        factoryConnections.toList()
    }

    override fun listConnections(): List<ToolkitConnection> = connections.toList() + transientConnections

    override fun createConnection(profile: AuthProfile): ToolkitConnection {
        val connection = connectionFromProfile(profile)
        connections.add(connection)

        return connection
    }

    private fun deleteConnection(predicate: (ToolkitConnection) -> Boolean) {
        connections.removeAll { connection ->
            predicate(connection).also {
                if (it && connection is Disposable) {
                    Disposer.dispose(connection)
                }
            }
        }
    }

    override fun deleteConnection(connection: ToolkitConnection) {
        deleteConnection { it == connection }
    }

    override fun deleteConnection(connectionId: String) {
        deleteConnection { it.id == connectionId }
    }

    override fun getConnection(connectionId: String) = listConnections().firstOrNull { it.id == connectionId }

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

    override fun dispose() {
        listConnections().forEach {
            if (it is Disposable) {
                Disposer.dispose(it)
            }
        }
    }

    private fun connectionFromProfile(profile: AuthProfile): ToolkitConnection = when (profile) {
        is ManagedSsoProfile -> {
            ManagedBearerSsoConnection(
                startUrl = profile.startUrl,
                region = profile.ssoRegion,
                scopes = profile.scopes
            )
        }

        is DiskSsoSessionProfile -> DiskSsoSessionConnection(sessionProfileName = profile.profileName, region = profile.ssoRegion)
    }

    companion object {
        private val LOG = getLogger<DefaultToolkitAuthManager>()
    }
}

data class ToolkitAuthManagerState(
    // TODO: can't figure out how to make deserializer work with polymorphic types
    var ssoProfiles: List<ManagedSsoProfile> = emptyList()
)
