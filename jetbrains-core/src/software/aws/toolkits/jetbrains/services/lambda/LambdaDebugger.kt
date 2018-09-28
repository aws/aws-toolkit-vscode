// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.xdebugger.XDebugProcessStarter
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState

interface LambdaDebugger {
    fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugPort: Int
    ): XDebugProcessStarter?

    companion object : RuntimeGroupExtensionPointObject<LambdaDebugger>(ExtensionPointName("aws.toolkit.lambda.debugger"))
}