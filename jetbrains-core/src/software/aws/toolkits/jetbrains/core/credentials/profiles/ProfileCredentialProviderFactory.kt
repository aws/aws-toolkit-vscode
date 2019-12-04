// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.util.Disposer
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderManager
import software.aws.toolkits.jetbrains.core.AwsSdkClient
import software.aws.toolkits.jetbrains.core.credentials.CredentialProviderFactory
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

class ProfileCredentialProviderFactory : CredentialProviderFactory {
    override fun createToolkitCredentialProviderFactory(manager: ToolkitCredentialsProviderManager) = ProfileToolkitCredentialsProviderFactory(
        AwsSdkClient.getInstance().sdkHttpClient,
        AwsRegionProvider.getInstance(),
        manager,
        profileWatcher
    )

    companion object {
        val profileWatcher = ProfileWatcher().also {
            it.start()
            Disposer.register(ApplicationManager.getApplication(), it)
        }
    }
}
