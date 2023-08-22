// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.wizard

import com.fasterxml.jackson.module.kotlin.convertValue
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutable
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.services.lambda.sam.samInitCommand
import software.aws.toolkits.jetbrains.services.schemas.SchemaTemplateParameters
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.SamTelemetry

object SamInitRunner {
    private val LOG = getLogger<SamInitRunner>()

    fun execute(
        outputDir: VirtualFile,
        templateParameters: TemplateParameters,
        schemaParameters: SchemaTemplateParameters?
    ) {
        // set output to a temp dir
        val tempDir = createTempDir()

        ExecutableManager.getInstance().getExecutable<SamExecutable>().thenApply {
            val samExecutable = when (it) {
                is ExecutableInstance.Executable -> it
                else -> {
                    SamTelemetry.init(
                        result = Result.Failed,
                        reason = "InvalidSamCli"
                    )
                    throw RuntimeException((it as? ExecutableInstance.BadExecutable)?.validationError)
                }
            }

            val extraContent = if (schemaParameters?.templateExtraContext != null) {
                jacksonObjectMapper().convertValue<Map<String, String>>(schemaParameters.templateExtraContext)
            } else {
                emptyMap()
            }

            val commandLine = samExecutable.getCommandLine().samInitCommand(
                tempDir.toPath(),
                templateParameters,
                extraContent
            )

            LOG.info { "Running SAM command ${commandLine.commandLineString}" }

            val process = CapturingProcessHandler(commandLine).runProcess()
            if (process.exitCode != 0) {
                throw RuntimeException("${message("sam.init.execution_error")}: ${process.stderrLines}")
            } else {
                LOG.info { "SAM init output stdout:\n${process.stdout}" }
                LOG.info { "SAM init output stderr:\n${process.stderr}" }
            }

            val subFolders = tempDir.listFiles()?.toList() ?: emptyList()

            assert(subFolders.size == 1 && subFolders.first().isDirectory) {
                message("sam.init.error.subfolder_not_one", tempDir.name)
            }

            FileUtil.copyDirContent(subFolders.first(), VfsUtil.virtualToIoFile(outputDir))
            FileUtil.delete(tempDir)
        }.toCompletableFuture().join()
    }
}
