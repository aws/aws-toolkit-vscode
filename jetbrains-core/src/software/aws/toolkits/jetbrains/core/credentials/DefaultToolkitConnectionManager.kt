// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.credentials.pinning.ConnectionPinningManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.FeatureWithPinnedConnection

// TODO: unify with AwsConnectionManager
@State(name = "connectionManager", storages = [Storage("aws.xml")])
class DefaultToolkitConnectionManager : ToolkitConnectionManager, PersistentStateComponent<ToolkitConnectionManagerState> {
    private val project: Project?
    constructor(project: Project) {
        this.project = project
    }
    constructor() {
        this.project = null
    }

    private var connection: ToolkitConnection? = null
    private val pinningManager: ConnectionPinningManager?
        get() = project?.let { ConnectionPinningManager.getInstance(it) }

    private val defaultConnection: ToolkitConnection?
        get() {
            if (CredentialManager.getInstance().getCredentialIdentifiers().isNotEmpty() && project != null) {
                return AwsConnectionManagerConnection(project)
            }

            ToolkitAuthManager.getInstance().listConnections().firstOrNull()?.let {
                return it
            }

            return null
        }

    @Synchronized
    override fun activeConnection() = connection ?: defaultConnection

    @Synchronized
    override fun activeConnectionForFeature(feature: FeatureWithPinnedConnection): ToolkitConnection? {
        val pinnedConnection = pinningManager?.getPinnedConnection(feature)
        if (pinnedConnection != null) {
            return pinnedConnection
        }

        return connection?.let {
            if (feature.supportsConnectionType(it)) {
                return it
            }

            null
        } ?: defaultConnection?.let {
            if (feature.supportsConnectionType(it)) {
                return it
            }

            null
        }
    }

    override fun getState() = ToolkitConnectionManagerState(
        connection?.id
    )

    override fun loadState(state: ToolkitConnectionManagerState) {
        state.activeConnectionId?.let {
            connection = ToolkitAuthManager.getInstance().getConnection(it)
        }
    }

    @Synchronized
    override fun switchConnection(connection: ToolkitConnection?) {
        val oldConnection = this.connection
        val newConnection = connection

        if (oldConnection != newConnection) {
            this.connection = newConnection

            val pinningManager = pinningManager
            if (oldConnection != null && newConnection != null && pinningManager != null) {
                val featuresToPin = mutableListOf<FeatureWithPinnedConnection>()
                FeatureWithPinnedConnection.EP_NAME.forEachExtensionSafe {
                    if (!pinningManager.isFeaturePinned(it) && it.supportsConnectionType(oldConnection) && !it.supportsConnectionType(newConnection)) {
                        featuresToPin.add(it)
                    }
                }

                if (featuresToPin.isNotEmpty()) {
                    pinningManager.maybePinFeatures(oldConnection, newConnection, featuresToPin)
                }
            }

            ApplicationManager.getApplication().messageBus.syncPublisher(ToolkitConnectionManagerListener.TOPIC).activeConnectionChanged(connection)
        }
    }
}

data class ToolkitConnectionManagerState(
    var activeConnectionId: String? = null
)
