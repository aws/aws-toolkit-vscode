// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SimpleModificationTracker
import com.intellij.util.ExceptionUtil
import com.intellij.util.messages.Topic
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.future.await
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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

abstract class AwsConnectionManager(private val project: Project) : SimpleModificationTracker() {
    private val resourceCache = AwsResourceCache.getInstance(project)
    private val regionProvider = AwsRegionProvider.getInstance()
    private val credentialsRegionHandler = CredentialsRegionHandler.getInstance(project)

    @Volatile
    private var validationJob: Job? = null

    @Volatile
    var connectionState: ConnectionState = ConnectionState.InitializingToolkit
        internal set(value) {
            field = value
            if (!project.isDisposed) {
                project.messageBus.syncPublisher(CONNECTION_SETTINGS_STATE_CHANGED).settingsStateChanged(value)
            }
        }

    protected val recentlyUsedProfiles = MRUList<String>(MAX_HISTORY)
    protected val recentlyUsedRegions = MRUList<String>(MAX_HISTORY)

    // Internal state is visible for AwsSettingsPanel and ChangeAccountSettingsActionGroup
    internal var selectedCredentialIdentifier: CredentialIdentifier? = null
    internal var selectedRegion: AwsRegion? = null

    private var selectedCredentialsProvider: ToolkitCredentialsProvider? = null

    init {
        ApplicationManager.getApplication().messageBus.connect(project)
            .subscribe(CredentialManager.CREDENTIALS_CHANGED, object : ToolkitCredentialsChangeListener {
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
            })
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
    fun changeCredentialProvider(identifier: CredentialIdentifier) {
        changeFieldsAndNotify {
            recentlyUsedProfiles.add(identifier.id)

            selectedCredentialIdentifier = identifier

            selectedRegion = credentialsRegionHandler.determineSelectedRegion(identifier, selectedRegion)
        }
    }

    /**
     * Changes the region and then validates them. Notifies listeners of results
     */
    fun changeRegion(region: AwsRegion) {
        changeFieldsAndNotify {
            recentlyUsedRegions.add(region.id)
            selectedRegion = region
        }
    }

    @Synchronized
    private fun changeFieldsAndNotify(fieldUpdateBlock: () -> Unit) {
        incModificationCount()

        validationJob?.cancel(CancellationException("Newer connection settings chosen"))
        val isInitial = connectionState is ConnectionState.InitializingToolkit
        connectionState = ConnectionState.ValidatingConnection

        fieldUpdateBlock()

        validationJob = GlobalScope.launch(Dispatchers.IO) {
            val credentialsIdentifier = selectedCredentialIdentifier
            val region = selectedRegion
            if (credentialsIdentifier == null || region == null) {
                connectionState = ConnectionState.IncompleteConfiguration(credentialsIdentifier, region)
                incModificationCount()
                return@launch
            }

            if (isInitial && credentialsIdentifier is InteractiveCredential && credentialsIdentifier.userActionRequired()) {
                connectionState = ConnectionState.RequiresUserAction(credentialsIdentifier)

                incModificationCount()
                return@launch
            }

            try {
                val credentialsProvider = CredentialManager.getInstance().getAwsCredentialProvider(credentialsIdentifier, region)

                validate(credentialsProvider, region)
                selectedCredentialsProvider = credentialsProvider
                connectionState = ConnectionState.ValidConnection(credentialsProvider, region)
            } catch (e: Exception) {
                connectionState = ConnectionState.InvalidConnection(e)
                LOGGER.warn(e) { message("credentials.profile.validation_error", credentialsIdentifier.displayName) }
            } finally {
                incModificationCount()
                AwsTelemetry.validateCredentials(project, success = isValidConnectionSettings())
                validationJob = null
            }
        }
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
        get() = selectedCredentialsProvider ?: throw CredentialProviderNotFoundException(message("credentials.profile.not_configured")).also {
            LOGGER.warn(IllegalStateException()) { "Using activeCredentialProvider when credentials is null, calling code needs to be migrated to handle null" }
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
    protected open suspend fun validate(credentialsProvider: ToolkitCredentialsProvider, region: AwsRegion) {
        withContext(Dispatchers.IO) {
            // TODO: Convert the cache over to suspend methods
            resourceCache.getResource(
                StsResources.ACCOUNT,
                region = region,
                credentialProvider = credentialsProvider,
                useStale = false,
                forceFetch = true
            ).await()
        }
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
        fun getInstance(project: Project): AwsConnectionManager = ServiceManager.getService(project, AwsConnectionManager::class.java)

        private val LOGGER = getLogger<AwsConnectionManager>()
        private const val MAX_HISTORY = 5
        internal val AwsConnectionManager.selectedPartition get() = selectedRegion?.let { AwsRegionProvider.getInstance().partitions()[it.partitionId] }
    }
}

/**
 * A state machine around the connection validation steps the toolkit goes through. Attempts to encapsulate both state, data available at each state and
 * a consistent place to determine how to display state information (e.g. [displayMessage]). Exposes an [isTerminal] property that indicates if this
 * state is temporary in the 'connection validation' workflow or if this is a terminal state.
 */
sealed class ConnectionState(val displayMessage: String, val isTerminal: Boolean) {
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
    }

    class IncompleteConfiguration(credentials: CredentialIdentifier?, region: AwsRegion?) : ConnectionState(
        when {
            region == null && credentials == null -> message("settings.none_selected")
            region == null -> message("settings.regions.none_selected")
            credentials == null -> message("settings.credentials.none_selected")
            else -> throw IllegalArgumentException("At least one of regionId ($region) or toolkitCredentialsIdentifier ($credentials) must be null")
        },
        isTerminal = true
    )

    class InvalidConnection(private val cause: Exception) :
        ConnectionState(message("settings.states.invalid", ExceptionUtil.getMessage(cause) ?: ExceptionUtil.getThrowableText(cause)), isTerminal = true) {
        override val shortMessage = message("settings.states.invalid.short")

        override val actions = listOf(RefreshConnectionAction(message("settings.retry")))
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
