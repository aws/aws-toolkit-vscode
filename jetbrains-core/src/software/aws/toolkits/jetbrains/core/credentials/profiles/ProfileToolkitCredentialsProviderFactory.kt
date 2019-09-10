// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.openapi.actionSystem.ActionManager
import org.slf4j.LoggerFactory
import org.slf4j.event.Level
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.profiles.ProfileFile
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderFactory
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderManager
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.utils.tryOrThrow
import software.aws.toolkits.core.utils.tryOrThrowNullable
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileWatcher.ProfileChangeListener
import software.aws.toolkits.jetbrains.utils.createNotificationExpiringAction
import software.aws.toolkits.jetbrains.utils.createShowMoreInfoDialogAction
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message

class ProfileToolkitCredentialsProviderFactory(
    private val sdkHttpClient: SdkHttpClient,
    private val regionProvider: ToolkitRegionProvider,
    credentialsProviderManager: ToolkitCredentialsProviderManager,
    private val profileWatcher: ProfileWatcher
) : ToolkitCredentialsProviderFactory<ProfileToolkitCredentialsProvider>(TYPE, credentialsProviderManager), ProfileChangeListener {
    private val profileHolder = ProfileHolder()

    init {
        loadFromProfileFile()
        profileWatcher.addListener(this)
    }

    override fun onProfilesChanged() {
        loadFromProfileFile()
    }

    /**
     * Clean out all the current credentials and load all the profiles
     */
    @Synchronized
    private fun loadFromProfileFile() {
        val profilesFetchingResult = Result.runCatching {
            LOG.tryOrThrow(message("credentials.profile.failed_load"), level = Level.WARN) {
                ProfileFile.defaultProfileFile().profiles()
            }
        }
        val profiles = profilesFetchingResult.getOrNull() ?: emptyMap()

        // Remove old ones
        profileHolder.list().forEach {
            if (!profiles.containsKey(it.name())) {
                profileHolder.removeProfile(it.name())
            }
        }

        // Add new ones
        profiles.forEach {
            profileHolder.putProfile(it.value)
        }

        val currentProfiles = listCredentialProviders()
            .map { it.profileName to it }
            .toMap(mutableMapOf())

        val errors = profiles.values.map { newProfile ->
            Result.runCatching {
                LOG.tryOrThrowNullable(message("credentials.profile.failed_load"), level = Level.WARN) {
                    // If we already have a provider referencing this profile, we need replace the internal profile
                    val currentProvider = currentProfiles[newProfile.name()]
                    if (currentProvider != null) {
                        currentProvider.refresh()
                        credentialsProviderManager.providerModified(currentProvider)
                    } else {
                        val newProvider = ProfileToolkitCredentialsProvider(
                            profileHolder,
                            newProfile.name(),
                            sdkHttpClient,
                            regionProvider
                        )
                        add(newProvider)
                    }

                    // Only remove it from the list of things to keep if successful
                    currentProfiles.remove(newProfile.name())
                }
            }
        }.filter { it.isFailure }

        val refreshTitle = message("credentials.profile.refresh_ok_title")
        val refreshBaseMessage = message("credentials.profile.refresh_ok_message", profiles.size)

        if (profilesFetchingResult.isFailure) {
            val loadingFailureMessage = message("credentials.profile.failed_load")
            val detail = profilesFetchingResult.exceptionOrNull()?.message?.let {
                ": $it"
            } ?: ""
            notifyError(
                title = refreshTitle,
                content = "$loadingFailureMessage$detail",
                action = createNotificationExpiringAction(ActionManager.getInstance().getAction("aws.settings.upsertCredentials"))
            )
        } else if (errors.isNotEmpty()) {
            val message = errors.mapNotNull { it.exceptionOrNull()?.message }.reduce { acc, message ->
                "$acc\n$message"
            }

            val errorDialogTitle = message("credentials.invalid.title")
            val numErrorMessage = message("credentials.profile.refresh_errors", errors.size)

            notifyInfo(
                title = refreshTitle,
                content = "$refreshBaseMessage $numErrorMessage",
                notificationActions = listOf(
                    createShowMoreInfoDialogAction(message("credentials.invalid.more_info"), errorDialogTitle, numErrorMessage, message),
                    createNotificationExpiringAction(ActionManager.getInstance().getAction("aws.settings.upsertCredentials"))
                )
            )
        } else {
            notifyInfo(
                title = refreshTitle,
                content = refreshBaseMessage
            )
        }

        // Profiles are not longer in the updated file, remove them from the toolkit
        currentProfiles.values.forEach {
            remove(it)
            try {
                it.refresh() // Force a refresh to clear the data
            } catch (e: Exception) {
                // NO-OP, expected since the underlying profile was deleted
            }
        }
    }

    override fun shutDown() {
        profileWatcher.removeListener(this)
    }

    companion object {
        private val LOG = LoggerFactory.getLogger(ProfileToolkitCredentialsProviderFactory::class.java)

        const val TYPE = "profile"
        const val DEFAULT_PROFILE_DISPLAY_NAME = "$TYPE:default"
    }
}
