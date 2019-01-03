// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.resources.message

class SamInitRunner(
    private val name: String,
    private val outputDir: VirtualFile,
    private val runtime: Runtime,
    private val location: String? = null
) {
    fun execute() = ApplicationManager.getApplication().runWriteAction {
        // set output to a temp dir
        val tempDir = LocalFileSystem.getInstance().findFileByIoFile(createTempDir())
                ?: throw RuntimeException("Cannot create temp file")
        val commandLine = SamCommon.getSamCommandLine()
                .withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE)
                .withParameters("init")
                .withParameters("--no-input")
                .withParameters("--name")
                .withParameters(name)
                .withParameters("--runtime")
                .withParameters(runtime.toString()).withParameters("--output-dir")
                .withParameters(tempDir.path)
                .apply {
                    if (location != null) {
                        this.withParameters("--location")
                                .withParameters(location)
                    }
                }
        // run
        val process = CapturingProcessHandler(commandLine).runProcess()
        if (process.exitCode != 0) {
            throw RuntimeException("${message("sam.init.execution_error")}: ${process.stderrLines.last()}")
        }

        val samOutput = VfsUtil.getChildren(tempDir)[0]
        // copy from temp dir to output dir
        VfsUtil.copyDirectory(null, samOutput, outputDir, null)
    }
}