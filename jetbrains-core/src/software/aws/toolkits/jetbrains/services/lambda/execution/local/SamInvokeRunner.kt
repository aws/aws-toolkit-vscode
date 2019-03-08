// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

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
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleUtil
import com.intellij.psi.PsiFile
import com.intellij.xdebugger.XDebuggerManager
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.services.lambda.validOrNull
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import java.io.File
import java.net.ServerSocket
import java.nio.file.Paths

class SamInvokeRunner : AsyncProgramRunner<RunnerSettings>() {
    override fun getRunnerId(): String = "SamInvokeRunner"

    override fun canRun(executorId: String, profile: RunProfile): Boolean {
        if (profile !is LocalLambdaRunConfiguration) {
            return false
        }

        if (DefaultRunExecutor.EXECUTOR_ID == executorId) {
            return true // Always true so that the run icon is shown, error is then told to user that runtime doesnt work
        }

        // Requires SamDebugSupport too
        if (DefaultDebugExecutor.EXECUTOR_ID == executorId) {
            val runtimeValue = if (profile.isUsingTemplate()) {
                SamTemplateUtils.findFunctionsFromTemplate(profile.project, File(profile.templateFile()))
                    .find { it.logicalName == profile.logicalId() }
                    ?.runtime()
                    ?.let {
                        Runtime.fromValue(it)?.validOrNull
                    }
            } else {
                profile.runtime()
            }

            val runtimeGroup = runtimeValue?.runtimeGroup

            return SamDebugSupport.supportedRuntimeGroups.contains(runtimeGroup)
        }

        return false
    }

    override fun execute(environment: ExecutionEnvironment, state: RunProfileState): Promise<RunContentDescriptor?> {
        val validationMessage = SamCommon.validate()
        if (validationMessage != null) {
            throw IllegalStateException(validationMessage)
        }

        FileDocumentManager.getInstance().saveAllDocuments()

        val buildingPromise = AsyncPromise<RunContentDescriptor>()
        val samState = state as SamRunningState
        val psiFile = samState.settings.handlerElement.containingFile
        val module = getModule(psiFile)
        val runner = if (environment.isDebug()) {
            SamDebugger()
        } else {
            SamRunner()
        }

        samState.runner = runner

        val runConfigSettings = samState.settings

        val packager = LambdaBuilder.getInstanceOrThrow(runConfigSettings.runtimeGroup)
        val buildResult = runConfigSettings.templateDetails?.templateFile?.let {
            packager.buildLambdaFromTemplate(
                module,
                Paths.get(it),
                runConfigSettings.templateDetails.logicalName,
                runConfigSettings.samOptions
            )
        } ?: packager.buildLambda(
            module,
            runConfigSettings.handlerElement,
            runConfigSettings.handler,
            runConfigSettings.runtime,
            runConfigSettings.environmentVariables,
            runConfigSettings.samOptions
        )

        buildResult.thenAccept {
                runInEdt {
                    samState.builtLambda = it
                    buildingPromise.setResult(runner.run(environment, samState))
                }
            }.exceptionally {
                LOG.warn(it) { "Failed to create Lambda package" }
                buildingPromise.setError(it)
                throw it
            }.whenComplete { _, exception ->
                TelemetryService.getInstance().record("SamInvoke") {
                    val type = if (environment.isDebug()) "Debug" else "Run"
                    datum(type) {
                        count()
                        // exception can be null but is not annotated as nullable
                        metadata("hasException", exception != null)
                        metadata("runtime", runConfigSettings.runtime.name)
                        metadata("samVersion", SamCommon.getVersionString())
                        metadata("templateBased", runConfigSettings.templateDetails?.templateFile != null)
                    }
                }
            }

        return buildingPromise
    }

    private fun getModule(psiFile: PsiFile): Module = ModuleUtil.findModuleForFile(psiFile)
            ?: throw java.lang.IllegalStateException("Failed to locate module for $psiFile")

    private companion object {
        val LOG = getLogger<SamInvokeRunner>()
    }
}

internal open class SamRunner {
    open fun patchCommandLine(state: SamRunningState, commandLine: GeneralCommandLine) {}

    open fun run(environment: ExecutionEnvironment, state: SamRunningState): RunContentDescriptor {
        val executionResult = state.execute(environment.executor, environment.runner)

        return RunContentBuilder(executionResult, environment).showRunContent(environment.contentToReuse)
    }
}

fun ExecutionEnvironment.isDebug(): Boolean = (executor.id == DefaultDebugExecutor.EXECUTOR_ID)

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