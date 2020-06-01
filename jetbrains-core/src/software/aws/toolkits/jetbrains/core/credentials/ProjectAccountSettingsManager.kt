// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SimpleModificationTracker
import com.intellij.util.messages.Topic
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.jetbrains.annotations.TestOnly
import software.aws.toolkits.core.credentials.CredentialProviderNotFoundException
import software.aws.toolkits.core.credentials.ToolkitCredentialsChangeListener
import software.aws.toolkits.core.credentials.ToolkitCredentialsIdentifier
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsPartition
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.services.sts.StsResources
import software.aws.toolkits.jetbrains.utils.MRUList
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AwsTelemetry
import java.util.concurrent.CancellationException

abstract class ProjectAccountSettingsManager(private val project: Project) : SimpleModificationTracker() {
    private val resourceCache = AwsResourceCache.getInstance(project)
    private val regionProvider = AwsRegionProvider.getInstance()

    @Volatile
    private var validationJob: Job? = null
    @Volatile
    internal var connectionState: ConnectionState = ConnectionState.INITIALIZING
        @TestOnly get

    protected val recentlyUsedProfiles = MRUList<String>(MAX_HISTORY)
    protected val recentlyUsedRegions = MRUList<String>(MAX_HISTORY)

    // Internal state is visible for AwsSettingsPanel and ChangeAccountSettingsActionGroup
    internal var selectedCredentialIdentifier: ToolkitCredentialsIdentifier? = null
    internal var selectedPartition: AwsPartition? = null
    internal var selectedRegion: AwsRegion? = null

    private var selectedCredentialsProvider: ToolkitCredentialsProvider? = null

    init {
        ApplicationManager.getApplication().messageBus.connect(project)
            .subscribe(CredentialManager.CREDENTIALS_CHANGED, object : ToolkitCredentialsChangeListener {
                override fun providerRemoved(identifier: ToolkitCredentialsIdentifier) {
                    if (selectedCredentialIdentifier == identifier) {
                        changeConnectionSettings(null, selectedPartition, selectedRegion)
                    }
                }
            })
    }

    fun isValidConnectionSettings(): Boolean = connectionState == ConnectionState.VALID

    fun connectionSettings(): ConnectionSettings? = selectedCredentialsProvider?.let { creds ->
        selectedRegion?.let { region ->
            ConnectionSettings(creds, region)
        }
    }

    /**
     * Internal setter that allows for null values and is intended to set the internal state and still notify
     */
    protected fun changeConnectionSettings(identifier: ToolkitCredentialsIdentifier?, partition: AwsPartition?, region: AwsRegion?) {
        changeFieldsAndNotify {
            identifier?.let {
                recentlyUsedProfiles.add(it.id)
            }

            region?.let {
                recentlyUsedRegions.add(it.id)
            }

            selectedCredentialIdentifier = identifier
            selectedPartition = partition
            selectedRegion = region
        }
    }

    // TODO: Make this not null, few tests need to be fixed
    /**
     * Changes the credentials and then validates them. Notifies listeners of results
     */
    fun changeCredentialProvider(identifier: ToolkitCredentialsIdentifier?) {
        changeFieldsAndNotify {
            identifier?.let {
                recentlyUsedProfiles.add(identifier.id)
            }

            selectedCredentialIdentifier = identifier
        }
    }

    /**
     * Changes the region and then validates them. Notifies listeners of results
     */
    fun changeRegion(region: AwsRegion) {
        changeFieldsAndNotify {
            region.let {
                recentlyUsedRegions.add(region.id)
            }
            selectedRegion = region
            selectedPartition = regionProvider.partitions()[region.partitionId]
        }
    }

    /**
     * Changes the partition and then validates them. Notifies listeners of results
     */
    fun changePartition(partition: AwsPartition) {
        changeFieldsAndNotify {
            selectedRegion = null
            selectedPartition = partition
        }
    }

    private fun changeFieldsAndNotify(fieldUpdateBlock: () -> Unit) {
        incModificationCount()

        connectionState = ConnectionState.VALIDATING
        validationJob?.cancel(CancellationException("Newer connection settings chosen"))

        // Clear existing provider
        selectedCredentialsProvider = null

        fieldUpdateBlock()

        validationJob = GlobalScope.launch(Dispatchers.IO) {
            broadcastChangeEvent(ConnectionSettingsStateChange(connectionState))

            val credentialsIdentifier = selectedCredentialIdentifier
            val region = selectedRegion
            if (credentialsIdentifier == null || region == null) {
                connectionState = ConnectionState.INVALID
                broadcastChangeEvent(ConnectionSettingsStateChange(connectionState))
                incModificationCount()
                return@launch
            }

            try {
                val credentialsProvider = CredentialManager.getInstance().getAwsCredentialProvider(credentialsIdentifier, region)

                validate(credentialsProvider, region)
                connectionState = ConnectionState.VALID
                selectedCredentialsProvider = credentialsProvider

                broadcastChangeEvent(ValidConnectionSettings(connectionState))
            } catch (e: Exception) {
                connectionState = ConnectionState.INVALID
                LOGGER.warn(e) { message("credentials.profile.validation_error", credentialsIdentifier.displayName) }
                broadcastChangeEvent(InvalidConnectionSettings(credentialsIdentifier, region, e, connectionState))
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
     * Returns the list of recently used [ToolkitCredentialsIdentifier]
     */
    fun recentlyUsedCredentials(): List<ToolkitCredentialsIdentifier> {
        val credentialManager = CredentialManager.getInstance()
        return recentlyUsedProfiles.elements().mapNotNull { credentialManager.getCredentialIdentifierById(it) }
    }

    /**
     * Internal method that executes the actual validation of credentials
     */
    protected open suspend fun validate(credentialsProvider: ToolkitCredentialsProvider, region: AwsRegion): Boolean = withContext(Dispatchers.IO) {
        // TODO: Convert the cache over to suspend methods
        resourceCache.getResourceNow(
            StsResources.ACCOUNT,
            region = region,
            credentialProvider = credentialsProvider,
            useStale = false,
            forceFetch = true
        )
        true
    }

    private fun broadcastChangeEvent(event: ConnectionSettingsChangeEvent) {
        if (!project.isDisposed) {
            project.messageBus.syncPublisher(CONNECTION_SETTINGS_CHANGED).settingsChanged(event)
        }
    }

    companion object {
        /***
         * MessageBus topic for when the active credential profile or region is changed
         */
        val CONNECTION_SETTINGS_CHANGED: Topic<ConnectionSettingsChangeNotifier> = Topic.create(
            "AWS Account setting changed",
            ConnectionSettingsChangeNotifier::class.java
        )

        @JvmStatic
        fun getInstance(project: Project): ProjectAccountSettingsManager = ServiceManager.getService(project, ProjectAccountSettingsManager::class.java)

        private val LOGGER = getLogger<DefaultProjectAccountSettingsManager>()
        private const val MAX_HISTORY = 5
    }
}

enum class ConnectionState {
    INITIALIZING,
    VALIDATING,
    INVALID,
    VALID
}

interface ConnectionSettingsChangeNotifier {
    fun settingsChanged(event: ConnectionSettingsChangeEvent)
}

sealed class ConnectionSettingsChangeEvent(val state: ConnectionState)
class ConnectionSettingsStateChange(state: ConnectionState) : ConnectionSettingsChangeEvent(state)

class InvalidConnectionSettings(
    val credentialsProvider: ToolkitCredentialsIdentifier,
    val region: AwsRegion,
    val cause: Exception,
    state: ConnectionState
) : ConnectionSettingsChangeEvent(state)

class ValidConnectionSettings(state: ConnectionState) : ConnectionSettingsChangeEvent(state)

/**
 * Legacy method, should be considered deprecated and avoided since it loads defaults out of band
 */
fun Project.activeRegion(): AwsRegion = ProjectAccountSettingsManager.getInstance(this).activeRegion

/**
 * Legacy method, should be considered deprecated and avoided since it loads defaults out of band
 */
fun Project.activeCredentialProvider(): ToolkitCredentialsProvider = ProjectAccountSettingsManager.getInstance(this).activeCredentialProvider
