// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.application.AppUIExecutor
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SimpleModificationTracker
import com.intellij.util.ExceptionUtil
import com.intellij.util.messages.Topic
import org.jetbrains.concurrency.AsyncPromise
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.CredentialProviderNotFoundException
import software.aws.toolkits.core.credentials.ToolkitCredentialsChangeListener
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.services.sts.StsResources
import software.aws.toolkits.jetbrains.utils.MRUList
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AwsTelemetry
import java.util.concurrent.atomic.AtomicReference

abstract class AwsConnectionManager(private val project: Project) : SimpleModificationTracker(), Disposable {
    private val resourceCache = AwsResourceCache.getInstance()
    private val regionProvider = AwsRegionProvider.getInstance()
    private val credentialsRegionHandler = CredentialsRegionHandler.getInstance(project)

    private val validationJob = AtomicReference<AsyncPromise<ConnectionState>>()

    @Volatile
    var connectionState: ConnectionState = ConnectionState.InitializingToolkit
        internal set(value) {
            field = value
            incModificationCount()

            AppUIExecutor.onWriteThread(ModalityState.any()).expireWith(this).execute {
                project.messageBus.syncPublisher(CONNECTION_SETTINGS_STATE_CHANGED).settingsStateChanged(value)
            }
        }

    protected val recentlyUsedProfiles = MRUList<String>(MAX_HISTORY)
    protected val recentlyUsedRegions = MRUList<String>(MAX_HISTORY)

    // Internal state is visible for AwsSettingsPanel and ChangeAccountSettingsActionGroup
    internal var selectedCredentialIdentifier: CredentialIdentifier? = null
    internal var selectedRegion: AwsRegion? = null

    init {
        @Suppress("LeakingThis")
        ApplicationManager.getApplication().messageBus.connect(this)
            .subscribe(
                CredentialManager.CREDENTIALS_CHANGED,
                object : ToolkitCredentialsChangeListener {
                    override fun providerRemoved(identifier: CredentialIdentifier) {
                        if (selectedCredentialIdentifier == identifier) {
                            changeConnectionSettings(null, selectedRegion)
                        }
                    }

                    override fun providerModified(identifier: CredentialIdentifier) {
                        if (selectedCredentialIdentifier == identifier) {
                            refreshConnectionState()
                        }
                    }
                }
            )
    }

    fun isValidConnectionSettings(): Boolean = connectionState is ConnectionState.ValidConnection

    fun connectionSettings(): ConnectionSettings? = when (val state = connectionState) {
        is ConnectionState.ValidConnection -> ConnectionSettings(state.credentials, state.region)
        else -> null
    }

    /**
     * Re-trigger validation of the current connection
     */
    fun refreshConnectionState() {
        changeFieldsAndNotify { }
    }

    /**
     * Internal setter that allows for null values and is intended to set the internal state and still notify
     */
    protected fun changeConnectionSettings(identifier: CredentialIdentifier?, region: AwsRegion?) {
        changeFieldsAndNotify {
            identifier?.let {
                recentlyUsedProfiles.add(it.id)
            }

            region?.let {
                recentlyUsedRegions.add(it.id)
            }

            selectedCredentialIdentifier = identifier
            selectedRegion = region
        }
    }

    /**
     * Changes the credentials and then validates them. Notifies listeners of results
     */
    fun changeCredentialProvider(identifier: CredentialIdentifier, passive: Boolean = false) {
        changeFieldsAndNotify {
            recentlyUsedProfiles.add(identifier.id)

            selectedCredentialIdentifier = identifier

            selectedRegion = credentialsRegionHandler.determineSelectedRegion(identifier, selectedRegion)
        }

        AwsTelemetry.setCredentials(project = project, credentialType = identifier.credentialType.toTelemetryType(), passive = passive)
    }

    /**
     * Changes the region and then validates them. Notifies listeners of results
     */
    fun changeRegion(region: AwsRegion, passive: Boolean = false) {
        val oldRegion = selectedRegion
        changeFieldsAndNotify {
            recentlyUsedRegions.add(region.id)
            selectedRegion = region
        }

        if (oldRegion?.partitionId != region.partitionId) {
            AwsTelemetry.setPartition(project = project, partitionId = region.partitionId, passive = passive)
        }

        AwsTelemetry.setRegion(project = project, passive = passive)
    }

    @Synchronized
    private fun changeFieldsAndNotify(fieldUpdateBlock: () -> Unit) {
        val isInitial = connectionState is ConnectionState.InitializingToolkit
        connectionState = ConnectionState.ValidatingConnection

        // Grab the current state stamp
        val modificationStamp = this.modificationCount

        fieldUpdateBlock()

        val validateCredentialsResult = validateCredentials(selectedCredentialIdentifier, selectedRegion, isInitial)
        validationJob.getAndSet(validateCredentialsResult)?.cancel()

        validateCredentialsResult.onSuccess {
            // Validate we are still operating in the latest view of the world
            if (modificationStamp == this.modificationCount) {
                connectionState = it
            } else {
                LOGGER.warn { "validateCredentials returned but the account manager state has been manipulated before results were back, ignoring" }
            }
        }
    }

    private fun validateCredentials(credentialsIdentifier: CredentialIdentifier?, region: AwsRegion?, isInitial: Boolean): AsyncPromise<ConnectionState> {
        val promise = AsyncPromise<ConnectionState>()
        ApplicationManager.getApplication().executeOnPooledThread {
            if (credentialsIdentifier == null || region == null) {
                promise.setResult(ConnectionState.IncompleteConfiguration(credentialsIdentifier, region))
                return@executeOnPooledThread
            }

            if (isInitial && credentialsIdentifier is InteractiveCredential && credentialsIdentifier.userActionRequired()) {
                promise.setResult(ConnectionState.RequiresUserAction(credentialsIdentifier))
                return@executeOnPooledThread
            }

            var success = true
            try {
                val credentialsProvider = CredentialManager.getInstance().getAwsCredentialProvider(credentialsIdentifier, region)

                validate(credentialsProvider, region)

                promise.setResult(ConnectionState.ValidConnection(credentialsProvider, region))
            } catch (e: Exception) {
                LOGGER.warn(e) { message("credentials.profile.validation_error", credentialsIdentifier.displayName) }
                val result = if (credentialsIdentifier is PostValidateInteractiveCredential) {
                    try {
                        credentialsIdentifier.handleValidationException(e)
                    } catch (nested: Exception) {
                        LOGGER.warn(nested) { "$credentialsIdentifier threw while attempting to handle initial validation exception" }
                        null
                    }
                } else {
                    null
                }

                if (result == null) {
                    success = false
                }
                promise.setResult(result ?: ConnectionState.InvalidConnection(e))
            } finally {
                AwsTelemetry.validateCredentials(
                    project,
                    success = success,
                    credentialType = credentialsIdentifier.credentialType.toTelemetryType()
                )
            }
        }

        return promise
    }

    /**
     * Legacy method, should be considered deprecated and avoided since it loads defaults out of band
     */
    val activeRegion: AwsRegion
        get() = selectedRegion ?: AwsRegionProvider.getInstance().defaultRegion().also {
            LOGGER.warn(IllegalStateException()) { "Using activeRegion when region is null, calling code needs to be migrated to handle null" }
        }

    /**
     * Legacy method, should be considered deprecated and avoided since it loads defaults out of band
     */
    val activeCredentialProvider: ToolkitCredentialsProvider
        @Throws(CredentialProviderNotFoundException::class)
        get() {
            val state = connectionState
            return if (state is ConnectionState.ValidConnection) {
                state.credentials
            } else {
                if (selectedCredentialIdentifier == null) {
                    LOGGER.warn(IllegalStateException()) {
                        "Using activeCredentialProvider when credentials is null, calling code needs to be migrated to handle null"
                    }
                }

                throw CredentialProviderNotFoundException(message("credentials.profile.not_configured"))
            }
        }

    /**
     * Returns the list of recently used [AwsRegion]
     */
    fun recentlyUsedRegions(): List<AwsRegion> = recentlyUsedRegions.elements().mapNotNull { regionProvider.allRegions()[it] }

    /**
     * Returns the list of recently used [CredentialIdentifier]
     */
    fun recentlyUsedCredentials(): List<CredentialIdentifier> {
        val credentialManager = CredentialManager.getInstance()
        return recentlyUsedProfiles.elements().mapNotNull { credentialManager.getCredentialIdentifierById(it) }
    }

    /**
     * Internal method that executes the actual validation of credentials
     */
    protected open fun validate(credentialsProvider: ToolkitCredentialsProvider, region: AwsRegion) {
        resourceCache.getResource(
            StsResources.ACCOUNT,
            region = region,
            credentialProvider = credentialsProvider,
            useStale = false,
            forceFetch = true
        ).toCompletableFuture().get()
    }

    override fun dispose() {
    }

    companion object {
        /***
         * MessageBus topic for when the active credential profile or region is changed
         */
        val CONNECTION_SETTINGS_STATE_CHANGED: Topic<ConnectionSettingsStateChangeNotifier> = Topic.create(
            "AWS Account setting changed",
            ConnectionSettingsStateChangeNotifier::class.java
        )

        @JvmStatic
        fun getInstance(project: Project): AwsConnectionManager = project.service()

        private val LOGGER = getLogger<AwsConnectionManager>()
        private const val MAX_HISTORY = 5
        internal val AwsConnectionManager.selectedPartition get() = selectedRegion?.let { AwsRegionProvider.getInstance().partitions()[it.partitionId] }
    }
}

fun Project.getConnectionSettingsOrThrow(): ConnectionSettings = getConnectionSettings()
    ?: throw IllegalStateException("Bug: Attempting to retrieve connection settings with invalid connection state")

fun Project.getConnectionSettings(): ConnectionSettings? = AwsConnectionManager.getInstance(this).connectionSettings()

fun <T> Project.withAwsConnection(block: (ConnectionSettings) -> T): T {
    val connectionSettings = AwsConnectionManager.getInstance(this).connectionSettings()
        ?: throw IllegalStateException("Connection settings are not configured")
    return block(connectionSettings)
}

/**
 * A state machine around the connection validation steps the toolkit goes through. Attempts to encapsulate both state, data available at each state and
 * a consistent place to determine how to display state information (e.g. [displayMessage]). Exposes an [isTerminal] property that indicates if this
 * state is temporary in the 'connection validation' workflow or if this is a terminal state.
 */
sealed class ConnectionState(val displayMessage: String, val isTerminal: Boolean) {
    protected val gettingStartedAction: AnAction = ActionManager.getInstance().getAction("aws.toolkit.toolwindow.newConnection")
    protected val editCredsAction: AnAction = ActionManager.getInstance().getAction("aws.settings.upsertCredentials")

    /**
     * An optional short message to display in places where space is at a premium
     */
    open val shortMessage: String = displayMessage

    open val actions: List<AnAction> = emptyList()

    object InitializingToolkit : ConnectionState(message("settings.states.initializing"), isTerminal = false)

    object ValidatingConnection : ConnectionState(message("settings.states.validating"), isTerminal = false) {
        override val shortMessage: String = message("settings.states.validating.short")
    }

    class ValidConnection(internal val credentials: ToolkitCredentialsProvider, internal val region: AwsRegion) :
        ConnectionState("${credentials.displayName}@${region.displayName}", isTerminal = true) {
        override val shortMessage: String = "${credentials.shortName}@${region.id}"
        val connection by lazy { ConnectionSettings(credentials, region) }
    }

    class IncompleteConfiguration(credentials: CredentialIdentifier?, region: AwsRegion?) : ConnectionState(
        when {
            region == null && credentials == null -> message("settings.none_selected")
            region == null -> message("settings.regions.none_selected")
            credentials == null -> message("settings.credentials.none_selected")
            else -> throw IllegalArgumentException("At least one of regionId ($region) or toolkitCredentialsIdentifier ($credentials) must be null")
        },
        isTerminal = true
    ) {
        override val actions: List<AnAction> = listOf(gettingStartedAction, editCredsAction)
    }

    class InvalidConnection(private val cause: Exception) :
        ConnectionState(message("settings.states.invalid", ExceptionUtil.getMessage(cause) ?: ExceptionUtil.getThrowableText(cause)), isTerminal = true) {
        override val shortMessage = message("settings.states.invalid.short")

        override val actions: List<AnAction> = listOf(RefreshConnectionAction(message("settings.retry")), gettingStartedAction, editCredsAction)
    }

    class RequiresUserAction(interactiveCredentials: InteractiveCredential) :
        ConnectionState(interactiveCredentials.userActionDisplayMessage, isTerminal = true) {
        override val shortMessage = interactiveCredentials.userActionShortDisplayMessage

        override val actions = listOf(interactiveCredentials.userAction)
    }
}

interface ConnectionSettingsStateChangeNotifier {
    fun settingsStateChanged(newState: ConnectionState)
}

/**
 * Legacy method, should be considered deprecated and avoided since it loads defaults out of band
 */
fun Project.activeRegion(): AwsRegion = AwsConnectionManager.getInstance(this).activeRegion

/**
 * Legacy method, should be considered deprecated and avoided since it loads defaults out of band
 */
fun Project.activeCredentialProvider(): ToolkitCredentialsProvider = AwsConnectionManager.getInstance(this).activeCredentialProvider
