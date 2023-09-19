// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.pinning

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.extensions.ExtensionPointName
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import java.util.concurrent.ConcurrentHashMap

interface FeatureWithPinnedConnection {
    val featureId: String
    val featureName: String

    fun supportsConnectionType(connection: ToolkitConnection): Boolean

    companion object {
        val EP_NAME = ExtensionPointName<FeatureWithPinnedConnection>("aws.toolkit.connection.pinned.feature")
    }
}

interface ConnectionPinningManager {
    fun isFeaturePinned(feature: FeatureWithPinnedConnection): Boolean
    fun getPinnedConnection(feature: FeatureWithPinnedConnection): ToolkitConnection?
    fun setPinnedConnection(feature: FeatureWithPinnedConnection, newConnection: ToolkitConnection?)

    fun pinFeatures(oldConnection: ToolkitConnection?, newConnection: ToolkitConnection, features: List<FeatureWithPinnedConnection>)

    companion object {
        fun getInstance(): ConnectionPinningManager = service()
    }
}

@State(name = "connectionPinningManager", storages = [Storage("aws.xml")])
class DefaultConnectionPinningManager :
    ConnectionPinningManager,
    PersistentStateComponent<ConnectionPinningManagerState>,
    Disposable {

    private val pinnedConnections = ConcurrentHashMap<String, ToolkitConnection>()

    init {
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            BearerTokenProviderListener.TOPIC,
            object : BearerTokenProviderListener {
                override fun invalidate(providerId: String) {
                    pinnedConnections.entries.removeIf { (_, v) -> v.id == providerId }
                }
            }
        )
    }

    override fun isFeaturePinned(feature: FeatureWithPinnedConnection) = getPinnedConnection(feature) != null

    override fun getPinnedConnection(feature: FeatureWithPinnedConnection): ToolkitConnection? =
        pinnedConnections[feature.featureId].let { connection ->
            if (connection == null || ToolkitAuthManager.getInstance().getConnection(connection.id) == null) {
                null
            } else {
                connection
            }
        }

    override fun setPinnedConnection(feature: FeatureWithPinnedConnection, newConnection: ToolkitConnection?) {
        if (newConnection == null) {
            pinnedConnections.remove(feature.featureId)
        } else {
            pinnedConnections[feature.featureId] = newConnection
        }

        ApplicationManager.getApplication().messageBus.syncPublisher(ConnectionPinningManagerListener.TOPIC).pinnedConnectionChanged(feature, newConnection)
    }

    override fun pinFeatures(oldConnection: ToolkitConnection?, newConnection: ToolkitConnection, features: List<FeatureWithPinnedConnection>) {
        val featuresString = if (features.size == 1) {
            features.first().featureName
        } else {
            "${features.dropLast(1).joinToString(",") { it.featureName }} and ${features.last().featureName}"
        }

        val connectionToPin = if (oldConnection is AwsBearerTokenConnection) oldConnection else newConnection
        features.forEach {
            setPinnedConnection(it, connectionToPin)
        }
        notifyInfo(message("credentials.switch.notification.title", featuresString, connectionToPin.label))
    }

    override fun getState() = ConnectionPinningManagerState(
        pinnedConnections.entries.associate { (k, v) -> k to v.id }
    )

    override fun loadState(state: ConnectionPinningManagerState) {
        val authManager = ToolkitAuthManager.getInstance()

        pinnedConnections.clear()
        pinnedConnections.putAll(
            state.pinnedConnections.entries.mapNotNull { (k, v) ->
                authManager.getConnection(v)?.let { k to it }
            }
        )
    }

    override fun dispose() {}
}

data class ConnectionPinningManagerState(
    var pinnedConnections: Map<String, String> = emptyMap()
)
