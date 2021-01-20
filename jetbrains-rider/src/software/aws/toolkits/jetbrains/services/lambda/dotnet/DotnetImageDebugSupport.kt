// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.xdebugger.XDebugProcessStarter
import com.jetbrains.rider.ideaInterop.fileTypes.csharp.CSharpLanguage
import org.jetbrains.concurrency.Promise
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.core.utils.buildList
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.ImageDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.utils.DotNetDebuggerUtils

abstract class DotnetImageDebugSupport : ImageDebugSupport {
    override fun numberOfDebugPorts(): Int = DotnetDebugUtils.NUMBER_OF_DEBUG_PORTS
    override fun supportsPathMappings(): Boolean = false
    override val languageId = CSharpLanguage.id

    override fun samArguments(debugPorts: List<Int>): List<String> = buildList {
        addAll(super.samArguments(debugPorts))
        add("--debugger-path")
        add(DotNetDebuggerUtils.debuggerBinDir.path)
    }

    override fun containerEnvVars(debugPorts: List<Int>): Map<String, String> = mapOf(
        "_AWS_LAMBDA_DOTNET_DEBUGGING" to "1"
    )

    override suspend fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter? {
        throw UnsupportedOperationException("Use 'createDebugProcessAsync' instead")
    }

    override fun createDebugProcessAsync(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): Promise<XDebugProcessStarter?> = DotnetDebugUtils.createDebugProcessAsync(environment, state, debugHost, debugPorts)
}

class Dotnet21ImageDebug : DotnetImageDebugSupport() {
    override val id: String = LambdaRuntime.DOTNETCORE2_1.toString()
    override fun displayName() = LambdaRuntime.DOTNETCORE2_1.toString().capitalize()
}

class Dotnet31ImageDebug : DotnetImageDebugSupport() {
    override val id: String = LambdaRuntime.DOTNETCORE3_1.toString()
    override fun displayName() = LambdaRuntime.DOTNETCORE3_1.toString().capitalize()
}

class Dotnet50ImageDebug : DotnetImageDebugSupport() {
    override val id: String = LambdaRuntime.DOTNET5_0.toString()
    override fun displayName() = LambdaRuntime.DOTNET5_0.toString().capitalize()
}
