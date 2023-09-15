// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileFile
import software.amazon.awssdk.profiles.ProfileProperty
import software.aws.toolkits.jetbrains.core.credentials.profiles.SsoSessionConstants.PROFILE_SSO_SESSION_PROPERTY
import software.aws.toolkits.jetbrains.core.credentials.profiles.SsoSessionConstants.SSO_SESSION_SECTION_NAME
import software.aws.toolkits.resources.message
import java.util.Optional

data class Profiles(val validProfiles: Map<String, Profile>, val invalidProfiles: Map<String, Exception>)

/**
 * Reads the AWS shared credentials files and produces what profiles are valid and if not why it is not
 */
fun validateAndGetProfiles(): Profiles {
    val allProfiles: Map<String, Profile> = ProfileFile.defaultProfileFile().profiles().orEmpty()

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
        profile.propertyExists(ProfileProperty.SSO_START_URL) -> validateSsoProfile(profile)
        profile.propertyExists(ProfileProperty.ROLE_ARN) -> validateAssumeRoleProfile(profile, allProfiles)
        profile.propertyExists(ProfileProperty.AWS_SESSION_TOKEN) -> validateStaticSessionProfile(profile)
        profile.propertyExists(ProfileProperty.AWS_ACCESS_KEY_ID) -> validateBasicProfile(profile)
        profile.propertyExists(PROFILE_SSO_SESSION_PROPERTY) -> validateSsoSection(profile)
        profile.propertyExists(ProfileProperty.CREDENTIAL_PROCESS) -> {
            // NO-OP Always valid
        }
        else -> {
            throw IllegalArgumentException(message("credentials.profile.unsupported", profile.name()))
        }
    }
}

fun validateSsoProfile(profile: Profile) {
    profile.requiredProperty(ProfileProperty.SSO_ACCOUNT_ID)
    profile.requiredProperty(ProfileProperty.SSO_REGION)
    profile.requiredProperty(ProfileProperty.SSO_ROLE_NAME)
}

private fun validateAssumeRoleProfile(profile: Profile, allProfiles: Map<String, Profile>) {
    val rootProfile = profile.traverseCredentialChain(allProfiles).last()
    val credentialSource = rootProfile.property(ProfileProperty.CREDENTIAL_SOURCE)

    if (credentialSource.isPresent) {
        try {
            CredentialSourceType.parse(credentialSource.get())
        } catch (e: Exception) {
            throw IllegalArgumentException(message("credentials.profile.assume_role.invalid_credential_source", rootProfile.name()))
        }
    } else {
        validateProfile(rootProfile, allProfiles)
    }
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

private fun validateSsoSection(profile: Profile) {
    profile.requiredProperty(PROFILE_SSO_SESSION_PROPERTY)
    profile.requiredProperty(ProfileProperty.SSO_ACCOUNT_ID)
    profile.requiredProperty(ProfileProperty.SSO_ROLE_NAME)

    val ssoSessionName = profile.property(PROFILE_SSO_SESSION_PROPERTY)
    val ssoSessionSection: Optional<Profile>? = ProfileFile.defaultProfileFile().getSection(SSO_SESSION_SECTION_NAME, ssoSessionName.get())

    ssoSessionSection?.get()?.let {
        it.requiredProperty(ProfileProperty.SSO_START_URL)
        it.requiredProperty(ProfileProperty.SSO_REGION)
    } ?: error(message("credentials.ssoSession.validation_error", profile.name(), ssoSessionName.get()))
}
