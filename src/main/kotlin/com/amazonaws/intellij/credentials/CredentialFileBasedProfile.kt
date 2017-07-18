package com.amazonaws.intellij.credentials

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.auth.profile.internal.BasicProfile
import com.amazonaws.intellij.ui.credentials.CredentialFileBasedProfileEditor
import com.intellij.openapi.project.Project
import org.jdom.Element

data class CredentialFileBasedProfile(val profile: BasicProfile) : CredentialProfile() {
    init {
        name = profile.profileName
    }

    override val id = CredentialFileBasedProfileFactory.ID
    override val description = CredentialFileBasedProfileFactory.DESCRIPTION

    // TODO: This requires re-parsing of the profile file...., https://github.com/aws/aws-sdk-java-v2/issues/70
    override val awsCredentials: AWSCredentialsProvider
        get() = ProfileCredentialsProvider(profile.profileName)

    override fun save(project: Project, element: Element) {
        // TODO: There is no API for this... ProfilesConfigFileWriter can only write Profile, not BasicProfile
    }

    override fun load(project: Project, element: Element) {
    }
}

class CredentialFileBasedProfileFactory : CredentialProfileFactory<CredentialFileBasedProfile>() {
    override fun configurationComponent() = CredentialFileBasedProfileEditor()

    override fun configurationComponent(source: CredentialFileBasedProfile) = CredentialFileBasedProfileEditor(source)

    override fun getKey() = ID

    override val description = DESCRIPTION

    override fun createProvider(): CredentialFileBasedProfile {
        throw UnsupportedOperationException("Should never happen")
    }

    companion object {
        const val ID = "credentialFileProfile"
        const val DESCRIPTION = "Credentials file based profile";
    }
}