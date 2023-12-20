// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.vcs.changes.ChangeListManager
import com.intellij.openapi.vcs.changes.patch.ApplyPatchDefaultExecutor
import com.intellij.openapi.vcs.changes.patch.ApplyPatchDifferentiatedDialog
import com.intellij.openapi.vcs.changes.patch.ApplyPatchMode
import com.intellij.openapi.vcs.changes.patch.ImportToShelfExecutor
import com.intellij.openapi.vfs.VirtualFile
import kotlinx.coroutines.launch
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.services.codemodernizer.client.GumbyClient
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerArtifact
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobId
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeTransformTelemetryState
import software.aws.toolkits.jetbrains.services.codemodernizer.summary.CodeModernizerSummaryEditorProvider
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.jetbrains.utils.notifyWarn
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodeTransformApiNames
import software.aws.toolkits.telemetry.CodeTransformPatchViewerCancelSrcComponents
import software.aws.toolkits.telemetry.CodeTransformVCSViewerSrcComponents
import software.aws.toolkits.telemetry.CodetransformTelemetry
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean

data class DownloadArtifactResult(val artifact: CodeModernizerArtifact?, val zipPath: String)
class ArtifactHandler(private val project: Project, private val clientAdaptor: GumbyClient) {
    private val downloadedArtifacts = mutableMapOf<JobId, Path>()
    private val downloadedSummaries = mutableMapOf<JobId, TransformationSummary>()

    private var isCurrentlyDownloading = AtomicBoolean(false)
    internal suspend fun displayDiff(job: JobId) {
        if (isCurrentlyDownloading.get()) return
        val result = downloadArtifact(job)
        if (result.artifact == null) {
            notifyUnableToApplyPatch(result.zipPath)
        } else {
            displayDiffUsingPatch(result.artifact.patch, job)
        }
    }

    private fun notifyDownloadStart() {
        notifyInfo(
            message("codemodernizer.notification.info.download.started.title"),
            message("codemodernizer.notification.info.download.started.content"),
            project,
        )
    }

    suspend fun downloadArtifact(job: JobId): DownloadArtifactResult {
        isCurrentlyDownloading.set(true)
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
                    DownloadArtifactResult(null, zipPath)
                }
            }

            // 2. Download the data
            notifyDownloadStart()
            LOG.warn { "About to download the export result archive" }
            var apiStartTime: Instant = Instant.now()
            lateinit var apiEndTime: Instant
            val downloadResultsResponse: MutableList<ByteArray>
            try {
                downloadResultsResponse = clientAdaptor.downloadExportResultArchive(job)
            } catch (e: Exception) {
                CodetransformTelemetry.logApiError(
                    codeTransformApiNames = CodeTransformApiNames.ExportResultArchive,
                    codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                    codeTransformApiErrorMessage = e.message.toString(),
                    codeTransformJobId = job.id,
                )
                throw e // pass along error to callee
            } finally {
                apiEndTime = Instant.now()
            }

            // 3. Convert to zip
            LOG.warn { "Downloaded the export result archive, about to transform to zip" }
            val path = Files.createTempFile(null, ".zip")
            var totalDownloadBytes = 0
            Files.newOutputStream(path).use {
                for (bytes in downloadResultsResponse) {
                    it.write(bytes)
                    totalDownloadBytes += bytes.size
                }
            }
            CodetransformTelemetry.logApiLatency(
                codeTransformApiNames = CodeTransformApiNames.ExportResultArchive,
                codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                codeTransformRunTimeLatency = calculateTotalLatency(apiStartTime, apiEndTime),
                codeTransformJobId = job.id,
                codeTransformTotalByteSize = totalDownloadBytes
            )
            LOG.warn { "Successfully converted the download to a zip at ${path.toAbsolutePath()}." }
            val zipPath = path.toAbsolutePath().toString()

            // 4. Deserialize zip to CodeModernizerArtifact
            var telemetryErrorMessage = ""
            return try {
                apiStartTime = Instant.now()
                val output = DownloadArtifactResult(CodeModernizerArtifact.create(zipPath), zipPath)
                apiEndTime = Instant.now()
                downloadedArtifacts[job] = path
                output
            } catch (e: RuntimeException) {
                LOG.error { e.message.toString() }
                telemetryErrorMessage = e.message.toString()
                apiEndTime = Instant.now()
                DownloadArtifactResult(null, zipPath)
            } finally {
                CodetransformTelemetry.jobArtifactDownloadAndDeserializeTime(
                    codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                    codeTransformRunTimeLatency = calculateTotalLatency(apiStartTime, apiEndTime),
                    codeTransformJobId = job.id,
                    codeTransformTotalByteSize = totalDownloadBytes,
                    codeTransformRuntimeError = telemetryErrorMessage
                )
            }
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

            CodetransformTelemetry.vcsDiffViewerVisible(
                codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                codeTransformJobId = jobId.id
            )

            if (dialog.showAndGet()) {
                CodetransformTelemetry.vcsViewerSubmitted(
                    codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                    codeTransformJobId = jobId.id
                )
            } else {
                CodetransformTelemetry.vcsViewerCanceled(
                    codeTransformPatchViewerCancelSrcComponents = CodeTransformPatchViewerCancelSrcComponents.CancelButton,
                    codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                    codeTransformJobId = jobId.id
                )
            }
        }
    }

    fun notifyUnableToApplyPatch(patchPath: String) {
        LOG.warn { "Unable to find patch for file: $patchPath" }
        notifyWarn(
            message("codemodernizer.notification.warn.view_diff_failed.title"),
            message("codemodernizer.notification.warn.view_diff_failed.content"),
            project,
            listOf(),
        )
    }

    fun notifyUnableToShowSummary() {
        LOG.warn { "Unable to display summary" }
        notifyWarn(
            message("codemodernizer.notification.warn.view_summary_failed.title"),
            message("codemodernizer.notification.warn.view_summary_failed.content"),
            project,
            listOf(),
        )
    }

    fun displayDiffAction(jobId: JobId) = runReadAction {
        CodetransformTelemetry.vcsViewerClicked(
            codeTransformVCSViewerSrcComponents = CodeTransformVCSViewerSrcComponents.ToastNotification,
            codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
            codeTransformJobId = jobId.id
        )
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
                val summary = result.artifact?.summary ?: return@launch notifyUnableToShowSummary()
                runInEdt { CodeModernizerSummaryEditorProvider.openEditor(project, summary) }
            }
        }
    }

    companion object {
        val LOG = getLogger<ArtifactHandler>()
    }
}
