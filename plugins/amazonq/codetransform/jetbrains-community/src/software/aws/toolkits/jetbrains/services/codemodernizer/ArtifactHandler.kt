// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer

import com.intellij.notification.NotificationAction
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
import software.amazon.awssdk.services.codewhispererstreaming.model.TransformationDownloadArtifactType
import software.amazon.awssdk.services.ssooidc.model.SsoOidcException
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineBgContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.NoTokenInitializedException
import software.aws.toolkits.jetbrains.services.amazonq.CODE_TRANSFORM_TROUBLESHOOT_DOC_DOWNLOAD_ERROR_OVERVIEW
import software.aws.toolkits.jetbrains.services.amazonq.CODE_TRANSFORM_TROUBLESHOOT_DOC_DOWNLOAD_EXPIRED
import software.aws.toolkits.jetbrains.services.codemodernizer.client.GumbyClient
import software.aws.toolkits.jetbrains.services.codemodernizer.commands.CodeTransformMessageListener
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.getDownloadedArtifactTextFromType
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerArtifact
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeTransformFailureBuildLog
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeTransformHilDownloadArtifact
import software.aws.toolkits.jetbrains.services.codemodernizer.model.DownloadArtifactResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.DownloadFailureReason
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobId
import software.aws.toolkits.jetbrains.services.codemodernizer.model.ParseZipFailureReason
import software.aws.toolkits.jetbrains.services.codemodernizer.model.UnzipFailureReason
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.getPathToHilArtifactDir
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.isValidCodeTransformConnection
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.openTroubleshootingGuideNotificationAction
import software.aws.toolkits.jetbrains.utils.notifyStickyInfo
import software.aws.toolkits.jetbrains.utils.notifyStickyWarn
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodeTransformArtifactType
import software.aws.toolkits.telemetry.CodeTransformVCSViewerSrcComponents
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean

const val DOWNLOAD_PROXY_WILDCARD_ERROR: String = "Dangling meta character '*' near index 0"
const val DOWNLOAD_SSL_HANDSHAKE_ERROR: String = "Unable to execute HTTP request: javax.net.ssl.SSLHandshakeException"
const val INVALID_ARTIFACT_ERROR: String = "Invalid artifact"

class ArtifactHandler(private val project: Project, private val clientAdaptor: GumbyClient) {
    private val telemetry = CodeTransformTelemetryManager.getInstance(project)
    private val downloadedArtifacts = mutableMapOf<JobId, Path>()
    private val downloadedSummaries = mutableMapOf<JobId, TransformationSummary>()
    private val downloadedBuildLogPath = mutableMapOf<JobId, Path>()
    private var isCurrentlyDownloading = AtomicBoolean(false)

    internal suspend fun displayDiff(job: JobId, source: CodeTransformVCSViewerSrcComponents) {
        if (isCurrentlyDownloading.get()) return
        when (val result = downloadArtifact(job, TransformationDownloadArtifactType.CLIENT_INSTRUCTIONS)) {
            is DownloadArtifactResult.Success -> {
                if (result.artifact !is CodeModernizerArtifact) return notifyUnableToApplyPatch("")
                displayDiffUsingPatch(result.artifact.patch, job, source)
            }
            is DownloadArtifactResult.ParseZipFailure -> notifyUnableToApplyPatch(result.failureReason.errorMessage)
            is DownloadArtifactResult.UnzipFailure -> notifyUnableToApplyPatch(result.failureReason.errorMessage)
            is DownloadArtifactResult.DownloadFailure -> notifyUnableToDownload(result.failureReason)
            is DownloadArtifactResult.Skipped -> {}
        }
    }

    suspend fun unzipToPath(byteArrayList: List<ByteArray>, outputDirPath: Path? = null): Pair<Path, Int> {
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

    /**
     * Downloads an artifact and returns a [DownloadArtifactResult]
     * [DownloadArtifactResult.Success] indicates success when downloading and processing artifact
     * [DownloadArtifactResult.DownloadFailure] indicates failure when downloading artifact
     * [DownloadArtifactResult.ParseZipFailure] indicates failure when parsing artifact contents
     * [DownloadArtifactResult.UnzipFailure] indicates failure when unzipping artifact contents to disk
     * [DownloadArtifactResult.Skipped] indicates a silent failure that should be skipped as [isPreFetch] is set
     */
    suspend fun downloadArtifact(
        job: JobId,
        artifactType: TransformationDownloadArtifactType,
        isPreFetch: Boolean = false
    ): DownloadArtifactResult {
        isCurrentlyDownloading.set(true)
        val downloadStartTime = Instant.now()
        try {
            // 1. Attempt reusing previously downloaded artifact for job
            val previousArtifact = if (artifactType == TransformationDownloadArtifactType.LOGS) {
                downloadedBuildLogPath.getOrDefault(job, null)
            } else {
                downloadedArtifacts.getOrDefault(job, null)
            }
            if (previousArtifact != null && previousArtifact.exists()) {
                val zipPath = previousArtifact.toAbsolutePath().toString()
                return try {
                    if (artifactType == TransformationDownloadArtifactType.LOGS) {
                        DownloadArtifactResult.Success(CodeTransformFailureBuildLog.create(zipPath), zipPath)
                    } else {
                        val artifact = CodeModernizerArtifact.create(zipPath)
                        downloadedSummaries[job] = artifact.summary
                        DownloadArtifactResult.Success(artifact, zipPath)
                    }
                } catch (e: RuntimeException) {
                    LOG.error { e.message.toString() }
                    DownloadArtifactResult.ParseZipFailure(ParseZipFailureReason(artifactType, e.message.orEmpty()))
                }
            }

            // 2. Download the data
            LOG.info { "Verifying user is authenticated prior to download" }
            if (!isValidCodeTransformConnection(project)) {
                CodeModernizerManager.getInstance(project).handleResumableDownloadArtifactFailure(job)
                return DownloadArtifactResult.DownloadFailure(DownloadFailureReason.CREDENTIALS_EXPIRED(artifactType))
            }

            LOG.info { "About to download the export result archive" }
            // only notify if downloading client instructions (upgraded code)
            if (artifactType == TransformationDownloadArtifactType.CLIENT_INSTRUCTIONS) {
                notifyDownloadStart()
            }
            val downloadResultsResponse = if (artifactType == TransformationDownloadArtifactType.LOGS) {
                clientAdaptor.downloadExportResultArchive(job, null, TransformationDownloadArtifactType.LOGS)
            } else {
                clientAdaptor.downloadExportResultArchive(job)
            }

            // 3. Convert to zip
            LOG.info { "Downloaded the export result archive, about to transform to zip" }
            val path: Path
            val totalDownloadBytes: Int
            val zipPath: String
            try {
                val result = unzipToPath(downloadResultsResponse)
                path = result.first
                totalDownloadBytes = result.second
                zipPath = path.toAbsolutePath().toString()
                LOG.info { "Successfully converted the download to a zip at $zipPath." }
            } catch (e: Exception) {
                LOG.error { e.message.toString() }
                return DownloadArtifactResult.UnzipFailure(UnzipFailureReason(artifactType, e.message.orEmpty()))
            }

            // 4. Deserialize zip
            var telemetryErrorMessage: String? = null
            return try {
                val output = if (artifactType == TransformationDownloadArtifactType.LOGS) {
                    DownloadArtifactResult.Success(CodeTransformFailureBuildLog.create(zipPath), zipPath)
                } else {
                    DownloadArtifactResult.Success(CodeModernizerArtifact.create(zipPath), zipPath)
                }
                if (artifactType == TransformationDownloadArtifactType.LOGS) {
                    downloadedBuildLogPath[job] = path
                } else {
                    downloadedArtifacts[job] = path
                }
                output
            } catch (e: RuntimeException) {
                LOG.error { e.message.toString() }
                LOG.error { "Unable to find patch for file: $zipPath" }
                telemetryErrorMessage = "Unexpected error when downloading result ${e.localizedMessage}"
                DownloadArtifactResult.ParseZipFailure(ParseZipFailureReason(artifactType, e.message.orEmpty()))
            } finally {
                // TODO: Deprecated - remove once BI starts using new metric
                telemetry.jobArtifactDownloadAndDeserializeTime(
                    downloadStartTime,
                    job,
                    totalDownloadBytes,
                    telemetryErrorMessage,
                )

                telemetry.downloadArtifact(mapArtifactTypes(artifactType), downloadStartTime, job, totalDownloadBytes, telemetryErrorMessage)
            }
        } catch (e: Exception) {
            if (isPreFetch) return DownloadArtifactResult.Skipped
            return when {
                e is SsoOidcException || e is NoTokenInitializedException -> {
                    CodeModernizerManager.getInstance(project).handleResumableDownloadArtifactFailure(job)
                    DownloadArtifactResult.DownloadFailure(DownloadFailureReason.CREDENTIALS_EXPIRED(artifactType))
                }
                e.message.toString().contains(DOWNLOAD_PROXY_WILDCARD_ERROR) ->
                    DownloadArtifactResult.DownloadFailure(DownloadFailureReason.PROXY_WILDCARD_ERROR(artifactType))
                e.message.toString().contains(DOWNLOAD_SSL_HANDSHAKE_ERROR) ->
                    DownloadArtifactResult.DownloadFailure(DownloadFailureReason.SSL_HANDSHAKE_ERROR(artifactType))

                e.message.toString().contains(INVALID_ARTIFACT_ERROR) ->
                    DownloadArtifactResult.DownloadFailure(DownloadFailureReason.INVALID_ARTIFACT(artifactType))

                else -> DownloadArtifactResult.DownloadFailure(DownloadFailureReason.OTHER(artifactType, e.message.orEmpty()))
            }
        } finally {
            isCurrentlyDownloading.set(false)
        }
    }

    /**
     * Opens the built-in patch dialog to display the diff and allowing users to apply the changes locally.
     */
    internal fun displayDiffUsingPatch(patchFile: VirtualFile, jobId: JobId, source: CodeTransformVCSViewerSrcComponents) {
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

            // TODO: deprecated metric - remove after BI started using new metric
            telemetry.vcsDiffViewerVisible(jobId) // download succeeded
            if (dialog.showAndGet()) {
                telemetry.viewArtifact(CodeTransformArtifactType.ClientInstructions, jobId, "Submit", source)

                // TODO: deprecated metric - remove after BI started using new metric
                telemetry.vcsViewerSubmitted(jobId)
            } else {
                telemetry.viewArtifact(CodeTransformArtifactType.ClientInstructions, jobId, "Cancel", source)

                // TODO: deprecated metric - remove after BI started using new metric
                telemetry.vscViewerCancelled(jobId)
            }
        }
    }

    fun notifyUnableToDownload(error: DownloadFailureReason) {
        // Inform about failure
        LOG.error { "Unable to download artifact: $error" }
        CodeTransformMessageListener.instance.onDownloadFailure(error)

        val artifactText = getDownloadedArtifactTextFromType(error.artifactType)

        // Display notification balloon if applicable
        when (error) {
            is DownloadFailureReason.PROXY_WILDCARD_ERROR -> notifyStickyWarn(
                message("codemodernizer.notification.warn.view_diff_failed.title"),
                message("codemodernizer.notification.warn.download_failed_wildcard.content", error),
                project,
            )

            is DownloadFailureReason.SSL_HANDSHAKE_ERROR -> notifyStickyWarn(
                message("codemodernizer.notification.warn.view_diff_failed.title"),
                message("codemodernizer.notification.warn.download_failed_ssl.content", error),
                project,
            )

            is DownloadFailureReason.CREDENTIALS_EXPIRED -> {
                // Inform chat that reauth is required
                CodeTransformMessageListener.instance.onCheckAuth()

                // Since chat content is reset on reauth, inform users with notification balloon
                notifyStickyWarn(
                    message("codemodernizer.notification.warn.expired_credentials.title"),
                    message("codemodernizer.notification.warn.download_failed_expired_credentials.content"),
                    project,
                    listOf(
                        NotificationAction.createSimpleExpiring(message("codemodernizer.notification.warn.action.reauthenticate")) {
                            CodeTransformMessageListener.instance.onReauthStarted()
                        }
                    )
                )
            }

            is DownloadFailureReason.INVALID_ARTIFACT -> {
                if (error.artifactType == TransformationDownloadArtifactType.CLIENT_INSTRUCTIONS) {
                    notifyStickyWarn(
                        message("codemodernizer.notification.warn.download_failed_client_instructions_expired"),
                        CODE_TRANSFORM_TROUBLESHOOT_DOC_DOWNLOAD_EXPIRED,
                    )
                } else {
                    notifyStickyWarn(
                        message("codemodernizer.notification.warn.download_failed_invalid_artifact", artifactText),
                        CODE_TRANSFORM_TROUBLESHOOT_DOC_DOWNLOAD_EXPIRED,
                    )
                }
            }

            is DownloadFailureReason.OTHER -> {
                notifyStickyWarn(
                    message("codemodernizer.notification.warn.download_failed_other.content", artifactText, error.errorMessage),
                    CODE_TRANSFORM_TROUBLESHOOT_DOC_DOWNLOAD_ERROR_OVERVIEW,
                )
            }
        }
    }

    private fun notifyDownloadStart() {
        notifyStickyInfo(
            message("codemodernizer.notification.info.download.started.title"),
            message("codemodernizer.notification.info.download.started.content"),
            project,
        )
    }

    fun notifyUnableToApplyPatch(errorMessage: String) = notifyStickyWarn(
        message("codemodernizer.notification.warn.view_diff_failed.title"),
        message("codemodernizer.notification.warn.view_diff_failed.content", errorMessage),
        project,
        listOf(
            openTroubleshootingGuideNotificationAction(
                CODE_TRANSFORM_TROUBLESHOOT_DOC_DOWNLOAD_ERROR_OVERVIEW
            )
        ),
    )

    fun notifyUnableToShowSummary() {
        LOG.error { "Unable to display summary" }
        notifyStickyWarn(
            message("codemodernizer.notification.warn.view_summary_failed.title"),
            message("codemodernizer.notification.warn.view_summary_failed.content"),
            project,
            listOf(
                openTroubleshootingGuideNotificationAction(
                    CODE_TRANSFORM_TROUBLESHOOT_DOC_DOWNLOAD_ERROR_OVERVIEW
                )
            ),
        )
    }

    fun notifyUnableToShowBuildLog() {
        LOG.error { "Unable to display build log" }
        notifyStickyWarn(
            message("codemodernizer.notification.warn.view_build_log_failed.title"),
            message("codemodernizer.notification.warn.view_build_log_failed.content"),
            project,
            listOf(
                openTroubleshootingGuideNotificationAction(
                    CODE_TRANSFORM_TROUBLESHOOT_DOC_DOWNLOAD_ERROR_OVERVIEW
                )
            ),
        )
    }

    fun displayDiffAction(jobId: JobId, source: CodeTransformVCSViewerSrcComponents) = runReadAction {
        // TODO: deprecated metric - remove after BI started using new metric
        telemetry.vcsViewerClicked(jobId)
        projectCoroutineScope(project).launch {
            displayDiff(jobId, source)
        }
    }

    fun getSummary(job: JobId) = downloadedSummaries[job]

    private fun showSummaryFromFile(summaryFile: File) {
        val summaryMarkdownVirtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(summaryFile)
        if (summaryMarkdownVirtualFile != null) {
            runInEdt {
                FileEditorManager.getInstance(project).openFile(summaryMarkdownVirtualFile, true)
            }
        }
    }

    fun showTransformationSummary(job: JobId) {
        if (isCurrentlyDownloading.get()) return
        runReadAction {
            projectCoroutineScope(project).launch {
                when (val result = downloadArtifact(job, TransformationDownloadArtifactType.CLIENT_INSTRUCTIONS)) {
                    is DownloadArtifactResult.Success -> {
                        if (result.artifact !is CodeModernizerArtifact) return@launch notifyUnableToShowSummary()
                        showSummaryFromFile(result.artifact.summaryMarkdownFile)
                    }
                    is DownloadArtifactResult.ParseZipFailure, is DownloadArtifactResult.UnzipFailure -> notifyUnableToShowSummary()
                    is DownloadArtifactResult.DownloadFailure -> notifyUnableToDownload(result.failureReason)
                    is DownloadArtifactResult.Skipped -> {}
                }
            }
        }
    }

    fun showBuildLog(job: JobId) {
        if (isCurrentlyDownloading.get()) return
        runReadAction {
            projectCoroutineScope(project).launch {
                when (val result = downloadArtifact(job, TransformationDownloadArtifactType.LOGS)) {
                    is DownloadArtifactResult.Success -> {
                        if (result.artifact !is CodeTransformFailureBuildLog) return@launch notifyUnableToShowBuildLog()
                        val buildLogVirtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(result.artifact.logFile)
                        if (buildLogVirtualFile != null) {
                            runInEdt {
                                FileEditorManager.getInstance(project).openFile(buildLogVirtualFile, true)
                            }
                        }
                    }

                    is DownloadArtifactResult.ParseZipFailure, is DownloadArtifactResult.UnzipFailure -> notifyUnableToShowBuildLog()
                    is DownloadArtifactResult.DownloadFailure -> notifyUnableToDownload(result.failureReason)
                    is DownloadArtifactResult.Skipped -> {}
                }
            }
        }
    }

    private fun mapArtifactTypes(artifactType: TransformationDownloadArtifactType): CodeTransformArtifactType =
        when (artifactType) {
            TransformationDownloadArtifactType.CLIENT_INSTRUCTIONS -> CodeTransformArtifactType.ClientInstructions
            TransformationDownloadArtifactType.LOGS -> CodeTransformArtifactType.Logs
            TransformationDownloadArtifactType.UNKNOWN_TO_SDK_VERSION -> CodeTransformArtifactType.Unknown
        }

    companion object {
        val LOG = getLogger<ArtifactHandler>()
    }
}
