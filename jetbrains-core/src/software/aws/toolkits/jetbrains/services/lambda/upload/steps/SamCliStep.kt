// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload.steps

import com.intellij.execution.configurations.GeneralCommandLine
import kotlinx.coroutines.future.await
import kotlinx.coroutines.runBlocking
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutable
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.utils.execution.steps.CliBasedStep

abstract class SamCliStep : CliBasedStep() {
    protected fun getCli(): GeneralCommandLine {
        val executable = runBlocking {
            ExecutableManager.getInstance().getExecutable<SamExecutable>().await()
        }
        val samExecutable = when (executable) {
            is ExecutableInstance.Executable -> executable
            else -> {
                throw RuntimeException((executable as? ExecutableInstance.BadExecutable)?.validationError ?: "")
            }
        }

        return samExecutable.getCommandLine()
    }
}
