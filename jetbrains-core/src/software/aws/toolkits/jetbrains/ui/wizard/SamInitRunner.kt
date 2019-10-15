// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.text.SemVer
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.services.lambda.TemplateParameters
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.resources.message

object SamInitRunner {
    private val LOG = getLogger<SamInitRunner>()

    fun execute(
        name: String,
        outputDir: VirtualFile,
        runtime: Runtime,
        templateParameters: TemplateParameters
    ) {
        // TODO: Remove these checks FIX_WHEN_SAM_MIN_IS_0_30
        val isSamGte30 = SemVer.parseFromText(SamCommon.getVersionString())
            ?.isGreaterOrEqualThan(0, 30, 0) ?: false

        // set output to a temp dir
        val tempDir = createTempDir()
        val commandLine = SamCommon.getSamCommandLine()
            .withParameters("init")
            .withParameters("--no-input")
            .withParameters("--output-dir")
            .withParameters(tempDir.path)
            .apply {
                when (templateParameters) {
                    is TemplateParameters.AppBasedTemplate -> {
                        this.withParameters("--name")
                            .withParameters(name)
                            .withParameters("--runtime")
                            .withParameters(runtime.toString())
                            .withParameters("--dependency-manager")
                            .withParameters(templateParameters.dependencyManager)

                        if (isSamGte30) {
                            this.withParameters("--app-template")
                                .withParameters(templateParameters.appTemplate)
                        }
                    }
                    is TemplateParameters.LocationBasedTemplate -> {
                        this.withParameters("--location")
                            .withParameters(templateParameters.location)
                    }
                }

                if (isSamGte30) {
                    this.withParameters("--no-interactive")
                }
            }

        LOG.info { "Running SAM command ${commandLine.commandLineString}" }

        val process = CapturingProcessHandler(commandLine).runProcess()
        if (process.exitCode != 0) {
            throw RuntimeException("${message("sam.init.execution_error")}: ${process.stderrLines.last()}")
        }

        val subFolders = tempDir.listFiles()

        assert(subFolders != null && subFolders.size == 1 && subFolders[0].isDirectory) {
            message("sam.init.error.subfolder_not_one", tempDir.name)
        }

        FileUtil.copyDirContent(subFolders[0], VfsUtil.virtualToIoFile(outputDir))
        FileUtil.delete(tempDir)
    }
}
