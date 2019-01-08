// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.invokeAndWaitIfNeed
import com.intellij.openapi.ui.Messages
import icons.AwsIcons
import org.jetbrains.annotations.CalledInAwt
import software.aws.toolkits.core.credentials.ProfileToolkitCredentialsProviderFactory
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderFactory
import software.aws.toolkits.jetbrains.core.AwsSdkClient
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.resources.message

class ProfileCredentialProviderFactory : CredentialProviderFactory {
    override fun createToolkitCredentialProviderFactory(): ToolkitCredentialsProviderFactory = ProfileToolkitCredentialsProviderFactory(
        AwsSdkClient.getInstance().sdkHttpClient,
        AwsRegionProvider.getInstance(),
        { profileName, mfaDevice ->
            invokeAndWaitIfNeed(ModalityState.any()) {
                promptForMfa(profileName, mfaDevice)
            }
        })

    @CalledInAwt
    private fun promptForMfa(profileName: String, mfaDevice: String): String = Messages.showInputDialog(
        message("credentials.profile.mfa.message", mfaDevice),
        message("credentials.profile.mfa.title", profileName),
        AwsIcons.Logos.IAM_LARGE
    ) ?: throw IllegalStateException("MFA challenge is required")
}