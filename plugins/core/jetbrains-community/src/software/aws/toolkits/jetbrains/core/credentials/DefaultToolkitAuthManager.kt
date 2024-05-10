// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.util.Disposer
import software.aws.toolkits.core.credentials.SsoSessionIdentifier
import software.aws.toolkits.core.credentials.ToolkitCredentialsChangeListener
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileSsoSessionIdentifier
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import java.util.Collections

typealias ToolkitAuthManager = migration.software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager

// TODO: unify with CredentialManager
@State(name = "authManager", storages = [Storage("aws.xml")])
class DefaultToolkitAuthManager : ToolkitAuthManager, PersistentStateComponent<ToolkitAuthManagerState>, Disposable {
    private var state = ToolkitAuthManagerState()
    private val connections = Collections.synchronizedSet(linkedSetOf<ToolkitConnection>())
    private val transientConnections = let {
        val factoryConnections = mutableListOf<ToolkitConnection>()
        ToolkitStartupAuthFactory.EP_NAME.forEachExtensionSafe { factory ->
            factoryConnections.addAll(
                factory.buildConnections().also { connections ->
                    LOG.info { "Found transient connections from $factory: ${connections.map { it.toString() }}" }
                }
            )
        }

        factoryConnections.toMutableSet()
    }

    init {
        // initial load then subscribe to bus for future changes
        CredentialManager.getInstance().getSsoSessionIdentifiers().forEach {
            createConnectionFromIdentifier(it)
        }

        ApplicationManager.getApplication().messageBus
            .connect(this)
            .subscribe(
                CredentialManager.CREDENTIALS_CHANGED,
                object : ToolkitCredentialsChangeListener {
                    override fun ssoSessionAdded(identifier: SsoSessionIdentifier) {
                        createConnectionFromIdentifier(identifier)
                    }

                    override fun ssoSessionModified(identifier: SsoSessionIdentifier) {
                        transientConnections.removeAll { connection ->
                            (connection.id == identifier.id).also {
                                if (it && connection is Disposable) {
                                    // don't invalidate because we kill the token we just retrieved
                                    ApplicationManager.getApplication().messageBus.syncPublisher(BearerTokenProviderListener.TOPIC)
                                        .onChange(connection.id)
                                    Disposer.dispose(connection)
                                }
                            }
                        }

                        ssoSessionAdded(identifier)
                    }

                    override fun ssoSessionRemoved(identifier: SsoSessionIdentifier) {
                        transientConnections.removeAll { connection ->
                            (connection.id == identifier.id).also {
                                if (it && connection is Disposable) {
                                    disposeAndNotify(connection)
                                }
                            }
                        }
                    }
                }
            )
    }

    override fun listConnections(): List<ToolkitConnection> = connections.toList() + transientConnections

    override fun tryCreateTransientSsoConnection(profile: AuthProfile, callback: (AwsBearerTokenConnection) -> Unit): AwsBearerTokenConnection {
        val connection = (connectionFromProfile(profile) as AwsBearerTokenConnection).also {
            callback(it)

            if (profile is ManagedSsoProfile) {
                disposeStaleConnections(it)

                connections.add(it)
            } else {
                disposeStaleConnections(it)

                transientConnections.add(it)
            }
        }

        return connection
    }

    override fun getOrCreateSsoConnection(profile: UserConfigSsoSessionProfile): AwsBearerTokenConnection {
        (transientConnections.firstOrNull { it.id == profile.id } as? AwsBearerTokenConnection)?.let {
            return it
        }

        val connection = connectionFromProfile(profile) as AwsBearerTokenConnection
        transientConnections.add(connection)

        return connection
    }

    private fun createConnectionFromIdentifier(identifier: SsoSessionIdentifier) {
        (identifier as? ProfileSsoSessionIdentifier)?.let {
            getOrCreateSsoConnection(
                UserConfigSsoSessionProfile(
                    configSessionName = it.profileName,
                    ssoRegion = it.ssoRegion,
                    startUrl = it.startUrl,
                    scopes = it.scopes.toList()
                )
            )
        }
    }

    override fun createConnection(profile: AuthProfile): ToolkitConnection {
        val connection = connectionFromProfile(profile)
        connections.firstOrNull { it.id == connection.id }?.let {
            LOG.warn { "$it already exists in connection list" }
            if (connection is Disposable) {
                Disposer.dispose(connection)
            }

            return it
        }

        connections.add(connection)
        return connection
    }

    private fun disposeStaleConnections(newConnection: AwsBearerTokenConnection) {
        connections.removeAll { existOldConn ->
            (existOldConn.id == newConnection.id).also { isDuplicate ->
                if (isDuplicate && existOldConn is Disposable) {
                    ApplicationManager.getApplication().messageBus.syncPublisher(BearerTokenProviderListener.TOPIC)
                        .onChange(existOldConn.id, newConnection.scopes)
                    Disposer.dispose(existOldConn)
                }
            }
        }

        transientConnections.removeAll { existOldConn ->
            (existOldConn.id == newConnection.id).also { isDuplicate ->
                if (isDuplicate && existOldConn is Disposable) {
                    ApplicationManager.getApplication().messageBus.syncPublisher(BearerTokenProviderListener.TOPIC)
                        .onChange(existOldConn.id, newConnection.scopes)
                    Disposer.dispose(existOldConn)
                }
            }
        }
    }

    private fun deleteConnection(predicate: (ToolkitConnection) -> Boolean) {
        val deleted = mutableListOf<ToolkitConnection>()
        connections.removeAll { connection ->
            predicate(connection).also {
                if (it) {
                    deleted.add(connection)
                }
            }
        }

        transientConnections.removeAll { connection ->
            predicate(connection).also {
                if (it) {
                    deleted.add(connection)
                }
            }
        }

        for (connection in deleted) {
            if (connection is Disposable) {
                disposeAndNotify(connection)
            }
        }
    }

    private fun<T> disposeAndNotify(connection: T) where T : ToolkitConnection, T : Disposable {
        ApplicationManager.getApplication().messageBus.syncPublisher(BearerTokenProviderListener.TOPIC)
            .invalidate(connection.id)
        Disposer.dispose(connection)
    }

    override fun deleteConnection(connection: ToolkitConnection) {
        deleteConnection { it == connection }
    }

    override fun deleteConnection(connectionId: String) {
        deleteConnection { it.id == connectionId }
    }

    override fun getConnection(connectionId: String) = listConnections().firstOrNull { it.id == connectionId }
    override fun getLastLoginIdcInfo(): LastLoginIdcInfo = state.lastLoginIdcInfo.copy()

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
        val newConnections = linkedSetOf(*state.ssoProfiles.toTypedArray()).filterNotNull().map {
            connectionFromProfile(it)
        }

        if (newConnections.size != state.ssoProfiles.size) {
            LOG.warn { "Persisted state had duplicate profiles" }
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
            if (profile.startUrl != SONO_URL) {
                state.lastLoginIdcInfo = LastLoginIdcInfo("", profile.startUrl, profile.ssoRegion)
            }
            LegacyManagedBearerSsoConnection(
                startUrl = profile.startUrl,
                region = profile.ssoRegion,
                scopes = profile.scopes
            )
        }

        is UserConfigSsoSessionProfile -> {
            if (profile.startUrl != SONO_URL) {
                state.lastLoginIdcInfo = LastLoginIdcInfo(profile.configSessionName, profile.startUrl, profile.ssoRegion)
            }
            ProfileSsoManagedBearerSsoConnection(
                startUrl = profile.startUrl,
                region = profile.ssoRegion,
                scopes = profile.scopes,
                id = profile.id,
                configSessionName = profile.configSessionName
            )
        }

        is DetectedDiskSsoSessionProfile -> {
            if (profile.startUrl != SONO_URL) {
                state.lastLoginIdcInfo = LastLoginIdcInfo(profile.profileName, profile.startUrl, profile.ssoRegion)
            }
            DetectedDiskSsoSessionConnection(
                sessionName = profile.profileName,
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
    var ssoProfiles: List<ManagedSsoProfile> = emptyList(),
    var lastLoginIdcInfo: LastLoginIdcInfo = LastLoginIdcInfo()
)

data class LastLoginIdcInfo(
    var profileName: String = "",
    var startUrl: String = "",
    var region: String = AwsRegionProvider.getInstance().defaultRegion().id
)
