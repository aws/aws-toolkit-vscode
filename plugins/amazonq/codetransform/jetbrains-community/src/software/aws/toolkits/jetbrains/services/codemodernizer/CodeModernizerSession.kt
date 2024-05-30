// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.runInEdt
import com.intellij.serviceContainer.AlreadyDisposedException
import com.intellij.util.io.HttpRequests
import kotlinx.coroutines.delay
import org.apache.commons.codec.digest.DigestUtils
import software.amazon.awssdk.services.codewhispererruntime.model.ResumeTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StartTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationJob
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationLanguage
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationPlan
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationProgressUpdateStatus
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStatus
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationUserActionStatus
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.codemodernizer.client.GumbyClient
import software.aws.toolkits.jetbrains.services.codemodernizer.commands.CodeTransformMessageListener
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerException
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerJobCompletedResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerSessionContext
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerStartJobResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeTransformHilDownloadArtifact
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobId
import software.aws.toolkits.jetbrains.services.codemodernizer.model.MavenCopyCommandsResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.MavenDependencyReportCommandsResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.UploadFailureReason
import software.aws.toolkits.jetbrains.services.codemodernizer.model.ZipCreationResult
import software.aws.toolkits.jetbrains.services.codemodernizer.plan.CodeModernizerPlanEditorProvider
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeModernizerSessionState
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.STATES_AFTER_INITIAL_BUILD
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.STATES_AFTER_STARTED
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.getModuleOrProjectNameForFile
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.getPathToHilDependencyReportDir
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.pollTransformationStatusAndPlan
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.toTransformationLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanSession
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodeTransformApiNames
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.net.ConnectException
import java.nio.file.Path
import java.time.Instant
import java.util.Base64
import java.util.concurrent.CancellationException
import java.util.concurrent.atomic.AtomicBoolean

const val ZIP_SOURCES_PATH = "sources"
const val BUILD_LOG_PATH = "build-logs.txt"
const val UPLOAD_ZIP_MANIFEST_VERSION = 1.0F
const val MAX_ZIP_SIZE = 1000000000 // 1GB
const val HIL_1P_UPGRADE_CAPABILITY = "HIL_1pDependency_VersionUpgrade"
const val EXPLAINABILITY_V1 = "EXPLAINABILITY_V1"

class CodeModernizerSession(
    val sessionContext: CodeModernizerSessionContext,
    private val initialPollingSleepDurationMillis: Long = 2000,
    private val totalPollingSleepDurationMillis: Long = 5000,
) : Disposable {
    private val clientAdaptor = GumbyClient.getInstance(sessionContext.project)
    private val state = CodeModernizerSessionState.getInstance(sessionContext.project)
    private val isDisposed = AtomicBoolean(false)
    private val shouldStop = AtomicBoolean(false)
    private val telemetry = CodeTransformTelemetryManager.getInstance(sessionContext.project)

    private var mvnBuildResult: MavenCopyCommandsResult? = null
    private var transformResult: CodeModernizerJobCompletedResult? = null

    private var hilDownloadArtifactId: String? = null
    private var hilTempDirectoryPath: Path? = null
    private var hilDownloadArtifact: CodeTransformHilDownloadArtifact? = null

    fun getHilDownloadArtifactId() = hilDownloadArtifactId

    fun setHilDownloadArtifactId(artifactId: String) {
        hilDownloadArtifactId = artifactId
    }

    fun getHilDownloadArtifact() = hilDownloadArtifact

    fun setHilDownloadArtifact(artifact: CodeTransformHilDownloadArtifact) {
        hilDownloadArtifact = artifact
    }

    fun getHilTempDirectoryPath() = hilTempDirectoryPath

    fun setHilTempDirectoryPath(path: Path) {
        hilTempDirectoryPath = path
    }
    fun getLastMvnBuildResult(): MavenCopyCommandsResult? = mvnBuildResult

    fun setLastMvnBuildResult(result: MavenCopyCommandsResult) {
        mvnBuildResult = result
    }

    fun getLastTransformResult(): CodeModernizerJobCompletedResult? = transformResult

    fun setLastTransformResult(result: CodeModernizerJobCompletedResult) {
        transformResult = result
    }

    fun getDependenciesUsingMaven(): MavenCopyCommandsResult = sessionContext.getDependenciesUsingMaven()

    fun createHilDependencyReportUsingMaven(): MavenDependencyReportCommandsResult = sessionContext.createDependencyReportUsingMaven(
        getPathToHilDependencyReportDir(hilTempDirectoryPath as Path)
    )

    fun copyHilDependencyUsingMaven(): MavenCopyCommandsResult = sessionContext.copyHilDependencyUsingMaven(hilTempDirectoryPath as Path)

    fun createHilUploadZip(selectedVersion: String) = sessionContext.createZipForHilUpload(
        hilTempDirectoryPath as Path,
        hilDownloadArtifact?.manifest,
        selectedVersion
    )

    /**
     * Note that this function makes network calls and needs to be run from a background thread.
     * Runs a code modernizer session which comprises the following steps:
     *  1. Generate zip file with the files in the selected module
     *  2. CreateUploadURL to upload the zip.
     *  3. Upload the zip files using the URL.
     *  4. Call startMigrationJob to start a migration job
     *
     *  Based on [CodeWhispererCodeScanSession]
     */
    fun createModernizationJob(copyResult: MavenCopyCommandsResult): CodeModernizerStartJobResult {
        LOG.info { "Starting Modernization Job" }
        val payload: File?

        // Generate zip file
        try {
            if (isDisposed.get()) {
                LOG.warn { "Disposed when about to create zip to upload" }
                return CodeModernizerStartJobResult.Disposed
            }
            val startTime = Instant.now()
            val result = sessionContext.createZipWithModuleFiles(copyResult)

            if (result is ZipCreationResult.Missing1P) {
                return CodeModernizerStartJobResult.CancelledMissingDependencies
            }

            payload = result.payload

            val payloadSize = payload.length().toInt()

            telemetry.jobCreateZipEndTime(payloadSize, startTime)

            if (payloadSize > MAX_ZIP_SIZE) {
                return CodeModernizerStartJobResult.CancelledZipTooLarge
            }
        } catch (e: Exception) {
            val errorMessage = "Failed to create zip"
            LOG.error(e) { errorMessage }
            telemetry.error(errorMessage)
            state.currentJobStatus = TransformationStatus.FAILED
            return when (e) {
                is CodeModernizerException -> CodeModernizerStartJobResult.ZipCreationFailed(e.message)
                else -> CodeModernizerStartJobResult.ZipCreationFailed(message("codemodernizer.notification.warn.zip_creation_failed.reasons.unknown"))
            }
        }

        // Create upload url and upload zip
        var uploadId = ""
        try {
            if (shouldStop.get()) {
                LOG.warn { "Job was cancelled by user before upload was called" }
                return CodeModernizerStartJobResult.Cancelled
            }
            uploadId = uploadPayload(payload)
        } catch (e: AlreadyDisposedException) {
            LOG.warn { e.localizedMessage }
            return CodeModernizerStartJobResult.Disposed
        } catch (e: ConnectException) {
            state.putJobHistory(sessionContext, TransformationStatus.FAILED)
            state.currentJobStatus = TransformationStatus.FAILED
            return CodeModernizerStartJobResult.ZipUploadFailed(UploadFailureReason.CONNECTION_REFUSED)
        } catch (e: HttpRequests.HttpStatusException) {
            state.putJobHistory(sessionContext, TransformationStatus.FAILED)
            state.currentJobStatus = TransformationStatus.FAILED
            return if (e.statusCode == 403) {
                CodeModernizerStartJobResult.ZipUploadFailed(UploadFailureReason.PRESIGNED_URL_EXPIRED)
            } else {
                CodeModernizerStartJobResult.ZipUploadFailed(UploadFailureReason.HTTP_ERROR(e.statusCode))
            }
        } catch (e: IOException) {
            if (shouldStop.get()) {
                // Cancelling during S3 upload will cause IOException of "not enough data written",
                // so no need to show an IDE error for it
                LOG.warn { "Job was cancelled by user before start job was called" }
                return CodeModernizerStartJobResult.Cancelled
            } else {
                state.putJobHistory(sessionContext, TransformationStatus.FAILED)
                state.currentJobStatus = TransformationStatus.FAILED
                return CodeModernizerStartJobResult.ZipUploadFailed(UploadFailureReason.OTHER(e.localizedMessage.toString()))
            }
        } catch (e: Exception) {
            state.putJobHistory(sessionContext, TransformationStatus.FAILED)
            state.currentJobStatus = TransformationStatus.FAILED
            return CodeModernizerStartJobResult.ZipUploadFailed(UploadFailureReason.OTHER(e.localizedMessage.toString()))
        } finally {
            deleteUploadArtifact(payload)
        }

        // Send upload completion message to chat (only if successful)
        CodeTransformMessageListener.instance.onUploadResult()

        return try {
            if (shouldStop.get()) {
                LOG.warn { "Job was cancelled by user before start job was called" }
                return CodeModernizerStartJobResult.Cancelled
            }
            val startJobResponse = startJob(uploadId)
            state.putJobHistory(sessionContext, TransformationStatus.STARTED, startJobResponse.transformationJobId())
            state.currentJobStatus = TransformationStatus.STARTED
            CodeModernizerStartJobResult.Started(JobId(startJobResponse.transformationJobId()))
        } catch (e: Exception) {
            state.putJobHistory(sessionContext, TransformationStatus.FAILED)
            state.currentJobStatus = TransformationStatus.FAILED
            CodeModernizerStartJobResult.UnableToStartJob(e.message.toString())
        }
    }

    internal fun deleteUploadArtifact(payload: File) {
        if (!payload.delete()) {
            LOG.warn { "Unable to delete upload artifact." }
        }
    }

    private fun startJob(uploadId: String): StartTransformationResponse {
        val sourceLanguage = sessionContext.sourceJavaVersion.name.toTransformationLanguage()
        val targetLanguage = sessionContext.targetJavaVersion.name.toTransformationLanguage()
        if (sourceLanguage == TransformationLanguage.UNKNOWN_TO_SDK_VERSION) {
            throw RuntimeException("Source language is not supported")
        }
        if (targetLanguage == TransformationLanguage.UNKNOWN_TO_SDK_VERSION) {
            throw RuntimeException("Target language is not supported")
        }
        LOG.info { "Starting job with uploadId [$uploadId] for $sourceLanguage -> $targetLanguage" }
        return clientAdaptor.startCodeModernization(uploadId, sourceLanguage, targetLanguage)
    }

    /**
     * Will perform a single call, checking if a modernization job is finished.
     */
    fun getJobDetails(jobId: JobId): TransformationJob {
        LOG.info { "Getting job details." }
        return clientAdaptor.getCodeModernizationJob(jobId.id).transformationJob()
    }

    fun getTransformPlanDetails(jobId: JobId): TransformationPlan {
        LOG.info { "Getting transform plan details." }
        return clientAdaptor.getCodeModernizationPlan(jobId).transformationPlan()
    }

    /**
     * This will resume the job, i.e. it will resume the main job loop kicked of by [createModernizationJob]
     */
    fun resumeJob(startTime: Instant, jobId: JobId) = state.putJobHistory(sessionContext, TransformationStatus.STARTED, jobId.id, startTime)

    fun resumeTransformFromHil() {
        val clientAdaptor = GumbyClient.getInstance(sessionContext.project)
        clientAdaptor.resumeCodeTransformation(state.currentJobId as JobId, TransformationUserActionStatus.COMPLETED)
    }

    fun rejectHilAndContinue(): ResumeTransformationResponse {
        val clientAdaptor = GumbyClient.getInstance(sessionContext.project)
        val jobId = state.currentJobId ?: throw CodeModernizerException("No Job ID found")
        return clientAdaptor.resumeCodeTransformation(jobId, TransformationUserActionStatus.REJECTED)
    }

    fun uploadHilPayload(payload: File): String {
        val sha256checksum: String = Base64.getEncoder().encodeToString(DigestUtils.sha256(FileInputStream(payload)))
        if (isDisposed.get()) {
            throw AlreadyDisposedException("Disposed when about to create upload URL")
        }
        val jobId = state.currentJobId ?: throw CodeModernizerException("No Job ID found")
        val clientAdaptor = GumbyClient.getInstance(sessionContext.project)
        val createUploadUrlResponse = clientAdaptor.createHilUploadUrl(sha256checksum, jobId = jobId)

        LOG.info {
            "Uploading zip with checksum $sha256checksum using uploadId: ${
                createUploadUrlResponse.uploadId()
            } and size ${(payload.length() / 1000).toInt()}kB"
        }
        if (isDisposed.get()) {
            throw AlreadyDisposedException("Disposed when about to upload zip to s3")
        }
        val uploadStartTime = Instant.now()
        try {
            clientAdaptor.uploadArtifactToS3(
                createUploadUrlResponse.uploadUrl(),
                payload,
                sha256checksum,
                createUploadUrlResponse.kmsKeyArn().orEmpty(),
            ) { shouldStop.get() }
        } catch (e: Exception) {
            val errorMessage = "Unexpected error when uploading hil artifact to S3: ${e.localizedMessage}"
            LOG.error { errorMessage }
            telemetry.apiError(errorMessage, CodeTransformApiNames.UploadZip, createUploadUrlResponse.uploadId())
            throw e
        }
        if (!shouldStop.get()) {
            telemetry.logApiLatency(
                CodeTransformApiNames.UploadZip,
                uploadStartTime,
                payload.length().toInt(),
                createUploadUrlResponse.responseMetadata().requestId(),
            )
            LOG.warn { "Upload hil artifact complete" }
        }
        return createUploadUrlResponse.uploadId()
    }

    /**
     * Adapted from [CodeWhispererCodeScanSession]
     */
    fun uploadPayload(payload: File): String {
        val sha256checksum: String = Base64.getEncoder().encodeToString(DigestUtils.sha256(FileInputStream(payload)))
        if (isDisposed.get()) {
            throw AlreadyDisposedException("Disposed when about to create upload URL")
        }
        val clientAdaptor = GumbyClient.getInstance(sessionContext.project)
        val createUploadUrlResponse = clientAdaptor.createGumbyUploadUrl(sha256checksum)

        LOG.info {
            "Uploading zip at ${payload.path} with checksum $sha256checksum using uploadId: ${
                createUploadUrlResponse.uploadId()
            } and size ${(payload.length() / 1000).toInt()}kB"
        }
        if (isDisposed.get()) {
            throw AlreadyDisposedException("Disposed when about to upload zip to s3")
        }
        val uploadStartTime = Instant.now()
        try {
            clientAdaptor.uploadArtifactToS3(
                createUploadUrlResponse.uploadUrl(),
                payload,
                sha256checksum,
                createUploadUrlResponse.kmsKeyArn().orEmpty(),
            ) { shouldStop.get() }
        } catch (e: Exception) {
            val errorMessage = "Unexpected error when uploading artifact to S3: $e"
            LOG.error { errorMessage }
            // emit this metric here manually since we don't use callApi(), which emits its own metric
            telemetry.apiError(errorMessage, CodeTransformApiNames.UploadZip, createUploadUrlResponse.uploadId())
            throw e // pass along error to callee
        }
        if (!shouldStop.get()) {
            telemetry.logApiLatency(
                CodeTransformApiNames.UploadZip,
                uploadStartTime,
                payload.length().toInt(),
                createUploadUrlResponse.responseMetadata().requestId(),
            )
            LOG.warn { "Upload complete" }
        }
        return createUploadUrlResponse.uploadId()
    }

    suspend fun pollUntilJobCompletion(
        jobId: JobId,
        jobTransitionHandler: (currentStatus: TransformationStatus, migrationPlan: TransformationPlan?) -> Unit,
    ): CodeModernizerJobCompletedResult {
        try {
            state.currentJobId = jobId

            // add delay to avoid the throttling error
            delay(1000)

            var isTransformationPlanEditorOpened = false
            var passedBuild = false
            var passedStart = false

            val result = jobId.pollTransformationStatusAndPlan(
                succeedOn = setOf(
                    TransformationStatus.COMPLETED,
                    TransformationStatus.PAUSED,
                    TransformationStatus.STOPPED,
                    TransformationStatus.PARTIALLY_COMPLETED,
                ),
                failOn = setOf(
                    TransformationStatus.FAILED,
                    TransformationStatus.UNKNOWN_TO_SDK_VERSION,
                ),
                clientAdaptor,
                initialPollingSleepDurationMillis,
                totalPollingSleepDurationMillis,
                isDisposed,
                sessionContext.project,
            ) { old, new, plan ->
                // Always refresh the dev tool tree so status will be up-to-date
                state.currentJobStatus = new
                state.transformationPlan = plan

                if (state.currentJobStatus == TransformationStatus.PAUSED) {
                    val pausedUpdate =
                        state.transformationPlan
                            ?.transformationSteps()
                            ?.flatMap { step -> step.progressUpdates() }
                            ?.filter { update -> update.status() == TransformationProgressUpdateStatus.PAUSED }
                    if (pausedUpdate?.isNotEmpty() == true) {
                        state.currentHilArtifactId = pausedUpdate[0].downloadArtifacts()[0].downloadArtifactId()
                    }
                }

                // Open the transformation plan detail panel once transformation plan is available
                if (state.transformationPlan != null && !isTransformationPlanEditorOpened) {
                    tryOpenTransformationPlanEditor()
                    isTransformationPlanEditorOpened = true
                }
                val instant = Instant.now()
                // Set the job start time
                if (state.currentJobCreationTime == Instant.MIN) {
                    state.currentJobCreationTime = instant
                }
                state.updateJobHistory(sessionContext, new, instant)
                setCurrentJobStopTime(new, instant)
                setCurrentJobSummary(new)

                if (!passedStart && new in STATES_AFTER_STARTED) {
                    passedStart = true
                }
                if (!passedBuild && new in STATES_AFTER_INITIAL_BUILD) {
                    passedBuild = true
                }

                jobTransitionHandler(new, plan)
                LOG.info { "Waiting for Modernization Job [$jobId] to complete. State changed for job: $old -> $new" }
            }
            return when {
                result.state == TransformationStatus.STOPPED -> CodeModernizerJobCompletedResult.Stopped

                result.state == TransformationStatus.PAUSED -> CodeModernizerJobCompletedResult.JobPaused(jobId, state.currentHilArtifactId.orEmpty())

                result.state == TransformationStatus.UNKNOWN_TO_SDK_VERSION -> CodeModernizerJobCompletedResult.JobFailed(
                    jobId,
                    message("codemodernizer.notification.warn.unknown_status_response")
                )

                result.state == TransformationStatus.PARTIALLY_COMPLETED -> CodeModernizerJobCompletedResult.JobPartiallySucceeded(
                    jobId,
                    sessionContext.targetJavaVersion
                )

                result.state == TransformationStatus.FAILED -> {
                    if (!passedStart) {
                        val failureReason = result.jobDetails?.reason() ?: message("codemodernizer.notification.warn.unknown_start_failure")
                        return CodeModernizerJobCompletedResult.JobFailed(jobId, failureReason)
                    } else if (!passedBuild) {
                        val failureReason = result.jobDetails?.reason() ?: message("codemodernizer.notification.warn.maven_failed.content")
                        return CodeModernizerJobCompletedResult.JobFailedInitialBuild(jobId, failureReason)
                    } else {
                        val failureReason = result.jobDetails?.reason() ?: message("codemodernizer.notification.warn.unknown_status_response")
                        return CodeModernizerJobCompletedResult.JobFailed(jobId, failureReason)
                    }
                }

                result.succeeded -> CodeModernizerJobCompletedResult.JobCompletedSuccessfully(jobId)

                // Should not happen
                else -> CodeModernizerJobCompletedResult.JobFailed(jobId, result.jobDetails?.reason().orEmpty())
            }
        } catch (e: Exception) {
            return when (e) {
                is AlreadyDisposedException, is CancellationException -> {
                    LOG.warn { "The session was disposed while polling for job details." }
                    CodeModernizerJobCompletedResult.ManagerDisposed
                }

                else -> {
                    LOG.error(e) { e.message.toString() }
                    CodeModernizerJobCompletedResult.RetryableFailure(
                        jobId,
                        message("codemodernizer.notification.info.modernize_failed.connection_failed", e.message.orEmpty()),
                    )
                }
            }
        }
    }

    fun stopTransformation(transformationId: String?): Boolean {
        shouldStop.set(true) // allows the zipping and upload to cancel
        return if (transformationId != null) {
            // Means job exists in backend, and we have to call the stop api
            clientAdaptor.stopTransformation(transformationId)
            return true
        } else {
            true // We did not yet call the start API so no need to call the stop job api
        }
    }

    fun getTransformationPlan(): TransformationPlan? = state.transformationPlan

    fun setCurrentJobStopTime(status: TransformationStatus, instant: Instant) {
        if (status in setOf(
                TransformationStatus.COMPLETED, // successfully transformed
                TransformationStatus.STOPPED, // manually stopped,
                TransformationStatus.PARTIALLY_COMPLETED, // partially successfully transformed
                TransformationStatus.FAILED, // unable to generate transformation plan
                TransformationStatus.UNKNOWN_TO_SDK_VERSION,
            )
        ) {
            state.currentJobStopTime = instant
        }
    }

    private fun setCurrentJobSummary(status: TransformationStatus) {
        state.transformationSummary ?: return
        if (status in setOf(
                TransformationStatus.COMPLETED,
                TransformationStatus.STOPPED,
                TransformationStatus.PARTIALLY_COMPLETED,
                TransformationStatus.FAILED,
            )
        ) {
            val summary = TransformationSummary(
                """
            # Transformation summary

            This is pretty
            and now it has been updated from api call...
                """.trimIndent()
            )
            state.transformationSummary = summary
        }
    }

    fun tryOpenTransformationPlanEditor() {
        val transformationPlan = getTransformationPlan()
        if (transformationPlan != null) {
            runInEdt {
                CodeModernizerPlanEditorProvider.openEditor(
                    sessionContext.project,
                    transformationPlan,
                    sessionContext.project.getModuleOrProjectNameForFile(sessionContext.configurationFile),
                    sessionContext.sourceJavaVersion.description,
                )
            }
        }
    }

    companion object {
        private val LOG = getLogger<CodeModernizerSession>()
    }

    override fun dispose() {
        isDisposed.set(true)
    }

    fun getActiveJobId() = state.currentJobId
    fun fetchPlan(lastJobId: JobId) = clientAdaptor.getCodeModernizationPlan(lastJobId)

    fun hilCleanup() {
        hilDownloadArtifactId = null
        hilDownloadArtifact = null
        if (hilTempDirectoryPath?.exists() == true) {
            try {
                (hilTempDirectoryPath as Path).toFile().deleteRecursively()
            } catch (e: Exception) {
                val errorMessage = "Unexpected error when cleaning up HIL files: ${e.localizedMessage}"
                LOG.error { errorMessage }
                telemetry.error(errorMessage)
                return
            } finally {
                hilTempDirectoryPath = null
            }
        }
    }
}
