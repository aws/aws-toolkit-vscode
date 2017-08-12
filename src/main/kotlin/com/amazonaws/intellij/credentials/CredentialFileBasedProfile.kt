package com.amazonaws.intellij.credentials

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.auth.profile.internal.BasicProfile
import com.amazonaws.intellij.ui.credentials.CredentialFileBasedProfileEditor

data class CredentialFileBasedProfile(val profile: BasicProfile) : CredentialProfile() {
    init {
        name = profile.profileName
    }

    override val id = CredentialFileBasedProfileFactory.ID

    // TODO: This requires re-parsing of the profile file...., https://github.com/aws/aws-sdk-java-v2/issues/70
    override val awsCredentials: AWSCredentialsProvider
        get() = ProfileCredentialsProvider(profile.profileName)
}

class CredentialFileBasedProfileFactory : CredentialProfileFactory<CredentialFileBasedProfile>() {
    override fun getKey() = ID

    override fun configurationComponent(): CredentialFileBasedProfileEditor {
        return CredentialFileBasedProfileEditor()
    }

    override fun configurationComponent(source: CredentialProfile): CredentialFileBasedProfileEditor {
        return CredentialFileBasedProfileEditor(source as CredentialFileBasedProfile)
    }

    override val description = DESCRIPTION

    override fun createProvider(): CredentialFileBasedProfile {
        throw UnsupportedOperationException("Should never happen")
    }

    companion object {
        const val ID = "credentialFileProfile"
        const val DESCRIPTION = "Credentials file based profile";
    }
}