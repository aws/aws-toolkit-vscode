// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.util.text.nullize
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileProperty
import software.aws.toolkits.jetbrains.core.credentials.sono.IDENTITY_CENTER_ROLE_ACCESS_SCOPE
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

        val sourceProfile = currentProfile.property(ProfileProperty.SOURCE_PROFILE)
        val credentialSource = currentProfile.property(ProfileProperty.CREDENTIAL_SOURCE)

        if (sourceProfile.isPresent && credentialSource.isPresent) {
            throw IllegalArgumentException(message("credentials.profile.assume_role.duplicate_source", currentProfileName))
        }

        if (sourceProfile.isPresent) {
            val sourceProfileName = sourceProfile.get()
            currentProfile = profiles[sourceProfileName]
                ?: throw IllegalArgumentException(
                    message(
                        "credentials.profile.source_profile_not_found",
                        currentProfileName,
                        sourceProfileName
                    )
                )

            yield(currentProfile)
        } else if (credentialSource.isPresent) {
            return@sequence
        } else {
            throw IllegalArgumentException(message("credentials.profile.assume_role.missing_source", currentProfileName))
        }
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

fun Profile.ssoScopes(withDefault: Boolean = true) = property(SsoSessionConstants.SSO_REGISTRATION_SCOPES)
    .map { it.trim().split(",") }
    .orElse(if (withDefault) listOf(IDENTITY_CENTER_ROLE_ACCESS_SCOPE) else emptyList())
    .toSet()
