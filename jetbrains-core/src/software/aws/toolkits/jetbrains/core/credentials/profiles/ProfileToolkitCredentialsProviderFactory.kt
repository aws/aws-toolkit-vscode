// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import org.slf4j.LoggerFactory
import org.slf4j.event.Level
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.profiles.ProfileFile
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderFactory
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.resources.message
import java.nio.file.Path

class ProfileToolkitCredentialsProviderFactory(
    private val sdkHttpClient: SdkHttpClient,
    private val regionProvider: ToolkitRegionProvider,
    private val credentialLocationOverride: Path? = null
) : ToolkitCredentialsProviderFactory(TYPE) {

    init {
        loadFromProfileFile()
    }

    /**
     * Clean out all the current credentials and load all the profiles
     */
    private fun loadFromProfileFile() {
        val profiles = LOG.tryOrNull(message("credentials.profile.failed_load")) {
            credentialLocationOverride?.let {
                // TODO: This should go away, and be migrated to using the standard AWS sysProps for testing
                ProfileFile.builder()
                    .content(credentialLocationOverride)
                    .type(ProfileFile.Type.CONFIGURATION)
                    .build()
                    .profiles()
            } ?: ProfileFile.defaultProfileFile().profiles()
        } ?: emptyMap()

        profiles.values.forEach {
            LOG.tryOrNull(message("credentials.profile.failed_load"), level = Level.WARN) {
                add(
                    ProfileToolkitCredentialsProvider(
                        profiles,
                        it,
                        sdkHttpClient,
                        regionProvider
                    )
                )
            }
        }
    }

    override fun shutDown() {
    }

    companion object {
        private val LOG =
            LoggerFactory.getLogger(ProfileToolkitCredentialsProviderFactory::class.java)

        const val TYPE = "profile"
        const val DEFAULT_PROFILE_DISPLAY_NAME = "$TYPE:default"
    }
}