// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileDocumentManager
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileFile
import software.amazon.awssdk.profiles.ProfileFileLocation
import software.aws.toolkits.core.utils.appendText
import software.aws.toolkits.core.utils.createParentDirectories
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.inputStreamIfExists
import software.aws.toolkits.core.utils.touch
import software.aws.toolkits.core.utils.tryDirOp
import software.aws.toolkits.core.utils.tryFileOp
import software.aws.toolkits.core.utils.writeText
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileWatcher
import software.aws.toolkits.jetbrains.core.credentials.profiles.SsoSessionConstants
import software.aws.toolkits.jetbrains.core.credentials.profiles.ssoSessions
import java.nio.file.Path

interface ConfigFilesFacade {
    val configPath: Path
    val credentialsPath: Path

    /**
     * Returns all valid "profile" sections defined in config/credentials.
     * This should follow the same semantics of [software.amazon.awssdk.profiles.ProfileFile.profiles]
     */
    fun readAllProfiles(): Map<String, Profile>
    fun readSsoSessions(): Map<String, Profile>

    fun createConfigFile()

    fun appendProfileToConfig(profile: Profile)
    fun appendProfileToCredentials(profile: Profile)
    fun appendSectionToConfig(sectionName: String, profile: Profile)
    fun updateSectionInConfig(sectionName: String, profile: Profile)

    fun deleteSsoConnectionFromConfig(sessionName: String)
}

class DefaultConfigFilesFacade(
    override val configPath: Path = ProfileFileLocation.configurationFilePath(),
    override val credentialsPath: Path = ProfileFileLocation.credentialsFilePath(),
) : ConfigFilesFacade {
    companion object {
        private val LOG = getLogger<DefaultConfigFilesFacade>()

        val TEMPLATE =
            """
        # Amazon Web Services Config File used by AWS CLI, SDKs, and tools
        # This file was created by the AWS Toolkit for JetBrains plugin.
        #
        # Your AWS credentials are represented by access keys associated with IAM users.
        # For information about how to create and manage AWS access keys for a user, see:
        # https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html
        #
        # This config file can store multiple access keys by placing each one in a
        # named "profile". For information about how to change the access keys in a
        # profile or to add a new profile with a different access key, see:
        # https://docs.aws.amazon.com/cli/latest/userguide/cli-config-files.html
        #
        # If both a credential and config file exists, the values in the credential file
        # take precedence

        [default]
        # The access key and secret key pair identify your account and grant access to AWS.
        aws_access_key_id = [accessKey]
        # Treat your secret key like a password. Never share your secret key with anyone. Do
        # not post it in online forums, or store it in a source control system. If your secret
        # key is ever disclosed, immediately use IAM to delete the access key and secret key
        # and create a new key pair. Then, update this file with the replacement key details.
        aws_secret_access_key = [secretKey]

        # [profile user1]
        # aws_access_key_id = [accessKey1]
        # aws_secret_access_key = [secretKey1]


        # AWS IAM Identity Center (successor to AWS Single Sign-On) helps you stay logged into AWS tools 
        # without needing to enter your info all the time
        # For information about how to create and manage AWS IAM Identity Center see:
        # https://docs.aws.amazon.com/singlesignon/latest/userguide/get-started-enable-identity-center.html
        # For more information on how to configure this file to use AWS IAM Identity Center, see:
        # https://docs.aws.amazon.com/cli/latest/userguide/sso-configure-profile-token.html

        # [sso-session my-sso]
        # sso_region = us-east-1
        # sso_start_url = https://my-sso-portal.awsapps.com/start
        # sso_registration_scopes = sso:account:access

        # [profile dev]
        # sso_session = my-sso
        # sso_account_id = 111122223333
        # sso_role_name = SampleRole
            """.trimIndent()
    }

    private fun aggregateProfiles() = ProfileFile.aggregator()
        .applyMutation {
            if (credentialsPath.exists()) {
                it.addFile(
                    ProfileFile.builder()
                        .content(credentialsPath)
                        .type(ProfileFile.Type.CREDENTIALS)
                        .build()
                )
            }
        }
        .applyMutation {
            if (configPath.exists()) {
                it.addFile(
                    ProfileFile.builder()
                        .content(configPath)
                        .type(ProfileFile.Type.CONFIGURATION)
                        .build()
                )
            }
        }
        .build()

    override fun readAllProfiles(): Map<String, Profile> = aggregateProfiles().profiles()

    override fun readSsoSessions(): Map<String, Profile> = aggregateProfiles().ssoSessions()

    override fun createConfigFile() {
        configPath.tryDirOp(LOG) { createParentDirectories() }

        configPath.tryFileOp(LOG) {
            touch(restrictToOwner = true)
            writeText(TEMPLATE)
        }
    }

    override fun appendProfileToConfig(profile: Profile) =
        appendSection(configPath, "profile", profile)

    override fun appendProfileToCredentials(profile: Profile) =
        appendSection(credentialsPath, "profile", profile)

    override fun appendSectionToConfig(sectionName: String, profile: Profile) =
        appendSection(configPath, sectionName, profile)

    override fun updateSectionInConfig(sectionName: String, profile: Profile) {
        assert(sectionName == "sso-session") { "Method only supports updating sso-session" }
        configPath.tryFileOp(LOG) {
            touch(restrictToOwner = true)
            val lines = inputStreamIfExists()?.reader()?.readLines().orEmpty()
            val profileHeaderLine = lines.indexOfFirst { it.startsWith("[$sectionName ${profile.name()}]") }
            if (profileHeaderLine == -1) {
                // does not have profile, just write directly to end
                appendSectionToConfig(sectionName, profile)
            } else {
                // has profile
                val nextHeaderLine = lines.subList(profileHeaderLine + 1, lines.size).indexOfFirst { it.startsWith("[") }
                val endIndex = if (nextHeaderLine == -1) {
                    // is last profile in file
                    lines.size
                } else {
                    nextHeaderLine + profileHeaderLine + 1
                }

                // update contents between profileHeaderLine and nextHeaderLine
                val profileLines = lines.subList(profileHeaderLine, endIndex).toMutableList()
                profile.properties().forEach { key, value ->
                    val line = profileLines.indexOfLast { it.startsWith("$key=") }
                    if (line == -1) {
                        profileLines.add("$key=$value")
                    } else {
                        profileLines[line] = "$key=$value"
                    }
                }
                writeText((lines.subList(0, profileHeaderLine) + profileLines + lines.subList(endIndex, lines.size)).joinToString("\n"))
            }
        }
    }

    override fun deleteSsoConnectionFromConfig(sessionName: String) {
        val filePath = configPath
        val lines = filePath.inputStreamIfExists()?.reader()?.readLines().orEmpty()
        val ssoHeaderLine = lines.indexOfFirst { it.startsWith("[${SsoSessionConstants.SSO_SESSION_SECTION_NAME} $sessionName]") }
        if (ssoHeaderLine == -1) return
        val nextHeaderLine = lines.subList(ssoHeaderLine + 1, lines.size).indexOfFirst { it.startsWith("[") }
        val endIndex = if (nextHeaderLine == -1) lines.size else ssoHeaderLine + nextHeaderLine + 1
        val updatedArray = lines.subList(0, ssoHeaderLine) + lines.subList(endIndex, lines.size)
        val profileHeaderLine = getCorrespondingSsoSessionProfilePosition(updatedArray, sessionName)
        filePath.writeText(profileHeaderLine.joinToString("\n"))

        val applicationManager = ApplicationManager.getApplication()
        if (applicationManager != null && !applicationManager.isUnitTestMode) {
            FileDocumentManager.getInstance().saveAllDocuments()
            ProfileWatcher.getInstance().forceRefresh()
        }
    }

    private fun getCorrespondingSsoSessionProfilePosition(updatedArray: List<String>, sessionName: String): List<String> {
        var content = updatedArray
        val finalContent = mutableListOf<String>()
        while (content.size > 0) {
            val sessionProfile = checkIfProfileIsPartOfSession(content, sessionName)
            if (sessionProfile != null) { // There is atleast one profile with the prefix matching the session name
                if (sessionProfile.shouldBeWrittenToConfig) {
                    finalContent.addAll(content.subList(0, sessionProfile.endIndex))
                } else {
                    finalContent.addAll(content.subList(0, sessionProfile.startIndex))
                }
                content = content.subList(sessionProfile.endIndex, content.size)
            } else {
                finalContent.addAll(content)
                break
            }
        }
        return finalContent
    }

    private fun checkIfProfileIsPartOfSession(content: List<String>, sessionName: String): ProfileLimitsInConfig? {
        val pos = content.indexOfFirst { it.startsWith("[profile") }
        // if no matching profile section found
        if (pos == -1) return null

        // if matching profile section found which is an sso-profile
        val contentAfterProfileHeader = content.subList(pos + 1, content.size)
        val checkIfProfileIsValid = isProfileSso(contentAfterProfileHeader, sessionName)

        return ProfileLimitsInConfig(pos, pos + checkIfProfileIsValid.endIndex + 1, shouldBeWrittenToConfig = !checkIfProfileIsValid.isProfileSso)
    }

    private fun isProfileSso(configContent: List<String>, sessionName: String): CurrentProfileLimitsInConfig {
        val nextSectionHeaderIndex = configContent.indexOfFirst { it.startsWith("[") }
        val endIndex = if (nextSectionHeaderIndex == -1) configContent.size else nextSectionHeaderIndex
        val currentProfile = configContent.subList(0, endIndex)
        currentProfile.forEach {
            if (it.startsWith("sso_session")) {
                return if (it.substringAfter("=").trim() == sessionName) {
                    CurrentProfileLimitsInConfig(isProfileSso = true, endIndex)
                } else {
                    CurrentProfileLimitsInConfig(
                        isProfileSso = false,
                        endIndex
                    )
                }
            }
        }
        return CurrentProfileLimitsInConfig(isProfileSso = false, endIndex)
    }

    data class ProfileLimitsInConfig(
        val startIndex: Int,
        val endIndex: Int,
        val shouldBeWrittenToConfig: Boolean = true
    )

    data class CurrentProfileLimitsInConfig(
        val isProfileSso: Boolean,
        val endIndex: Int = 0
    )

    private fun appendSection(path: Path, sectionName: String, profile: Profile) {
        val isConfigFile = path.fileName.toString() != "credentials"
        if (sectionName == "sso-session" && !isConfigFile) {
            error("sso-session is only allowed in 'config'")
        }

        // "credentials" file doesn't have the "profile" prefix
        // and "sso-session" is not allowed in the "config" file
        // https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html#cli-configure-files-format
        val sectionTitle = if (!isConfigFile || profile.name().trim() == "default") {
            profile.name()
        } else {
            "$sectionName ${profile.name()}"
        }.trim()

        val body = buildString {
            appendLine()
            appendLine("[$sectionTitle]")
            profile.properties().forEach { k, v ->
                appendLine("$k=$v")
            }
        }

        path.tryDirOp(LOG) { createParentDirectories() }
        path.tryFileOp(LOG) {
            touch(restrictToOwner = true)
            appendText(body)
        }
    }
}
