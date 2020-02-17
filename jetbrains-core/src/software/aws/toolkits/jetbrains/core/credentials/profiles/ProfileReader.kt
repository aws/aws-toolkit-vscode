// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.util.text.nullize
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileFile
import software.amazon.awssdk.profiles.ProfileProperty
import software.aws.toolkits.resources.message

data class Profiles(val validProfiles: Map<String, Profile>, val invalidProfiles: Map<String, Exception>)

/**
 * Reads the AWS shared credentials files and produces what profiles are valid and if not why it is not
 */
fun validateAndGetProfiles(): Profiles {
    val allProfiles: Map<String, Profile> = ProfileFile.defaultProfileFile().profiles()

    val validProfiles = mutableMapOf<String, Profile>()
    val invalidProfiles = mutableMapOf<String, Exception>()

    allProfiles.values.forEach {
        try {
            validateProfile(it, allProfiles)
            validProfiles[it.name()] = it
        } catch (e: Exception) {
            invalidProfiles[it.name()] = e
        }
    }

    return Profiles(validProfiles, invalidProfiles)
}

private fun validateProfile(profile: Profile, allProfiles: Map<String, Profile>) {
    when {
        profile.propertyExists(ProfileProperty.ROLE_ARN) -> validateAssumeRoleProfile(profile, allProfiles)
        profile.propertyExists(ProfileProperty.AWS_SESSION_TOKEN) -> validateStaticSessionProfile(profile)
        profile.propertyExists(ProfileProperty.AWS_ACCESS_KEY_ID) -> validateBasicProfile(profile)
        profile.propertyExists(ProfileProperty.CREDENTIAL_PROCESS) -> {
            // NO-OP Always valid
        }
        else -> {
            throw IllegalArgumentException(message("credentials.profile.unsupported", profile.name()))
        }
    }
}

private fun validateAssumeRoleProfile(profile: Profile, allProfiles: Map<String, Profile>) {
    val profileChain = linkedSetOf<String>()
    var currentProfile = profile

    while (currentProfile.propertyExists(ProfileProperty.SOURCE_PROFILE)) {
        val currentProfileName = currentProfile.name()
        if (!profileChain.add(currentProfileName)) {
            val chain = profileChain.joinToString("->", postfix = "->$currentProfileName")
            throw IllegalArgumentException(message("credentials.profile.circular_profiles", chain))
        }

        val sourceProfile = currentProfile.requiredProperty(ProfileProperty.SOURCE_PROFILE)
        currentProfile = allProfiles[sourceProfile]
            ?: throw IllegalArgumentException(
                message(
                    "credentials.profile.source_profile_not_found",
                    currentProfileName,
                    sourceProfile
                )
            )
    }

    validateProfile(currentProfile, allProfiles)
}

private fun validateStaticSessionProfile(profile: Profile) {
    profile.requiredProperty(ProfileProperty.AWS_ACCESS_KEY_ID)
    profile.requiredProperty(ProfileProperty.AWS_SECRET_ACCESS_KEY)
    profile.requiredProperty(ProfileProperty.AWS_SESSION_TOKEN)
}

private fun validateBasicProfile(profile: Profile) {
    profile.requiredProperty(ProfileProperty.AWS_ACCESS_KEY_ID)
    profile.requiredProperty(ProfileProperty.AWS_SECRET_ACCESS_KEY)
}

fun Profile.propertyExists(propertyName: String): Boolean = this.property(propertyName).isPresent

fun Profile.requiredProperty(propertyName: String): String = this.property(propertyName)
    .filter {
        it.nullize() != null
    }
    .orElseThrow {
        IllegalArgumentException(
            message(
                "credentials.profile.missing_property",
                this.name(),
                propertyName
            )
        )
    }
