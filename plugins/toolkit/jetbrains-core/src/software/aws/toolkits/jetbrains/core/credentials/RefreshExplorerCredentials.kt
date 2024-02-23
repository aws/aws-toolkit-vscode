// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileCredentialsIdentifier

class RefreshExplorerCredentials(val project: Project) : ChangeConnectionSettingIfValid {

    override fun changeConnection(profile: ProfileCredentialsIdentifier) {
        super.changeConnection(profile)
        AwsConnectionManager.getInstance(project).changeCredentialProvider(profile)
    }
}

interface ChangeConnectionSettingIfValid {
    fun changeConnection(profile: ProfileCredentialsIdentifier) {}
}
