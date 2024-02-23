// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.configurations.RunProfile
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.configurations.RunnerSettings
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.runners.AsyncProgramRunner
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.RunContentBuilder
import com.intellij.execution.ui.RunContentDescriptor
import com.intellij.openapi.fileEditor.FileDocumentManager
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import org.slf4j.event.Level
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.lambda.validOrNull
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.services.lambda.execution.local.LocalLambdaRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import java.io.File

class SamInvokeRunner : AsyncProgramRunner<RunnerSettings>() {
    override fun getRunnerId(): String = "SamInvokeRunner"

    override fun canRun(executorId: String, profile: RunProfile): Boolean {
        if (profile !is LocalLambdaRunConfiguration) {
            return false
        }

        if (DefaultRunExecutor.EXECUTOR_ID == executorId) {
            // Always true so that the run icon is shown, error is then told to user that runtime doesnt work
            return true
        }

        if (DefaultDebugExecutor.EXECUTOR_ID != executorId) {
            // Only support debugging if it is the default executor
            return false
        }

        val runtimeValue = if (profile.isUsingTemplate() && !profile.isImage) {
            LOG.tryOrNull("Failed to get runtime of ${profile.logicalId()}", Level.WARN) {
                SamTemplateUtils.findZipFunctionsFromTemplate(profile.project, File(profile.templateFile()))
                    .find { it.logicalName == profile.logicalId() }
                    ?.runtime()
                    ?.let {
                        Runtime.fromValue(it)?.validOrNull
                    }
            }
        } else if (!profile.isImage) {
            profile.runtime()?.toSdkRuntime()
        } else {
            null
        }
        val runtimeGroup = runtimeValue?.runtimeGroup

        val canRunRuntime = runtimeGroup != null &&
            RuntimeDebugSupport.supportedRuntimeGroups().contains(runtimeGroup) &&
            RuntimeDebugSupport.getInstanceOrNull(runtimeGroup)?.isSupported(runtimeValue) ?: false
        val canRunImage = profile.isImage && profile.imageDebugger() != null

        return canRunRuntime || canRunImage
    }

    override fun execute(environment: ExecutionEnvironment, state: RunProfileState): Promise<RunContentDescriptor?> {
        val runPromise = AsyncPromise<RunContentDescriptor?>()
        FileDocumentManager.getInstance().saveAllDocuments()
        val runContentDescriptor = state.execute(environment.executor, this)?.let {
            RunContentBuilder(it, environment).showRunContent(environment.contentToReuse)
        }

        runPromise.setResult(runContentDescriptor)

        return runPromise
    }

    private companion object {
        val LOG = getLogger<SamInvokeRunner>()
    }
}
