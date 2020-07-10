// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.ui.ExecutionConsole
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugProcessStarter
import com.intellij.xdebugger.XDebugSession
import com.jetbrains.rd.framework.IProtocol
import com.jetbrains.rd.util.lifetime.Lifetime
import com.jetbrains.rider.RiderEnvironment
import com.jetbrains.rider.debugger.DebuggerWorkerPlatform
import com.jetbrains.rider.debugger.DotNetDebugProcess
import com.jetbrains.rider.debugger.DotNetDebugRunner
import com.jetbrains.rider.debugger.actions.utils.OptionsUtil
import com.jetbrains.rider.model.debuggerWorker.DotNetDebuggerSessionModel
import com.jetbrains.rider.run.IDebuggerOutputListener
import java.io.File

object DotNetDebuggerUtils {
    val debuggerName = DebuggerWorkerPlatform.AnyCpu.assemblyName

    val debuggerAssemblyFile: File = RiderEnvironment.getBundledFile(debuggerName)

    val debuggerBinDir: File = debuggerAssemblyFile.parentFile

    const val cloudDebuggerTempDirName = "aws_rider_debugger_files"

    fun createAndStartSession(
        executionConsole: ExecutionConsole,
        env: ExecutionEnvironment,
        sessionLifetime: Lifetime,
        processHandler: ProcessHandler,
        protocol: IProtocol,
        sessionModel: DotNetDebuggerSessionModel,
        outputEventsListener: IDebuggerOutputListener
    ): XDebugProcessStarter {
        val fireInitializedManually = env.getUserData(DotNetDebugRunner.FIRE_INITIALIZED_MANUALLY) ?: false

        return object : XDebugProcessStarter() {
            override fun start(session: XDebugSession): XDebugProcess = DotNetDebugProcess(
                sessionLifetime = sessionLifetime,
                session = session,
                sessionId = env.executionId,
                debuggerWorkerProcessHandler = processHandler,
                console = executionConsole,
                protocol = protocol,
                sessionProxy = sessionModel,
                fireInitializedManually = fireInitializedManually,
                customListener = outputEventsListener,
                debugKind = OptionsUtil.toDebugKind(sessionModel.sessionProperties.debugKind.valueOrNull),
                project = env.project
            )
        }
    }
}
