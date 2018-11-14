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
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleUtil
import com.intellij.psi.PsiFile
import com.intellij.xdebugger.XDebuggerManager
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackager
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import java.net.ServerSocket

class SamInvokeRunner : AsyncProgramRunner<RunnerSettings>() {
    override fun getRunnerId(): String = "SamInvokeRunner"

    override fun canRun(executorId: String, profile: RunProfile): Boolean {
        if (profile !is SamRunConfiguration) {
            return false
        }

        // Only requires LambdaPackager support, which is implicit based on the UI
        if (DefaultRunExecutor.EXECUTOR_ID == executorId) {
            return true
        }

        // Requires SamDebugSupport too
        if (DefaultDebugExecutor.EXECUTOR_ID == executorId) {
            profile.settings.runtime?.let {
                return SamDebugSupport.supportedRuntimeGroups.contains(Runtime.fromValue(it).runtimeGroup)
            }
        }

        return false
    }

    override fun execute(environment: ExecutionEnvironment, state: RunProfileState): Promise<RunContentDescriptor?> {
        val validationMessage = SamCommon.validate()
        if (validationMessage != null) {
            throw IllegalStateException(validationMessage)
        }
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

        val packager = LambdaPackager.getInstanceOrThrow(state.settings.runtimeGroup)
        packager.createPackage(module, psiFile)
            .thenAccept {
                runInEdt {
                    samState.lambdaPackage = it
                    buildingPromise.setResult(runner.run(environment, samState))
                }
            }
            .exceptionally {
                LOG.warn("Failed to create Lambda package", it)
                buildingPromise.setError(it)
                null
            }

        return buildingPromise
    }

    private fun getModule(psiFile: PsiFile): Module = ModuleUtil.findModuleForFile(psiFile)
            ?: throw java.lang.IllegalStateException("Failed to locate module for $psiFile")

    private companion object {
        val LOG = Logger.getInstance(SamInvokeRunner::class.java)
    }
}

internal open class SamRunner {
    open fun patchCommandLine(state: SamRunningState, commandLine: GeneralCommandLine) {}

    open fun run(environment: ExecutionEnvironment, state: SamRunningState): RunContentDescriptor {
        val executionResult = state.execute(environment.executor, environment.runner)

        return RunContentBuilder(executionResult, environment).showRunContent(environment.contentToReuse)
    }
}

internal class SamDebugger : SamRunner() {
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

    override fun patchCommandLine(state: SamRunningState, commandLine: GeneralCommandLine) {
        SamDebugSupport.getInstanceOrThrow(state.settings.runtimeGroup)
            .patchCommandLine(debugPort, state, commandLine)
    }

    override fun run(environment: ExecutionEnvironment, state: SamRunningState): RunContentDescriptor {
        val debugSupport = SamDebugSupport.getInstanceOrThrow(state.settings.runtimeGroup)
        val debugProcess = debugSupport.createDebugProcess(environment, state, debugPort)
        val debugManager = XDebuggerManager.getInstance(environment.project)
        return debugProcess?.let {
            return debugManager.startSession(environment, debugProcess).runContentDescriptor
        } ?: throw IllegalStateException("Failed to create debug process")
    }
}