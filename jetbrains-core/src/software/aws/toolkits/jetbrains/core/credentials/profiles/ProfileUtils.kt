// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.util.text.nullize
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileProperty
import software.aws.toolkits.resources.message

fun Profile.traverseCredentialChain(profiles: Map<String, Profile>): Sequence<Profile> = sequence {
    val profileChain = linkedSetOf<String>()
    var currentProfile = this@traverseCredentialChain

    yield(currentProfile)

    while (currentProfile.propertyExists(ProfileProperty.ROLE_ARN)) {
        val currentProfileName = currentProfile.name()
        if (!profileChain.add(currentProfileName)) {
            val chain = profileChain.joinToString("->", postfix = "->$currentProfileName")
            throw IllegalArgumentException(message("credentials.profile.circular_profiles", name(), chain))
        }

        val sourceProfile = currentProfile.requiredProperty(ProfileProperty.SOURCE_PROFILE)
        currentProfile = profiles[sourceProfile]
            ?: throw IllegalArgumentException(
                message(
                    "credentials.profile.source_profile_not_found",
                    currentProfileName,
                    sourceProfile
                )
            )

        yield(currentProfile)
    }
}

fun Profile.propertyExists(propertyName: String): Boolean = this.property(propertyName).isPresent

fun Profile.requiredProperty(propertyName: String): String = this.property(propertyName)
    .filter { it.nullize() != null }
    .orElseThrow {
        IllegalArgumentException(
            message(
                "credentials.profile.missing_property",
                this.name(),
                propertyName
            )
        )
    }
