// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.pinning

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.extensions.ExtensionPointName
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import java.util.concurrent.ConcurrentHashMap

typealias ConnectionPinningManager = migration.software.aws.toolkits.jetbrains.core.credentials.pinning.ConnectionPinningManager

interface FeatureWithPinnedConnection {
    val featureId: String
    val featureName: String

    fun supportsConnectionType(connection: ToolkitConnection): Boolean

    companion object {
        val EP_NAME = ExtensionPointName<FeatureWithPinnedConnection>("aws.toolkit.core.connection.pinned.feature")
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
            if (connection == null) {
                null
            } else {
                // fetch connection again in case it is no longer valid
                val connectionInstance = ToolkitAuthManager.getInstance().getConnection(connection.id)
                if (connectionInstance == null || !feature.supportsConnectionType(connectionInstance)) {
                    null
                } else {
                    connection
                }
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
        // pin to newConnection if the feature is supported, otherwise stay with old connection
        val newConnectionFeatures = mutableListOf<FeatureWithPinnedConnection>()
        val oldConnectionFeatures = mutableListOf<FeatureWithPinnedConnection>()
        features.forEach {
            if (it.supportsConnectionType(newConnection)) {
                newConnectionFeatures.add(it)
            } else if (oldConnection != null && it.supportsConnectionType(oldConnection)) {
                oldConnectionFeatures.add(it)
            } else {
                LOG.error { "Feature '$it' does not support either old: '$oldConnection' or new: '$newConnection'" }
            }
        }

        val pinConnections = { featuresToPin: List<FeatureWithPinnedConnection>, connectionToPin: ToolkitConnection ->
            featuresToPin.forEach {
                setPinnedConnection(it, connectionToPin)
            }

            // TODO: don't know if we still want to keep this for CodeCatalyst
//            notifyInfo(message("credentials.switch.notification.title", featuresString, connectionToPin.label))
        }

        if (newConnectionFeatures.isNotEmpty()) {
            pinConnections(newConnectionFeatures, newConnection)
        }

        if (oldConnectionFeatures.isNotEmpty()) {
            if (oldConnection != null) {
                pinConnections(oldConnectionFeatures, oldConnection)
            }
        }
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

    companion object {
        private val LOG = getLogger<DefaultConnectionPinningManager>()
    }
}

data class ConnectionPinningManagerState(
    var pinnedConnections: Map<String, String> = emptyMap()
)
