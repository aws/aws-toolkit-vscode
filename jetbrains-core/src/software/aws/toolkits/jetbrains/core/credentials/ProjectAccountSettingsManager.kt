// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project
import com.intellij.util.messages.MessageBus
import com.intellij.util.messages.Topic
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.credentials.ToolkitCredentialsChangeListener
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.AwsSdkClient
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager.Companion.ACCOUNT_SETTINGS_CHANGED
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileToolkitCredentialsProviderFactory
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.utils.MRUList
import software.aws.toolkits.jetbrains.utils.createNotificationExpiringAction
import software.aws.toolkits.jetbrains.utils.createShowMoreInfoDialogAction
import software.aws.toolkits.jetbrains.utils.notifyWarn
import software.aws.toolkits.resources.message

interface ProjectAccountSettingsManager {
    /**
     * Used to be notified about updates to the active account settings by subscribing to [ACCOUNT_SETTINGS_CHANGED]
     */
    interface AccountSettingsChangedNotifier {
        fun activeCredentialsChanged(credentialsProvider: ToolkitCredentialsProvider?) {}
        fun activeRegionChanged(value: AwsRegion) {}
    }

    /**
     * Setting the active region will add to the recently used list, and evict the least recently used if at max size
     */
    var activeRegion: AwsRegion

    /**
     * Setting the active provider will add to the recently used list, and evict the least recently used if at max size
     */
    var activeCredentialProvider: ToolkitCredentialsProvider
        @Throws(CredentialProviderNotFound::class) get

    fun hasActiveCredentials(): Boolean = try {
        activeCredentialProvider
        true
    } catch (_: CredentialProviderNotFound) {
        false
    }

    /**
     * Returns the list of recently used [AwsRegion]
     */
    fun recentlyUsedRegions(): List<AwsRegion>

    /**
     * Returns the list of recently used [ToolkitCredentialsProvider]
     */
    fun recentlyUsedCredentials(): List<ToolkitCredentialsProvider>

    companion object {
        /***
         * [MessageBus] topic for when the active credential profile or region is changed
         */
        val ACCOUNT_SETTINGS_CHANGED: Topic<ProjectAccountSettingsManager.AccountSettingsChangedNotifier> =
            Topic.create(
                "AWS Account setting changed",
                ProjectAccountSettingsManager.AccountSettingsChangedNotifier::class.java
            )

        fun getInstance(project: Project): ProjectAccountSettingsManager =
            ServiceManager.getService(project, ProjectAccountSettingsManager::class.java)
    }
}

fun Project.activeRegion(): AwsRegion = ProjectAccountSettingsManager.getInstance(this).activeRegion
fun Project.activeCredentialProvider(): ToolkitCredentialsProvider = ProjectAccountSettingsManager.getInstance(this).activeCredentialProvider

data class AccountState(
    var activeProfile: String? = null,
    var activeRegion: String = AwsRegionProvider.getInstance().defaultRegion().id,
    var recentlyUsedProfiles: List<String> = mutableListOf(),
    var recentlyUsedRegions: List<String> = mutableListOf()
)

@State(name = "accountSettings", storages = [Storage("aws.xml")])
class DefaultProjectAccountSettingsManager(private val project: Project) :
    ProjectAccountSettingsManager, PersistentStateComponent<AccountState> {

    private val credentialManager = CredentialManager.getInstance()
    private val regionProvider = AwsRegionProvider.getInstance()

    // use internal fields so we can bypass the message bus, so we dont accidentally trigger a stack overflow
    private var activeRegionInternal: AwsRegion = regionProvider.defaultRegion()
    private var activeProfileInternal: ToolkitCredentialsProvider? = null
    private val recentlyUsedProfiles = MRUList<String>(MAX_HISTORY)
    private val recentlyUsedRegions = MRUList<AwsRegion>(MAX_HISTORY)
    private val knownInvalidProfiles = mutableListOf<String>()

    init {
        ApplicationManager.getApplication().messageBus.connect(project)
            .subscribe(CredentialManager.CREDENTIALS_CHANGED, object : ToolkitCredentialsChangeListener {
                override fun providerRemoved(providerId: String) {
                    if (activeProfileInternal?.id == providerId) {
                        updateActiveProfile(null)
                    }
                }
            })
    }

    override var activeRegion: AwsRegion
        get() = activeRegionInternal
        set(value) {
            activeRegionInternal = value
            recentlyUsedRegions.add(value)
            project.messageBus.syncPublisher(ACCOUNT_SETTINGS_CHANGED).activeRegionChanged(value)
        }

    override var activeCredentialProvider: ToolkitCredentialsProvider
        @Throws(CredentialProviderNotFound::class)
        get() = activeProfileInternal
            ?: tryOrNull {
                getCredentialProviderOrNull(ProfileToolkitCredentialsProviderFactory.DEFAULT_PROFILE_DISPLAY_NAME)
            }?.takeIf {
                isCredentialsValid(it)
            }?.apply {
                updateActiveProfile(this)
            } ?: throw CredentialProviderNotFound(message("credentials.profile.not_configured"))
        set(value) {
            updateActiveProfile(value)
        }

    override fun recentlyUsedRegions(): List<AwsRegion> = recentlyUsedRegions.elements()

    override fun recentlyUsedCredentials(): List<ToolkitCredentialsProvider> = recentlyUsedProfiles
        .elements()
        .mapNotNull { getCredentialProviderOrNull(it) }

    override fun getState(): AccountState = AccountState(
        activeProfile = if (hasActiveCredentials()) activeCredentialProvider.id else null,
        activeRegion = activeRegionInternal.id,
        recentlyUsedProfiles = recentlyUsedProfiles.elements(),
        recentlyUsedRegions = recentlyUsedRegions.elements().map { it.id }
    )

    override fun loadState(state: AccountState) {
        activeRegionInternal = regionProvider.lookupRegionById(state.activeRegion)
        state.activeProfile?.let { getCredentialProviderOrNull(it) }?.run {
            try {
                if (this.isValidOrThrow(AwsSdkClient.getInstance().sdkHttpClient)) {
                    activeProfileInternal = this
                }
            } catch (e: Exception) {
                val title = message("credentials.invalid.title")
                val message = message("credentials.profile.validation_error", this.displayName)
                notifyWarn(
                    title = title,
                    content = message,
                    notificationActions = listOf(
                        createShowMoreInfoDialogAction(message("credentials.invalid.more_info"), title, message, e.localizedMessage),
                        createNotificationExpiringAction(ActionManager.getInstance().getAction("aws.settings.upsertCredentials"))
                    )
                )
            }
        }

        state.recentlyUsedRegions.reversed()
            .mapNotNull { regionProvider.regions()[it] }
            .forEach { recentlyUsedRegions.add(it) }

        state.recentlyUsedProfiles
            .reversed()
            .forEach { recentlyUsedProfiles.add(it) }
    }

    private fun updateActiveProfile(value: ToolkitCredentialsProvider?) {
        activeProfileInternal = value
        value?.let {
            recentlyUsedProfiles.add(value.id)
        }

        project.messageBus.syncPublisher(ACCOUNT_SETTINGS_CHANGED).activeCredentialsChanged(value)
    }

    private fun getCredentialProviderOrNull(id: String): ToolkitCredentialsProvider? = tryOrNull {
        credentialManager.getCredentialProvider(id)
    }

    private fun isCredentialsValid(toolkitCredentialsProvider: ToolkitCredentialsProvider): Boolean {
        // Prevent repeated checks when a provider is known to be invalid
        // TODO : When profile refreshing is supported, this will need to be revisited
        if (!knownInvalidProfiles.contains(toolkitCredentialsProvider.id)) {
            try {
                if (toolkitCredentialsProvider.isValidOrThrow(AwsSdkClient.getInstance().sdkHttpClient)) {
                    return true
                }
            } catch (e: Exception) {
                knownInvalidProfiles.add(toolkitCredentialsProvider.id)
            }
        }

        return false
    }

    companion object {
        private const val MAX_HISTORY = 5
    }
}