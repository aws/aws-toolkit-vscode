// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vcs.changes.ChangeListManager
import com.intellij.openapi.vcs.changes.patch.ApplyPatchDefaultExecutor
import com.intellij.openapi.vcs.changes.patch.ApplyPatchDifferentiatedDialog
import com.intellij.openapi.vcs.changes.patch.ApplyPatchMode
import com.intellij.openapi.vcs.changes.patch.ImportToShelfExecutor
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineBgContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.services.amazonq.CODE_TRANSFORM_TROUBLESHOOT_DOC_ARTIFACT
import software.aws.toolkits.jetbrains.services.codemodernizer.client.GumbyClient
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerArtifact
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeTransformHilDownloadArtifact
import software.aws.toolkits.jetbrains.services.codemodernizer.model.DownloadFailureReason
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobId
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.getPathToHilArtifactDir
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.openTroubleshootingGuideNotificationAction
import software.aws.toolkits.jetbrains.utils.notifyStickyInfo
import software.aws.toolkits.jetbrains.utils.notifyStickyWarn
import software.aws.toolkits.resources.message
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean

data class DownloadArtifactResult(val artifact: CodeModernizerArtifact?, val zipPath: String, val errorMessage: String = "")

const val DOWNLOAD_PROXY_WILDCARD_ERROR: String = "Dangling meta character '*' near index 0"
const val DOWNLOAD_SSL_HANDSHAKE_ERROR: String = "Unable to execute HTTP request: javax.net.ssl.SSLHandshakeException"

class ArtifactHandler(private val project: Project, private val clientAdaptor: GumbyClient) {
    private val telemetry = CodeTransformTelemetryManager.getInstance(project)
    private val downloadedArtifacts = mutableMapOf<JobId, Path>()
    private val downloadedSummaries = mutableMapOf<JobId, TransformationSummary>()

    private var isCurrentlyDownloading = AtomicBoolean(false)
    internal suspend fun displayDiff(job: JobId) {
        if (isCurrentlyDownloading.get()) return
        val result = downloadArtifact(job)
        if (result.artifact == null) {
            notifyUnableToApplyPatch(result.zipPath, result.errorMessage)
        } else {
            displayDiffUsingPatch(result.artifact.patch, job)
        }
    }

    private fun notifyDownloadStart() {
        notifyStickyInfo(
            message("codemodernizer.notification.info.download.started.title"),
            message("codemodernizer.notification.info.download.started.content"),
            project,
        )
    }

    private suspend fun unzipToPath(byteArrayList: List<ByteArray>, outputDirPath: Path? = null): Pair<Path, Int> {
        val zipFilePath = withContext(getCoroutineBgContext()) {
            if (outputDirPath == null) {
                Files.createTempFile(null, ".zip")
            } else {
                Files.createTempFile(outputDirPath, null, ".zip")
            }
        }
        var totalDownloadBytes = 0
        withContext(getCoroutineBgContext()) {
            Files.newOutputStream(zipFilePath).use {
                for (bytes in byteArrayList) {
                    it.write(bytes)
                    totalDownloadBytes += bytes.size
                }
            }
        }
        return zipFilePath to totalDownloadBytes
    }

    suspend fun downloadHilArtifact(jobId: JobId, artifactId: String, tmpDir: File): CodeTransformHilDownloadArtifact? {
        val downloadResultsResponse = clientAdaptor.downloadExportResultArchive(jobId, artifactId)

        return try {
            val tmpPath = tmpDir.toPath()
            val (downloadZipFilePath, _) = unzipToPath(downloadResultsResponse, tmpPath)
            LOG.info { "Successfully converted the hil artifact download to a zip at ${downloadZipFilePath.toAbsolutePath()}." }
            CodeTransformHilDownloadArtifact.create(downloadZipFilePath, getPathToHilArtifactDir(tmpPath))
        } catch (e: Exception) {
            // In case if unzip or file operations fail
            val errorMessage = "Unexpected error when saving downloaded hil artifact: ${e.localizedMessage}"
            telemetry.error(errorMessage)
            LOG.error { errorMessage }
            null
        }
    }

    suspend fun downloadArtifact(job: JobId): DownloadArtifactResult {
        isCurrentlyDownloading.set(true)
        val downloadStartTime = Instant.now()
        try {
            // 1. Attempt reusing previously downloaded artifact for job
            val previousArtifact = downloadedArtifacts.getOrDefault(job, null)
            if (previousArtifact != null && previousArtifact.exists()) {
                val zipPath = previousArtifact.toAbsolutePath().toString()
                return try {
                    val artifact = CodeModernizerArtifact.create(zipPath)
                    downloadedSummaries[job] = artifact.summary
                    DownloadArtifactResult(artifact, zipPath)
                } catch (e: RuntimeException) {
                    LOG.error { e.message.toString() }
                    DownloadArtifactResult(null, zipPath, e.message.orEmpty())
                }
            }

            // 2. Download the data
            notifyDownloadStart()
            LOG.info { "About to download the export result archive" }
            val downloadResultsResponse = clientAdaptor.downloadExportResultArchive(job)

            // 3. Convert to zip
            LOG.info { "Downloaded the export result archive, about to transform to zip" }

            val (path, totalDownloadBytes) = unzipToPath(downloadResultsResponse)
            val zipPath = path.toAbsolutePath().toString()
            LOG.info { "Successfully converted the download to a zip at $zipPath." }

            // 4. Deserialize zip to CodeModernizerArtifact
            var telemetryErrorMessage: String? = null
            return try {
                val output = DownloadArtifactResult(CodeModernizerArtifact.create(zipPath), zipPath)
                downloadedArtifacts[job] = path
                output
            } catch (e: RuntimeException) {
                LOG.error { e.message.toString() }
                telemetryErrorMessage = "Unexpected error when downloading result ${e.localizedMessage}"
                DownloadArtifactResult(null, zipPath, e.message.orEmpty())
            } finally {
                telemetry.jobArtifactDownloadAndDeserializeTime(
                    downloadStartTime,
                    job,
                    totalDownloadBytes,
                    telemetryErrorMessage,
                )
            }
        } catch (e: Exception) {
            // SdkClientException will be thrown, masking actual issues like SSLHandshakeException underneath
            if (e.message.toString().contains(DOWNLOAD_PROXY_WILDCARD_ERROR)) {
                notifyUnableToDownload(
                    DownloadFailureReason.PROXY_WILDCARD_ERROR,
                )
            } else if (e.message.toString().contains(DOWNLOAD_SSL_HANDSHAKE_ERROR)) {
                notifyUnableToDownload(
                    DownloadFailureReason.SSL_HANDSHAKE_ERROR,
                )
            }
            return DownloadArtifactResult(null, "", e.message.orEmpty())
        } finally {
            isCurrentlyDownloading.set(false)
        }
    }

    /**
     * Opens the built-in patch dialog to display the diff and allowing users to apply the changes locally.
     */
    internal fun displayDiffUsingPatch(patchFile: VirtualFile, jobId: JobId) {
        runInEdt {
            val dialog = ApplyPatchDifferentiatedDialog(
                project,
                ApplyPatchDefaultExecutor(project),
                listOf(ImportToShelfExecutor(project)),
                ApplyPatchMode.APPLY,
                patchFile,
                null,
                ChangeListManager.getInstance(project)
                    .addChangeList(message("codemodernizer.patch.name"), ""),
                null,
                null,
                null,
                false,
            )
            dialog.isModal = true

            telemetry.vcsDiffViewerVisible(jobId) // download succeeded
            if (dialog.showAndGet()) {
                telemetry.vcsViewerSubmitted(jobId)
            } else {
                telemetry.vscViewerCancelled(jobId)
            }
        }
    }

    fun notifyUnableToDownload(error: DownloadFailureReason) {
        LOG.error { "Unable to download artifact: $error" }
        if (error == DownloadFailureReason.PROXY_WILDCARD_ERROR) {
            notifyStickyWarn(
                message("codemodernizer.notification.warn.view_diff_failed.title"),
                message("codemodernizer.notification.warn.download_failed_wildcard.content", error),
                project,
            )
        } else if (error == DownloadFailureReason.SSL_HANDSHAKE_ERROR) {
            notifyStickyWarn(
                message("codemodernizer.notification.warn.view_diff_failed.title"),
                message("codemodernizer.notification.warn.download_failed_ssl.content", error),
                project,
            )
        }
    }

    fun notifyUnableToApplyPatch(patchPath: String, errorMessage: String) {
        LOG.error { "Unable to find patch for file: $patchPath" }
        notifyStickyWarn(
            message("codemodernizer.notification.warn.view_diff_failed.title"),
            message("codemodernizer.notification.warn.view_diff_failed.content", errorMessage),
            project,
            listOf(
                openTroubleshootingGuideNotificationAction(
                    CODE_TRANSFORM_TROUBLESHOOT_DOC_ARTIFACT
                )
            ),
        )
    }

    fun notifyUnableToShowSummary() {
        LOG.error { "Unable to display summary" }
        notifyStickyWarn(
            message("codemodernizer.notification.warn.view_summary_failed.title"),
            message("codemodernizer.notification.warn.view_summary_failed.content"),
            project,
            listOf(
                openTroubleshootingGuideNotificationAction(
                    CODE_TRANSFORM_TROUBLESHOOT_DOC_ARTIFACT
                )
            ),
        )
    }

    fun displayDiffAction(jobId: JobId) = runReadAction {
        telemetry.vcsViewerClicked(jobId)
        projectCoroutineScope(project).launch {
            displayDiff(jobId)
        }
    }

    fun getSummary(job: JobId) = downloadedSummaries[job]

    fun showTransformationSummary(job: JobId) {
        if (isCurrentlyDownloading.get()) return
        runReadAction {
            projectCoroutineScope(project).launch {
                val result = downloadArtifact(job)
                val summary = result.artifact?.summaryMarkdownFile ?: return@launch notifyUnableToShowSummary()
                val summaryMarkdownVirtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(summary)
                if (summaryMarkdownVirtualFile != null) {
                    runInEdt {
                        FileEditorManager.getInstance(project).openFile(summaryMarkdownVirtualFile, true)
                    }
                }
            }
        }
    }

    companion object {
        val LOG = getLogger<ArtifactHandler>()
    }
}
