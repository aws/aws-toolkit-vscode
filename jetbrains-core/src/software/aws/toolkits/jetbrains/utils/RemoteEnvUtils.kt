// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.extensions.ExtensionNotApplicableException

fun isRunningOnRemoteBackend() = System.getenv("REMOTE_DEV_LAUNCHER_NAME_FOR_USAGE") != null

fun disableExtensionIfRemoteBackend() {
    if (isRunningOnRemoteBackend()) {
        throw ExtensionNotApplicableException.create()
    }
}
