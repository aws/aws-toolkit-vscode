// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.xdebugger.XDebugProcessStarter
import com.jetbrains.rider.languages.fileTypes.csharp.CSharpLanguage
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.core.utils.buildList
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.ImageDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.RuntimeDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.utils.DotNetDebuggerUtils
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.Step

/**
 * Rider uses it's own DebuggerWorker process that run under .NET with extra parameters to configure:
 *    - debugger mode (client/server)
 *    - frontend port
 *    - backend port
 *
 * Workflow:
 * 1. Find the correct container by filtering `docker ps` for one of the published port of the debugger
 * 2. Use `docker exec` and a shell script to locate the dotnet PID of the runtime.
 * 3. Launch the Debugger worker in server mode using `docker exec`
 * 4. Send the command to the worker to attach to the correct PID.
 */
class DotNetRuntimeDebugSupport : RuntimeDebugSupport {
    override fun numberOfDebugPorts(): Int = DotnetDebugUtils.NUMBER_OF_DEBUG_PORTS

    override fun samArguments(debugPorts: List<Int>): List<String> = listOf("--debugger-path", DotNetDebuggerUtils.debuggerBinDir.path)
    override fun additionalDebugProcessSteps(environment: ExecutionEnvironment, state: SamRunningState): List<Step> = listOf(FindDockerContainer(), FindPid())

    override suspend fun createDebugProcess(
        context: Context,
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter = DotnetDebugUtils.createDebugProcess(environment, debugHost, debugPorts, context)
}

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

    override fun additionalDebugProcessSteps(environment: ExecutionEnvironment, state: SamRunningState): List<Step> = listOf(FindDockerContainer(), FindPid())

    override suspend fun createDebugProcess(
        context: Context,
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter = DotnetDebugUtils.createDebugProcess(environment, debugHost, debugPorts, context)
}

class Dotnet50ImageDebug : DotnetImageDebugSupport() {
    override val id: String = LambdaRuntime.DOTNET5_0.toString()
    override fun displayName() = LambdaRuntime.DOTNET5_0.toString().capitalize()
}

class Dotnet60ImageDebug : DotnetImageDebugSupport() {
    override val id: String = LambdaRuntime.DOTNET6_0.toString()
    override fun displayName() = LambdaRuntime.DOTNET6_0.toString().capitalize()
}
