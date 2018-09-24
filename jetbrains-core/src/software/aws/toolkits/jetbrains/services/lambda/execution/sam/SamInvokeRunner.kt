// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.configurations.RunProfile
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.configurations.RunnerSettings
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.runners.AsyncProgramRunner
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.RunContentBuilder
import com.intellij.execution.ui.RunContentDescriptor
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.psi.PsiFile
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackager
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup

class SamInvokeRunner : AsyncProgramRunner<RunnerSettings>() {
    override fun getRunnerId(): String = "SamInvokeRunner"

    override fun canRun(executorId: String, profile: RunProfile): Boolean {
        return profile is SamRunConfiguration && DefaultRunExecutor.EXECUTOR_ID == executorId
    }

    override fun execute(environment: ExecutionEnvironment, state: RunProfileState): Promise<RunContentDescriptor?> {
        val buildingPromise = AsyncPromise<RunContentDescriptor>()
        val samState = state as SamRunningState
        val psiFile = samState.settings.handlerElement.containingFile
        val module = getModule(psiFile)

        if (requiresCompilation(samState)) {
            val packager = LambdaPackager.getInstance(runtimeGroup(samState))
            packager.createPackage(module, psiFile)
                .thenAccept {
                    samState.codeLocation = it.toString()
                    buildingPromise.setResult(executeSam(environment, samState))
                }
                .exceptionally { buildingPromise.setError(it); null }
        } else {
            samState.codeLocation = moduleContentRoot(module)
            buildingPromise.setResult(executeSam(environment, samState))
        }

        return buildingPromise
    }

    private fun moduleContentRoot(module: Module): String =
        ModuleRootManager.getInstance(module).contentRoots.getOrElse(0) {
            throw IllegalStateException("Failed to get content root entry for $module")
        }.path

    private fun requiresCompilation(state: SamRunningState): Boolean = runtimeGroup(state).requiresCompilation

    private fun runtimeGroup(state: SamRunningState): RuntimeGroup = state.settings.runtime.runtimeGroup
            ?: throw IllegalStateException("Attempting to run SAM for unsupported runtime ${state.settings.runtime}")

    private fun getModule(psiFile: PsiFile): Module = ModuleUtil.findModuleForFile(psiFile)
            ?: throw java.lang.IllegalStateException("Failed to locate module for $psiFile")

    private fun executeSam(environment: ExecutionEnvironment, state: SamRunningState): RunContentDescriptor {
        val executionResult = state.execute(environment.executor, this)
        return RunContentBuilder(executionResult, environment).showRunContent(environment.contentToReuse)
    }
}