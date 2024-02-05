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
import com.jetbrains.rider.debugger.DotNetDebugProcess
import com.jetbrains.rider.debugger.DotNetDebugRunner
import com.jetbrains.rider.debugger.actions.utils.OptionsUtil
import com.jetbrains.rider.model.debuggerWorker.DotNetDebuggerSessionModel
import com.jetbrains.rider.run.IDebuggerOutputListener
import java.io.File

object DotNetDebuggerUtils {
    const val debuggerName = "JetBrains.Debugger.Worker.exe"

    val debuggerAssemblyFile: File = RiderEnvironment.getBundledFile(debuggerName)

    val debuggerBinDir: File = debuggerAssemblyFile.parentFile

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
                sessionLifetime,
                session,
                processHandler,
                executionConsole,
                protocol,
                sessionModel,
                fireInitializedManually,
                outputEventsListener,
                OptionsUtil.toDebugKind(sessionModel.sessionProperties.debugKind.valueOrNull),
                env.project,
                env.executionId
            )
        }
    }
}
