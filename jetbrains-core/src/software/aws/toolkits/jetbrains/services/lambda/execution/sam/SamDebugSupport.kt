// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.xdebugger.XDebugProcessStarter
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroupExtensionPointObject

interface SamDebugSupport {
    fun patchCommandLine(debugPort: Int, state: SamRunningState, commandLine: GeneralCommandLine) {
        commandLine.withParameters("--debug-port")
            .withParameters(debugPort.toString())
    }

    fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugPort: Int
    ): XDebugProcessStarter?

    companion object : RuntimeGroupExtensionPointObject<SamDebugSupport>(ExtensionPointName("aws.toolkit.lambda.sam.debugSupport"))
}