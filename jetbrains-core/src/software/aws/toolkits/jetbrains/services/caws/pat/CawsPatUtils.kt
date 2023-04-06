// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws.pat

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.amazon.awssdk.services.codecatalyst.model.ServiceQuotaExceededException
import software.aws.toolkits.resources.message

private val SUBSYSTEM = "AWS Toolkit - ${message("code.aws")} PAT"

private fun credentialAttributes(user: String) = CredentialAttributes(generateServiceName(SUBSYSTEM, user))

fun getPat(user: String) =
    PasswordSafe.instance.get(credentialAttributes(user))

fun patExists(user: String) = getPat(user) != null

fun generateAndStorePat(cawsClient: CodeCatalystClient, user: String) {
    // ideally we invalidate any existing PAT but we don't have that information

    val pat = try {
        cawsClient.createAccessToken {
            it.name("$user-AwsJetBrainsToolkit-${System.currentTimeMillis()}")
        }.secret()
    } catch (e: ServiceQuotaExceededException) {
        // warn user has too many PATs
        throw e
    }

    val credentialAttributes = credentialAttributes(user)
    PasswordSafe.instance.set(credentialAttributes, Credentials(user, pat))
}
