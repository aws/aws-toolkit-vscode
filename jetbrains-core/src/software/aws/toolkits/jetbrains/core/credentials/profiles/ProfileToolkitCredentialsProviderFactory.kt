// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import org.slf4j.LoggerFactory
import org.slf4j.event.Level
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.profiles.ProfileFile
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderFactory
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderManager
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileWatcher.ProfileChangeListener
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
        val profiles = LOG.tryOrNull(message("credentials.profile.failed_load")) {
            ProfileFile.defaultProfileFile().profiles()
        } ?: emptyMap()

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

        profiles.values.forEach { newProfile ->
            LOG.tryOrNull(message("credentials.profile.failed_load"), level = Level.WARN) {
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