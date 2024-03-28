// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileFile
import software.amazon.awssdk.profiles.ProfileProperty
import software.aws.toolkits.jetbrains.core.credentials.profiles.SsoSessionConstants.PROFILE_SSO_SESSION_PROPERTY
import software.aws.toolkits.jetbrains.core.credentials.profiles.SsoSessionConstants.SSO_SESSION_SECTION_NAME
import software.aws.toolkits.resources.message

data class Profiles(
    val validProfiles: Map<String, Profile>,
    val invalidProfiles: Map<String, Exception>,
    val validSsoSessions: Map<String, Profile>,
    val invalidSsoSessions: Map<String, Exception>
)

/**
 * Reads the AWS shared credentials files and produces what profiles are valid and if not why it is not
 */
fun validateAndGetProfiles(): Profiles {
    val profileFile = ProfileFile.defaultProfileFile()
    val allProfiles = profileFile.profiles().orEmpty()
    val ssoSessions = profileFile.ssoSessions()

    val validProfiles = mutableMapOf<String, Profile>()
    val invalidProfiles = mutableMapOf<String, Exception>()
    val validSsoSessions = mutableMapOf<String, Profile>()
    val invalidSsoSessions = mutableMapOf<String, Exception>()

    allProfiles.values.forEach {
        try {
            validateProfile(it, allProfiles)
            validProfiles[it.name()] = it
        } catch (e: Exception) {
            invalidProfiles[it.name()] = e
        }
    }

    ssoSessions.values.forEach {
        try {
            validateSsoSession(it)
            validSsoSessions[it.name()] = it
        } catch (e: Exception) {
            invalidSsoSessions[it.name()] = e
        }
    }

    return Profiles(validProfiles, invalidProfiles, validSsoSessions, invalidSsoSessions)
}

private fun validateProfile(profile: Profile, allProfiles: Map<String, Profile>) {
    when {
        profile.propertyExists(ProfileProperty.SSO_START_URL) -> validateLegacySsoProfile(profile)
        profile.propertyExists(ProfileProperty.ROLE_ARN) -> validateAssumeRoleProfile(profile, allProfiles)
        profile.propertyExists(ProfileProperty.AWS_SESSION_TOKEN) -> validateStaticSessionProfile(profile)
        profile.propertyExists(ProfileProperty.AWS_ACCESS_KEY_ID) -> validateBasicProfile(profile)
        profile.propertyExists(PROFILE_SSO_SESSION_PROPERTY) -> validateSsoProfile(profile)
        profile.propertyExists(ProfileProperty.CREDENTIAL_PROCESS) -> {
            // NO-OP Always valid
        }
        else -> {
            throw IllegalArgumentException(message("credentials.profile.unsupported", profile.name()))
        }
    }
}

fun validateLegacySsoProfile(profile: Profile) {
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

private fun validateSsoProfile(profile: Profile) {
    val ssoSessionName = profile.requiredProperty(PROFILE_SSO_SESSION_PROPERTY)
    profile.requiredProperty(ProfileProperty.SSO_ACCOUNT_ID)
    profile.requiredProperty(ProfileProperty.SSO_ROLE_NAME)

    val sessionSection = ProfileFile.defaultProfileFile().getSection(SSO_SESSION_SECTION_NAME, ssoSessionName).orElse(null)
        ?: error(message("credentials.ssoSession.validation_error", profile.name(), ssoSessionName))

    validateSsoSession(sessionSection)
}

private fun validateSsoSession(profile: Profile) {
    profile.requiredProperty(ProfileProperty.SSO_START_URL)
    profile.requiredProperty(ProfileProperty.SSO_REGION)
}

fun ProfileFile.ssoSessions(): Map<String, Profile> {
    // we could also manually parse the file to avoid reflection, but the SDK encodes a lot of logic that we don't want to try to duplicate
    val rawProfilesField = javaClass.declaredFields.first { it.name == "profilesAndSectionsMap" }.apply {
        isAccessible = true
    }
    val rawProfiles = rawProfilesField.get(this) as Map<String, Map<String, Profile>>
    return rawProfiles.get(SSO_SESSION_SECTION_NAME).orEmpty()
}
