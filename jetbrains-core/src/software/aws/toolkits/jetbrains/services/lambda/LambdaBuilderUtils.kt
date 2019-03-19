// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.build.BuildProgressListener
import com.intellij.build.BuildViewManager
import com.intellij.build.DefaultBuildDescriptor
import com.intellij.build.events.impl.FailureResultImpl
import com.intellij.build.events.impl.FinishBuildEventImpl
import com.intellij.build.events.impl.OutputBuildEventImpl
import com.intellij.build.events.impl.StartBuildEventImpl
import com.intellij.build.events.impl.SuccessResultImpl
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessListener
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.module.Module
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.util.Key
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

object LambdaBuilderUtils {
    fun buildAndReport(
        module: Module,
        runtimeGroup: RuntimeGroup,
        request: BuildLambdaRequest
    ): CompletionStage<BuiltLambda> {
        val future = CompletableFuture<BuiltLambda>()
        val project = module.project

        val buildViewManager = ServiceManager.getService(project, BuildViewManager::class.java)
        val workingDir = ModuleRootManager.getInstance(module).contentRoots.getOrNull(0)?.path ?: ""

        runInEdt(ModalityState.NON_MODAL) {
            val descriptor = DefaultBuildDescriptor(request, message("sam.build.title"), workingDir, System.currentTimeMillis())
            buildViewManager.onEvent(StartBuildEventImpl(descriptor, message("sam.build.title")))

            // TODO: Make cancellable
            object : Task.Backgroundable(module.project, message("sam.build.running"), false) {
                // This call needs to block so the progress bar is alive the entire time
                override fun run(indicator: ProgressIndicator) {
                    // TODO: Flatten futures by making LambdaBuilder not return completable future
                    runSamBuild(
                        module,
                        runtimeGroup,
                        request,
                        BuildProcessListener(
                            request,
                            buildViewManager
                        )
                    )
                        .handle { builtLambda, error ->
                            error?.let {
                                future.completeExceptionally(error)
                            } ?: future.complete(builtLambda)
                        }
                        .toCompletableFuture().get()
                }

                override fun shouldStartInBackground(): Boolean = true
            }.queue()
        }

        return future
    }

    private fun runSamBuild(
        module: Module,
        runtimeGroup: RuntimeGroup,
        request: BuildLambdaRequest,
        processListener: ProcessListener
    ): CompletionStage<BuiltLambda> {
        val lambdaBuilder = LambdaBuilder.getInstanceOrThrow(runtimeGroup)

        return when (request) {
            is BuildLambdaFromTemplate -> {
                lambdaBuilder.buildLambdaFromTemplate(
                    module,
                    request.templateLocation,
                    request.logicalId,
                    request.samOptions
                ) { it.addProcessListener(processListener) }
            }
            is BuildLambdaFromHandler -> {
                lambdaBuilder.buildLambda(
                    module,
                    request.handlerElement,
                    request.handler,
                    request.runtime,
                    request.envVars,
                    request.samOptions
                ) { it.addProcessListener(processListener) }
            }
        }
    }

    private class BuildProcessListener(
        private val request: BuildLambdaRequest,
        private val progressListener: BuildProgressListener
    ) : ProcessAdapter() {

        override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
            val stdError = outputType == ProcessOutputTypes.STDERR
            progressListener.onEvent(OutputBuildEventImpl(request, event.text, !stdError))
        }

        override fun processTerminated(event: ProcessEvent) {
            val buildEvent = if (event.exitCode == 0) {
                FinishBuildEventImpl(
                    request,
                    null,
                    System.currentTimeMillis(),
                    message("sam.build.succeeded"),
                    SuccessResultImpl()
                )
            } else {
                FinishBuildEventImpl(
                    request,
                    null,
                    System.currentTimeMillis(),
                    message("sam.build.failed"),
                    FailureResultImpl(IllegalStateException(message("sam.build.failed")))
                )
            }

            progressListener.onEvent(buildEvent)
        }
    }
}