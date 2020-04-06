// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.util.net.NetUtils
import com.intellij.xdebugger.XDebugProcessStarter
import org.jetbrains.concurrency.Promise
import org.jetbrains.concurrency.resolvedPromise
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroupExtensionPointObject

interface SamDebugSupport {

    val debuggerAttachTimeoutMs: Long
        get() = 60000L

    fun patchCommandLine(debugPorts: List<Int>, commandLine: GeneralCommandLine) {
        debugPorts.forEach {
            commandLine.withParameters("--debug-port").withParameters(it.toString())
        }
    }

    fun createDebugProcessAsync(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): Promise<XDebugProcessStarter?> = resolvedPromise(createDebugProcess(environment, state, debugHost, debugPorts))

    fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter?

    fun isSupported(runtime: Runtime): Boolean = true // Default behavior is all runtimes in the runtime group are supported

    fun getDebugPorts(): List<Int> = listOf(NetUtils.tryToFindAvailableSocketPort())

    companion object : RuntimeGroupExtensionPointObject<SamDebugSupport>(ExtensionPointName("aws.toolkit.lambda.sam.debugSupport"))
}
