// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileCredentialsIdentifier

interface ChangeConnectionSettingIfValid {
    fun changeConnection(profile: ProfileCredentialsIdentifier) {}
}
