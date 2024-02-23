// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.remoteDev.caws

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.application.runWriteActionAndWait
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.ui.MessageDialogBuilder
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileManager
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.credentials.sono.lazilyGetUserId
import software.aws.toolkits.jetbrains.services.caws.CawsConstants
import software.aws.toolkits.jetbrains.services.caws.envclient.CawsEnvironmentClient
import software.aws.toolkits.jetbrains.services.caws.envclient.models.StartDevfileRequest
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodecatalystTelemetry
import java.nio.file.Path
import java.nio.file.Paths
import software.aws.toolkits.telemetry.Result as TelemetryResult

class UpdateDevfileAction : AnAction() {
    private val devfileYamlRegex = CawsConstants.DEVFILE_YAML_NAME

    override fun actionPerformed(e: AnActionEvent) {
        if (MessageDialogBuilder.yesNo(
                message("caws.update_devfile_title"),
                message("caws.update_devfile")
            ).ask(e.project)
        ) {
            ProgressManager.getInstance().run(
                object : Task.Modal(
                    e.project,
                    message("caws.updating_devfile"),
                    false
                ) {
                    override fun run(indicator: ProgressIndicator) {
                        val projectsDir = Paths.get(CawsConstants.CAWS_ENV_PROJECT_DIR)

                        val filePath = runReadAction {
                            getFilePathForDevfile()
                        }

                        runWriteActionAndWait {
                            FileDocumentManager.getInstance().saveAllDocuments()
                        }

                        // MDE Devfile start API currently expects a relative path to the Devfile
                        val relativePath: String = projectsDir.relativize(filePath).toString()

                        val request = StartDevfileRequest(
                            location = relativePath,
                            recreateHomeVolumes = true
                        )
                        try {
                            CawsEnvironmentClient.getInstance().startDevfile(request)
                            // no metric here because the environment restarts if this succeeds
                        } catch (e: Exception) {
                            LOG.error(e) { "Exception thrown while trying to update Devfile from $filePath" }
                            notifyError(
                                project = project,
                                content = message("caws.update_devfile.failed")
                            )
                            CodecatalystTelemetry.updateDevfile(
                                project = null,
                                userId = lazilyGetUserId(),
                                result = TelemetryResult.Failed
                            )
                        }
                    }

                    override fun onSuccess() {
                        DevfileWatcher.getInstance().updatedDevfile(hasFileChanged = false)
                    }

                    override fun onThrowable(error: Throwable) {
                        throw IllegalStateException(error.message)
                    }
                }
            )
        }
    }

    override fun update(e: AnActionEvent) {
        val envVar = System.getenv(CawsConstants.CAWS_ENV_ID_VAR)
        val virtualFile = e.getData(PlatformDataKeys.VIRTUAL_FILE)
        e.presentation.isVisible = virtualFile?.name == devfileYamlRegex && envVar != null
    }

    override fun displayTextInToolbar() = true

    // TODO: What if there are multiple devfile.yaml files in the project?
    private fun getFilePathForDevfile(): Path = getFile()?.toNioPath() ?: error("Could not locate devfile")

    private fun getFile(): VirtualFile? = try {
        val devfileLocation = CawsEnvironmentClient.getInstance().getStatus().location ?: "devfile.yaml"
        // The path returned by getStatus() is relative to /projects
        val devfilePath = VirtualFileManager.getInstance().findFileByNioPath(
            Path.of("${CawsConstants.CAWS_ENV_PROJECT_DIR}/$devfileLocation")
        )
        devfilePath
    } catch (e: Exception) {
        throw IllegalStateException(e.message)
    }

    private companion object {
        val LOG = getLogger<UpdateDevfileAction>()
    }
}
