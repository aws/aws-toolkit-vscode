// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.io.FileUtil
import com.jetbrains.rd.framework.RdTaskResult
import com.jetbrains.rdclient.protocol.IPermittedModalities
import com.jetbrains.rider.model.AwsProjectOutputRequest
import com.jetbrains.rider.model.awsProjectModel
import com.jetbrains.rider.projectView.solution
import com.jetbrains.rider.util.idea.lifetime
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.ecs.execution.ArtifactMapping
import java.io.File

class DotNetStartupCommand : CloudDebugStartupCommand(CloudDebuggingPlatform.DOTNET) {

    companion object {
        private val logger = getLogger<DotNetStartupCommand>()
        private const val STARTUP_COMMAND_HINT_TEXT = "Example: dotnet /path/to/assembly.dll"
    }

    override val isStartCommandAutoFillSupported: Boolean
        get() = true

    override fun updateStartupCommand(
        project: Project,
        originalCommand: String,
        artifact: ArtifactMapping,
        onCommandGet: (String) -> Unit
    ) {
        val model = project.solution.awsProjectModel

        val localPath = artifact.localPath
        val remotePath = artifact.remotePath
        if (localPath == null || remotePath == null) {
            logger.warn { "Local or remote path is empty in an artifacts mapping. Return the original startup command: '$originalCommand'." }
            onCommandGet(originalCommand)
            return
        }

        val localFile = File(localPath)
        val localBaseFile =
            if (localFile.isFile) localFile.parentFile
            else localFile

        val remoteFile = File(remotePath)
        val remoteBaseFile =
            if (remoteFile.isFile) {
                logger.info { "Remote path is set file in Artifacts mapping table: '$remotePath'. Take base path." }
                remoteFile.parentFile
            } else
                remoteFile

        // We make a protocol call to get an information about project output and assembly. This call is started on AWT thread with modality of current
        // run configuration dialog. The response is back on AWS message queue When call is completed. So, a protocol handler is waiting for a
        // run configuration dialog to be closed to process the handler. Here, we should allow pumping protocol queue with current run configuration modality
        // to get a response back while run config is opened.
        //
        // Note: This is better to allow pumping for a specific component using [PermittedModalitiesImpl#allowPumpProtocolForComponent] API,
        //       but for a particular case we are safe to use a call that use current modality since we are in the same run config context.
        IPermittedModalities.getInstance().allowPumpProtocolUnderCurrentModality()

        // TODO: We are trying to get assembly info for a project based on local path that we define in an Artifacts Mapping table.
        //       This should work fine if specified path is related to any project inside a current solution.
        //       One of the edge case here might be when a user specify a Local Path to a directory that is unrelated to a solution.
        //       In that case we are not able to get any information about an assembly.
        //       Alternatively, we could add a ComboBox with ability to select a Project for a run configuration and explicitly specify it when run.
        model.getProjectOutput.start(AwsProjectOutputRequest(localPath)).result.advise(project.lifetime) { result ->
            when (result) {
                is RdTaskResult.Success -> {
                    val assemblyInfo = result.value

                    val assemblyFile = File(assemblyInfo.location)
                    val basePath = localBaseFile.parentFile ?: localBaseFile

                    val relativeAssemblyPath = FileUtil.getRelativePath(basePath, assemblyFile)
                    if (relativeAssemblyPath == null) {
                        logger.info { "Unable to get relative assembly path from base path: '$basePath' against assembly file: '$assemblyFile'" }
                        onCommandGet(originalCommand)
                        return@advise
                    }

                    // Path is generated from <remote_path> + <relative_assembly_path_with_basename>
                    val command = "dotnet ${remoteBaseFile.resolve(relativeAssemblyPath).invariantSeparatorsPath}"
                    logger.info { "Generate a CloudDebug startup command: '$command'." }
                    onCommandGet(command)
                }
                is RdTaskResult.Fault -> {
                    logger.info { "Error on trying to get assembly info starting with path: '${localBaseFile.canonicalPath}': ${result.error}" }
                    onCommandGet(originalCommand)
                }
                is RdTaskResult.Cancelled -> {
                    logger.info { "Unable to locate project assembly file that inside a selected artifact directory: " +
                        "'${localBaseFile.canonicalPath}'. Return original startup command: '$originalCommand'." }
                    onCommandGet(originalCommand)
                }
            }
        }
    }

    override fun getStartupCommandTextFieldHintText(): String = STARTUP_COMMAND_HINT_TEXT
}
