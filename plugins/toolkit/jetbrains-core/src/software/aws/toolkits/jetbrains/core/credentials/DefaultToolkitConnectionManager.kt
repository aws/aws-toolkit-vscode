// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.ide.ActivityTracker
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.credentials.pinning.ConnectionPinningManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.FeatureWithPinnedConnection
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener

// TODO: unify with AwsConnectionManager
@State(name = "connectionManager", storages = [Storage("aws.xml")])
class DefaultToolkitConnectionManager : ToolkitConnectionManager, PersistentStateComponent<ToolkitConnectionManagerState> {
    init {
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            BearerTokenProviderListener.TOPIC,
            object : BearerTokenProviderListener {
                override fun invalidate(providerId: String) {
                    if (activeConnection()?.id == providerId) {
                        switchConnection(null)
                        ActivityTracker.getInstance().inc()
                    }
                }
            }
        )
    }
    private val project: Project?
    constructor(project: Project) {
        this.project = project
    }
    constructor() {
        this.project = null
    }

    private var connection: ToolkitConnection? = null

    private val pinningManager: ConnectionPinningManager = ConnectionPinningManager.getInstance()

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
        val pinnedConnection = pinningManager.getPinnedConnection(feature)
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
            val idSegments = it.split(";")
            val activeConnectionIdWithRegion =
                if (idSegments.size == 2) {
                    "${idSegments[0]};us-east-1;${idSegments[1]}"
                } else {
                    it
                }
            connection = ToolkitAuthManager.getInstance().getConnection(activeConnectionIdWithRegion)
        }
    }

    @Synchronized
    override fun switchConnection(newConnection: ToolkitConnection?) {
        val oldConnection = this.connection

        if (oldConnection != newConnection) {
            val application = ApplicationManager.getApplication()
            this.connection = newConnection

            if (newConnection != null) {
                val featuresToPin = mutableListOf<FeatureWithPinnedConnection>()
                FeatureWithPinnedConnection.EP_NAME.forEachExtensionSafe {
                    if (!pinningManager.isFeaturePinned(it) &&
                        (
                            (
                                oldConnection == null && it.supportsConnectionType(newConnection)
                                ) ||
                                (
                                    oldConnection != null && it.supportsConnectionType(oldConnection) != it.supportsConnectionType(newConnection)
                                    )
                            )
                    ) {
                        featuresToPin.add(it)
                    }
                }

                if (featuresToPin.isNotEmpty()) {
                    application.executeOnPooledThread {
                        pinningManager.pinFeatures(oldConnection, newConnection, featuresToPin)
                    }
                }
            }

            application.messageBus.syncPublisher(ToolkitConnectionManagerListener.TOPIC).activeConnectionChanged(newConnection)
        }
    }
}

data class ToolkitConnectionManagerState(
    var activeConnectionId: String? = null
)
