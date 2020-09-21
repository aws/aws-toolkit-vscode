// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileFile
import software.amazon.awssdk.profiles.ProfileProperty
import software.aws.toolkits.core.credentials.sso.SSO_ACCOUNT
import software.aws.toolkits.core.credentials.sso.SSO_REGION
import software.aws.toolkits.core.credentials.sso.SSO_ROLE_NAME
import software.aws.toolkits.core.credentials.sso.SSO_URL
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
        profile.propertyExists(SSO_URL) -> validateSsoProfile(profile)
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

fun validateSsoProfile(profile: Profile) {
    profile.requiredProperty(SSO_ACCOUNT)
    profile.requiredProperty(SSO_REGION)
    profile.requiredProperty(SSO_ROLE_NAME)
}

private fun validateAssumeRoleProfile(profile: Profile, allProfiles: Map<String, Profile>) {
    val rootProfile = profile.traverseCredentialChain(allProfiles).last()
    validateProfile(rootProfile, allProfiles)
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
