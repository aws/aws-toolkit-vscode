// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.compatability

import com.jetbrains.rider.model.debuggerWorker.DotNetCoreAttachStartInfo
import com.jetbrains.rider.model.debuggerWorker.DotNetCoreExeStartInfo
import software.aws.toolkits.jetbrains.services.clouddebug.makeDotnetCoreInfo

fun createNetCoreStartInfo(exePath: String): DotNetCoreExeStartInfo =
    DotNetCoreExeStartInfo(
        dotNetCoreInfo = makeDotnetCoreInfo(),
        exePath = exePath,
        workingDirectory = "",
        arguments = "",
        environmentVariables = emptyList(),
        runtimeArguments = null,
        executeAsIs = false,
        useExternalConsole = false
    )

fun createNetCoreAttachStartInfo(pid: Int) = DotNetCoreAttachStartInfo(
    processId = pid
)
