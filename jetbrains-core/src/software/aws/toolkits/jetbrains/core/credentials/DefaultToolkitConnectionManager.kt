// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project

// TODO: unify with AwsConnectionManager
@State(name = "connectionManager", storages = [Storage("aws.xml")])
class DefaultToolkitConnectionManager(private val project: Project) : ToolkitConnectionManager, PersistentStateComponent<ToolkitConnectionManagerState> {
    private var connection: ToolkitConnection? = null
    private val defaultConnection: ToolkitConnection?
        get() {
            if (CredentialManager.getInstance().getCredentialIdentifiers().isNotEmpty()) {
                return AwsConnectionManagerConnection(project)
            }

            return null
        }

    override fun activeConnection() = connection ?: defaultConnection

    override fun getState() = ToolkitConnectionManagerState(
        connection?.id
    )

    override fun loadState(state: ToolkitConnectionManagerState) {
        state.activeConnectionId?.let {
            connection = ToolkitAuthManager.getInstance().getConnection(it)
        }
    }

    override fun switchConnection(connection: ToolkitConnection) {
        if (this.connection != connection) {
            this.connection = connection
            project.messageBus.syncPublisher(ToolkitConnectionManagerListener.TOPIC).activeConnectionChanged(connection)
        }
    }
}

data class ToolkitConnectionManagerState(
    var activeConnectionId: String? = null
)
