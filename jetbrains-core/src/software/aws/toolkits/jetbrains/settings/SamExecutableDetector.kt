// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.util.SystemInfo

// Keeping this for backwards compatibility with existing SamExecutableDetector consumers
// TODO: remove in favor of ExecutableType.resolve() when we wrap the SAM executable
class SamExecutableDetector {
    fun find(): String? = if (SystemInfo.isWindows) {
        ExecutableDetector().find(
            arrayOf("C:\\Program Files\\Amazon\\AWSSAMCLI\\bin", "C:\\Program Files (x86)\\Amazon\\AWSSAMCLI\\bin"),
            arrayOf("sam.cmd", "sam.exe")
        )
    } else {
        ExecutableDetector().find(
            arrayOf("/usr/local/bin", "/usr/bin"),
            arrayOf("sam")
        )
    }
}
