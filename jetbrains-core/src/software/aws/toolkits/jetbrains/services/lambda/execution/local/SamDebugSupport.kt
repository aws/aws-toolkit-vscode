// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.xdebugger.XDebugProcessStarter
import org.jetbrains.concurrency.Promise
import org.jetbrains.concurrency.resolvedPromise
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroupExtensionPointObject

interface SamDebugSupport {

    val debuggerAttachTimeoutMs: Long
        get() = 60000L

    fun patchCommandLine(debugPort: Int, state: SamRunningState, commandLine: GeneralCommandLine) {
        commandLine.withParameters("--debug-port")
            .withParameters(debugPort.toString())
    }

    fun createDebugProcessAsync(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugPort: Int
    ): Promise<XDebugProcessStarter?> = resolvedPromise(createDebugProcess(environment, state, debugPort))

    fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugPort: Int
    ): XDebugProcessStarter?

    fun isSupported(): Boolean = true

    companion object : RuntimeGroupExtensionPointObject<SamDebugSupport>(ExtensionPointName("aws.toolkit.lambda.sam.debugSupport"))
}