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
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.module.Module
import com.intellij.openapi.progress.PerformInBackgroundOption
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.util.Key
import software.aws.toolkits.resources.message
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

object LambdaBuilderUtils {
    fun buildAndReport(
        module: Module,
        runtimeGroup: RuntimeGroup,
        request: BuildLambdaRequest,
        lambdaBuilder: LambdaBuilder = LambdaBuilder.getInstanceOrThrow(runtimeGroup)
    ): CompletionStage<BuiltLambda> {
        val buildViewManager = ServiceManager.getService(module.project, BuildViewManager::class.java)

        return runSamBuildInBackground(buildViewManager, module, request) {
            runSamBuild(
                lambdaBuilder,
                module,
                request,
                BuildProcessListener(request, buildViewManager)
            )
        }
    }

    fun packageAndReport(
        module: Module,
        runtimeGroup: RuntimeGroup,
        request: PackageLambdaFromHandler,
        lambdaBuilder: LambdaBuilder = LambdaBuilder.getInstanceOrThrow(runtimeGroup)
    ): CompletionStage<Path> {
        val buildViewManager = ServiceManager.getService(module.project, BuildViewManager::class.java)

        return runSamBuildInBackground(buildViewManager, module, request) {
            lambdaBuilder.packageLambda(
                module,
                request.handlerElement,
                request.handler,
                request.runtime,
                request.samOptions
            ) { it.addProcessListener(BuildProcessListener(request, buildViewManager)) }
        }
    }

    private inline fun <T> runSamBuildInBackground(
        buildViewManager: BuildViewManager,
        module: Module,
        request: Any,
        crossinline task: () -> T
    ): CompletionStage<T> {
        val future = CompletableFuture<T>()

        try {
            val project = module.project

            val workingDir = ModuleRootManager.getInstance(module).contentRoots.getOrNull(0)?.path ?: ""
            val descriptor = DefaultBuildDescriptor(
                request,
                message("sam.build.title"),
                workingDir,
                System.currentTimeMillis()
            )

            buildViewManager.onEvent(request, StartBuildEventImpl(descriptor, message("sam.build.title")))

            // TODO: Make cancellable
            ProgressManager.getInstance().run(
                object : Task.Backgroundable(
                    project,
                    message("sam.build.running"),
                    false,
                    PerformInBackgroundOption.ALWAYS_BACKGROUND
                ) {
                    // This call needs to block so the progress bar is alive the entire time
                    override fun run(indicator: ProgressIndicator) {
                        try {
                            future.complete(task.invoke())
                        } catch (e: Throwable) {
                            future.completeExceptionally(e)
                        }
                    }
                }
            )
        } catch (e: Exception) {
            future.completeExceptionally(e)
        }

        return future
    }

    private fun runSamBuild(
        lambdaBuilder: LambdaBuilder,
        module: Module,
        request: BuildLambdaRequest,
        processListener: ProcessListener
    ): BuiltLambda = when (request) {
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
                request.timeout,
                request.memorySize,
                request.envVars,
                request.samOptions
            ) { it.addProcessListener(processListener) }
        }
    }

    private class BuildProcessListener(
        private val request: Any,
        private val progressListener: BuildProgressListener
    ) : ProcessAdapter() {

        override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
            val stdError = outputType == ProcessOutputTypes.STDERR
            progressListener.onEvent(request, OutputBuildEventImpl(request, event.text, !stdError))
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

            progressListener.onEvent(request, buildEvent)
        }
    }
}
