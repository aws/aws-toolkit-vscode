// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.VfsUtil
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.s3.model.NoSuchBucketException
import software.aws.toolkits.core.utils.deleteIfExists
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.outputStream
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.utils.getRequiredData
import software.aws.toolkits.jetbrains.services.s3.editor.S3EditorDataKeys
import software.aws.toolkits.jetbrains.services.s3.editor.S3Object
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectVersionNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3VirtualBucket
import software.aws.toolkits.jetbrains.services.s3.objectActions.DownloadObjectAction.ConflictResolution.OVERWRITE
import software.aws.toolkits.jetbrains.services.s3.objectActions.DownloadObjectAction.ConflictResolution.OVERWRITE_ALL
import software.aws.toolkits.jetbrains.services.s3.objectActions.DownloadObjectAction.ConflictResolution.SKIP
import software.aws.toolkits.jetbrains.services.s3.objectActions.DownloadObjectAction.ConflictResolution.SKIP_ALL
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.S3Telemetry
import java.nio.file.Path
import java.nio.file.Paths
import kotlin.io.path.isDirectory

class DownloadObjectAction :
    S3ObjectAction(message("s3.download.object.action"), AllIcons.Actions.Download) {
    private data class DownloadInfo(val sourceBucket: S3VirtualBucket, val s3Object: String, val versionId: String?, val diskLocation: Path) {
        constructor(sourceBucket: S3VirtualBucket, s3Object: S3Object, diskLocation: Path) : this(
            sourceBucket,
            s3Object.key,
            s3Object.versionId,
            diskLocation
        )
    }

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

    override fun enabled(nodes: List<S3TreeNode>): Boolean = nodes.isNotEmpty() && nodes.all { it is S3TreeObjectNode || it is S3TreeObjectVersionNode }

    override fun performAction(dataContext: DataContext, nodes: List<S3TreeNode>) {
        val files = nodes.filterIsInstance<S3Object>()
        val project = dataContext.getRequiredData(CommonDataKeys.PROJECT)
        val sourceBucket = dataContext.getRequiredData(S3EditorDataKeys.BUCKET_TABLE).bucket
        when (files.size) {
            1 -> downloadSingle(project, sourceBucket, files.first())
            else -> downloadMultiple(project, sourceBucket, files)
        }
    }

    private fun downloadSingle(project: Project, sourceBucket: S3VirtualBucket, file: S3Object) {
        val selectedLocation = getDownloadLocation(project = project, foldersOnly = false) ?: return

        val destinationFile = if (selectedLocation.isDirectory()) {
            selectedLocation.resolve(file.fileName())
        } else {
            selectedLocation
        }

        val downloads = listOf(DownloadInfo(sourceBucket, file, destinationFile))

        val finalDownloads = if (selectedLocation.isDirectory()) {
            checkForConflicts(project, destinationFile, downloads)
        } else {
            // If user has requested a single file as their destination, presume they want to overwrite it
            downloads
        }

        downloadAll(project, finalDownloads)
    }

    private fun downloadMultiple(project: Project, sourceBucket: S3VirtualBucket, files: List<S3Object>) {
        val selectedLocation = getDownloadLocation(project, foldersOnly = true) ?: return

        val downloads = files.map { DownloadInfo(sourceBucket, it, selectedLocation.resolve(it.fileName())) }
        val finalDownloads = checkForConflicts(project, selectedLocation, downloads)

        downloadAll(project, finalDownloads)
    }

    private fun getDownloadLocation(project: Project, foldersOnly: Boolean): Path? {
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

    private fun checkForConflicts(project: Project, targetDirectory: Path, downloads: List<DownloadInfo>): List<DownloadInfo> {
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

            val resolution = promptForConflictResolution(project, targetDirectory, download, downloads)
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
        project: Project,
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
        val scope = projectCoroutineScope(project)
        scope.launch {
            try {
                files.forEach {
                    try {
                        // TODO: Create 1 progress indicator for all files and pass it in
                        it.diskLocation.outputStream().use { os ->
                            it.sourceBucket.download(project, it.s3Object, it.versionId, os)
                        }
                    } catch (e: NoSuchBucketException) {
                        it.sourceBucket.handleDeletedBucket()
                    } catch (e: Exception) {
                        e.notifyError(project = project, title = message("s3.download.object.failed", it.s3Object))
                        it.diskLocation.deleteIfExists()
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
