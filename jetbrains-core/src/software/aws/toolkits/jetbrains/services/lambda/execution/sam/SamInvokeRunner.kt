// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.configurations.RunProfile
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.configurations.RunnerSettings
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.runners.AsyncProgramRunner
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.RunContentBuilder
import com.intellij.execution.ui.RunContentDescriptor
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.psi.PsiFile
import com.intellij.xdebugger.XDebuggerManager
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import software.aws.toolkits.jetbrains.services.lambda.LambdaDebugger
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackager
import java.net.ServerSocket

class SamInvokeRunner : AsyncProgramRunner<RunnerSettings>() {
    override fun getRunnerId(): String = "SamInvokeRunner"

    override fun canRun(executorId: String, profile: RunProfile): Boolean {
        return profile is SamRunConfiguration &&
                (DefaultRunExecutor.EXECUTOR_ID == executorId || DefaultDebugExecutor.EXECUTOR_ID == executorId)
    }

    override fun execute(environment: ExecutionEnvironment, state: RunProfileState): Promise<RunContentDescriptor?> {
        val buildingPromise = AsyncPromise<RunContentDescriptor>()
        val samState = state as SamRunningState
        val psiFile = samState.settings.handlerElement.containingFile
        val module = getModule(psiFile)
        val runner = if (environment.executor.id == DefaultDebugExecutor.EXECUTOR_ID) {
            SamDebugger()
        } else {
            SamRunner()
        }

        samState.runner = runner

        if (requiresCompilation(samState)) {
            val packager = LambdaPackager.getInstance(state.settings.runtimeGroup)
            packager.createPackage(module, psiFile)
                .thenAccept {
                    samState.codeLocation = it.toString()
                    buildingPromise.setResult(runner.run(environment, samState))
                }
                .exceptionally { buildingPromise.setError(it); null }
        } else {
            samState.codeLocation = moduleContentRoot(module)
            buildingPromise.setResult(runner.run(environment, samState))
        }

        return buildingPromise
    }

    private fun moduleContentRoot(module: Module): String =
        ModuleRootManager.getInstance(module).contentRoots.getOrElse(0) {
            throw IllegalStateException("Failed to get content root entry for $module")
        }.path

    private fun requiresCompilation(state: SamRunningState): Boolean = state.settings.runtimeGroup.requiresCompilation

    private fun getModule(psiFile: PsiFile): Module = ModuleUtil.findModuleForFile(psiFile)
            ?: throw java.lang.IllegalStateException("Failed to locate module for $psiFile")

    internal open inner class SamRunner {
        open fun patchSamCommand(state: SamRunningState, commandLine: GeneralCommandLine) {}

        open fun run(environment: ExecutionEnvironment, state: SamRunningState): RunContentDescriptor {
            val executionResult = state.execute(environment.executor, environment.runner)
            return RunContentBuilder(executionResult, environment).showRunContent(environment.contentToReuse)
        }
    }

    internal inner class SamDebugger : SamRunner() {
        private val debugPort = findDebugPort()

        private fun findDebugPort(): Int {
            try {
                ServerSocket(0).use {
                    it.reuseAddress = true
                    return it.localPort
                }
            } catch (e: Exception) {
                throw IllegalStateException("Failed to find free port", e)
            }
        }

        override fun patchSamCommand(state: SamRunningState, commandLine: GeneralCommandLine) {
            commandLine.withParameters("--debug-port")
                .withParameters(debugPort.toString())
        }

        override fun run(environment: ExecutionEnvironment, state: SamRunningState): RunContentDescriptor {
            val lambdaDebugger = LambdaDebugger.getInstance(state.settings.runtimeGroup)
            val debugProcess = lambdaDebugger.createDebugProcess(environment, state, debugPort)
            val debugManager = XDebuggerManager.getInstance(environment.project)

            return debugProcess?.let {
                debugManager.startSession(environment, debugProcess).runContentDescriptor
            } ?: throw IllegalStateException("Failed to create debug process")
        }
    }
}