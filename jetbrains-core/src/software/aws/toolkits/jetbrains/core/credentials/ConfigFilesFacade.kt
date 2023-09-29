// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileFile
import software.amazon.awssdk.profiles.ProfileFileLocation
import software.aws.toolkits.core.utils.appendText
import software.aws.toolkits.core.utils.createParentDirectories
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.touch
import software.aws.toolkits.core.utils.tryDirOp
import software.aws.toolkits.core.utils.tryFileOp
import software.aws.toolkits.core.utils.writeText
import java.nio.file.Path

interface ConfigFilesFacade {
    val configPath: Path
    val credentialsPath: Path

    /**
     * Returns all valid "profile" sections defined in config/credentials.
     * This should follow the same semantics of [software.amazon.awssdk.profiles.ProfileFile.profiles]
     */
    fun readAllProfiles(): Map<String, Profile>

    fun createConfigFile()

    fun appendProfileToConfig(profile: Profile)
    fun appendProfileToCredentials(profile: Profile)
    fun appendSectionToConfig(sectionName: String, profile: Profile)
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
        # For information about how to create and manage AWS IAM Identity Center 
        # see: https://docs.aws.amazon.com/singlesignon/latest/userguide/get-started-enable-identity-center.html
        # This config file can store the named profile and sso-session 
        # Sso-Session structure configures the SDK to request SSO credentials and supports automated token refresh
        # For more information see: https://docs.aws.amazon.com/cli/latest/userguide/sso-configure-profile-token.html
        # sso_account_id and sso_role_name are usually set in the profile section to request AWS SSO credentials.
         
        [profile [profileName]]
        sso_session = [startUrlSubDomain+region]
        sso_account_id = [accountId]
        sso_role_name = [roleName]
        
        # The sso-session section in the config file groups SSO-related configuration variables, 
        # including sso_region and sso_start_url are required properties
        # sso-session name is given as startUrlSubDomain-region
        
        [sso-session [startUrlSubDomain-region]]
        sso_region = [region]
        sso_start_url = [startUrl]
        sso_registration_scopes = [scopes]
        
        # [profile dev]
        # sso_session = my-sso-portal-us-east-1
        # sso_account_id = 111122223333
        # sso_role_name = SampleRole

        # [sso-session my-sso-portal-us-east-1]
        # sso_region = us-east-1
        # sso_start_url = https://my-sso-portal.awsapps.com/start
            """.trimIndent()
    }

    override fun readAllProfiles(): Map<String, Profile> = ProfileFile.aggregator()
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
        .profiles()

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
