// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.util.io.exists
import com.intellij.util.io.isDirectory
import com.intellij.util.io.outputStream
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import software.aws.toolkits.core.utils.deleteIfExists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.services.s3.objectActions.DownloadObjectAction.ConflictResolution.OVERWRITE
import software.aws.toolkits.jetbrains.services.s3.objectActions.DownloadObjectAction.ConflictResolution.OVERWRITE_ALL
import software.aws.toolkits.jetbrains.services.s3.objectActions.DownloadObjectAction.ConflictResolution.SKIP
import software.aws.toolkits.jetbrains.services.s3.objectActions.DownloadObjectAction.ConflictResolution.SKIP_ALL
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.S3Telemetry
import java.nio.file.Path
import java.nio.file.Paths

// TODO: Cant replace the file chooser service until newer IDE version, switch to ServiceContainerUtil to use a fake file chooser instead of
// fileDownloadBackDoor example:
// https://github.com/JetBrains/intellij-community/blob/54e4a2ad3b73973b3123c87d48749cc0ff36c4cd/platform/external-system-impl/testSrc/com/intellij/openapi/externalSystem/importing/ExternalSystemSetupProjectTestCase.kt#L102 FIX_WHEN_MIN_IS_193
class DownloadObjectAction @JvmOverloads constructor(private val project: Project, treeTable: S3TreeTable, private val fileDownloadBackDoor: Path? = null) :
    S3ObjectAction(treeTable, message("s3.download.object.action"), AllIcons.Actions.Download) {

    private data class DownloadInfo(val s3Object: String, val diskLocation: Path)
    enum class ConflictResolution(val message: String) {
        SKIP(message("s3.download.object.conflict.skip")),
        OVERWRITE(message("s3.download.object.conflict.overwrite")),
        SKIP_ALL(message("s3.download.object.conflict.skip_rest")),
        OVERWRITE_ALL(message("s3.download.object.conflict.overwrite_rest"));

        companion object {
            val SINGLE_FILE_RESOLUTIONS by lazy {
                listOf(SKIP, OVERWRITE)
            }

            val MULTIPLE_FILE_RESOLUTIONS by lazy {
                listOf(SKIP, OVERWRITE, SKIP_ALL, OVERWRITE_ALL)
            }
        }
    }

    private val bucket = treeTable.bucket

    override fun enabled(nodes: List<S3TreeNode>): Boolean = nodes.all { it is S3TreeObjectNode }

    override fun performAction(nodes: List<S3TreeNode>) {
        val files = nodes.filterIsInstance<S3TreeObjectNode>()
        when (files.size) {
            1 -> downloadSingle(project, files.first())
            else -> downloadMultiple(project, files)
        }
    }

    private fun downloadSingle(project: Project, file: S3TreeObjectNode) {
        val selectedLocation = getDownloadLocation(foldersOnly = false) ?: return

        val destinationFile = if (selectedLocation.isDirectory()) {
            selectedLocation.resolve(file.name)
        } else {
            selectedLocation
        }

        val downloads = listOf(DownloadInfo(file.key, destinationFile))

        val finalDownloads = if (selectedLocation.isDirectory()) {
            checkForConflicts(destinationFile, downloads)
        } else {
            // If user has requested a single file as their destination, presume they want to overwrite it
            downloads
        }

        downloadAll(project, finalDownloads)
    }

    private fun downloadMultiple(project: Project, files: List<S3TreeObjectNode>) {
        val selectedLocation = getDownloadLocation(foldersOnly = true) ?: return

        val downloads = files.map { DownloadInfo(it.key, selectedLocation.resolve(it.name)) }
        val finalDownloads = checkForConflicts(selectedLocation, downloads)

        downloadAll(project, finalDownloads)
    }

    private fun getDownloadLocation(foldersOnly: Boolean): Path? {
        fileDownloadBackDoor?.let {
            return it
        }

        val baseDir = VfsUtil.getUserHomeDir()

        val descriptor = if (foldersOnly) {
            FileChooserDescriptorFactory.createSingleFolderDescriptor().also {
                it.description = message("s3.download.object.browse.description.multiple")
            }
        } else {
            FileChooserDescriptorFactory.createSingleFileOrFolderDescriptor().also {
                it.description = message("s3.download.object.browse.description.single")
            }
        }

        descriptor.title = message("s3.download.object.browse.title")

        // In order to prevent a confusing UX around when we can have folders and not, force the non native chooser
        descriptor.isForcedToUseIdeaFileChooser = true

        return FileChooser.chooseFile(descriptor, project, baseDir)?.path?.let {
            Paths.get(it)
        }
    }

    private fun checkForConflicts(targetDirectory: Path, downloads: List<DownloadInfo>): List<DownloadInfo> {
        val finalDownloads = mutableListOf<DownloadInfo>()
        var skipAll = false

        for ((index, download) in downloads.withIndex()) {
            if (!download.diskLocation.exists()) {
                finalDownloads.add(download)
                continue
            }

            if (skipAll) {
                continue
            }

            val resolution = promptForConflictResolution(targetDirectory, download, downloads)
            if (resolution == SKIP) {
                LOG.info { "User requested skipping $download" }
            } else if (resolution == OVERWRITE) {
                finalDownloads.add(download)
            } else if (resolution == SKIP_ALL) {
                LOG.info { "User requested skipping rest of the files" }
                skipAll = true
            } else if (resolution == OVERWRITE_ALL) {
                finalDownloads.addAll(downloads.drop(index))
                break
            }
        }

        return finalDownloads
    }

    private fun promptForConflictResolution(
        targetDirectory: Path,
        download: DownloadInfo,
        files: List<DownloadInfo>
    ): ConflictResolution {
        val description = message(
            "s3.download.object.conflict.description",
            targetDirectory.relativize(download.diskLocation),
            targetDirectory
        )

        val options = if (files.size == 1) {
            ConflictResolution.SINGLE_FILE_RESOLUTIONS
        } else {
            ConflictResolution.MULTIPLE_FILE_RESOLUTIONS
        }

        val choiceNum = Messages.showDialog(
            project,
            description,
            message("s3.download.object.action"),
            options.map { it.message }.toTypedArray(),
            0,
            Messages.getQuestionIcon()
        )

        return if (choiceNum < 0) {
            SKIP
        } else {
            options[choiceNum]
        }
    }

    private fun downloadAll(project: Project, files: List<DownloadInfo>) {
        // TODO: Get off global scope
        GlobalScope.launch {
            try {
                files.forEach { (key, output) ->
                    try {
                        // TODO: Create 1 progress indicator for all files and pass it in
                        output.outputStream().use {
                            bucket.download(project, key, it)
                        }
                    } catch (e: Exception) {
                        e.notifyError(message("s3.download.object.failed", key))
                        output.deleteIfExists()
                        throw e
                    }
                }
                S3Telemetry.downloadObjects(project, success = true, value = files.size.toDouble())
            } catch (e: Exception) {
                S3Telemetry.downloadObjects(project, success = true, value = files.size.toDouble())
            }
        }
    }

    private companion object {
        val LOG = getLogger<DownloadObjectAction>()
    }
}
