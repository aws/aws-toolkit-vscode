// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.util.io.FileUtil
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileFile
import software.amazon.awssdk.profiles.ProfileFileLocation
import software.amazon.awssdk.profiles.ProfileProperty.SSO_ACCOUNT_ID
import software.amazon.awssdk.profiles.ProfileProperty.SSO_REGION
import software.amazon.awssdk.profiles.ProfileProperty.SSO_ROLE_NAME
import software.amazon.awssdk.profiles.ProfileProperty.SSO_START_URL
import software.aws.toolkits.jetbrains.core.credentials.SsoProfileConstants.SSO_SESSION_PROFILE_NAME
import software.aws.toolkits.jetbrains.core.credentials.profiles.SsoSessionConstants.PROFILE_SSO_SESSION_PROPERTY
import software.aws.toolkits.jetbrains.core.credentials.profiles.SsoSessionConstants.SSO_REGISTRATION_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.profiles.SsoSessionConstants.SSO_SESSION_SECTION_NAME
import java.io.File
import java.util.Optional

object SsoSessionConfigurationManager {

    val profileFile = ProfileFileLocation.configurationFilePath().toFile()
    private fun writeSsoSessionProfileToConfigFile(
        ssoProfileName: String,
        ssoRegion: String,
        startUrl: String,
        scopesList: List<String>,
        accountId: String,
        roleName: String
    ) {
        val configContents =
            """ 
            [$SSO_SESSION_PROFILE_NAME $ssoProfileName]
            $PROFILE_SSO_SESSION_PROPERTY=$ssoProfileName
            $SSO_ACCOUNT_ID=$accountId
            $SSO_ROLE_NAME=$roleName            
            
            [$SSO_SESSION_SECTION_NAME $ssoProfileName]
            $SSO_REGION=$ssoRegion
            $SSO_START_URL=$startUrl
            $SSO_REGISTRATION_SCOPES=${scopesList.joinToString(",")} 
            """.trimIndent()

        writeProfileFile(configContents)
    }

    fun updateSsoSessionProfileToConfigFile(
        ssoProfileName: String,
        ssoRegion: String,
        startUrl: String,
        scopes: List<String>,
        accountId: String,
        roleName: String
    ) {
        val ssoSessionSection: Optional<Profile>? = ProfileFile.defaultProfileFile().getSection(SSO_SESSION_SECTION_NAME, ssoProfileName)

        if (ssoSessionSection?.isEmpty == false) {
            val existing = """
            [$SSO_SESSION_SECTION_NAME $ssoProfileName]
            $SSO_REGION=${ssoSessionSection.get().property(SSO_REGION)}
            $SSO_START_URL=${ssoSessionSection.get().property(SSO_START_URL)}
            $SSO_REGISTRATION_SCOPES=${scopes.joinToString(",")}
            """.trimIndent()

            val updateContents = """
            [$SSO_SESSION_SECTION_NAME $ssoProfileName]
            $SSO_REGION=$ssoRegion
            $SSO_START_URL=$startUrl
            $SSO_REGISTRATION_SCOPES=${scopes.joinToString(",")}
            """.trimIndent()
            replaceUpdatedSsoSession(profileFile, existing, updateContents)
        } else {
            // SSO session block doesn't exist, create a new one
            writeSsoSessionProfileToConfigFile(ssoProfileName, ssoRegion, startUrl, scopes, accountId, roleName)
        }
    }

    private fun replaceUpdatedSsoSession(file: File, existingSsoSession: String, updateSsoSession: String) {
        val content = file.readText()
        val updatedContent = content.replace(existingSsoSession, updateSsoSession)

        file.writeText(updatedContent)
    }

    private fun writeProfileFile(content: String) {
        FileUtil.createIfDoesntExist(profileFile)
        FileUtil.writeToFile(profileFile, content, true)
    }
}

object SsoProfileConstants {
    const val SSO_SESSION_PROFILE_NAME: String = "profile"
}
