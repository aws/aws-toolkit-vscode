// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.extensions.ExtensionNotApplicableException
import software.aws.toolkits.jetbrains.services.caws.CawsConstants

/**
 * @return true if running in any type of remote environment
 */
fun isRunningOnRemoteBackend() = System.getenv("REMOTE_DEV_LAUNCHER_NAME_FOR_USAGE") != null

/**
 * @return true if running in a codecatalyst remote environment
 */
fun isCodeCatalystDevEnv() = System.getenv(CawsConstants.CAWS_ENV_ID_VAR) != null

fun disableExtensionIfRemoteBackend() {
    if (isRunningOnRemoteBackend()) {
        throw ExtensionNotApplicableException.create()
    }
}
