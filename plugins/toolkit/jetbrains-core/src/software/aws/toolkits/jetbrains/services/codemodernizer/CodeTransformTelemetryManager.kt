// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import org.apache.commons.codec.digest.DigestUtils
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStatus
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CustomerSelection
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobId
import software.aws.toolkits.jetbrains.services.codemodernizer.model.ValidationResult
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeModernizerSessionState
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeTransformTelemetryState
import software.aws.toolkits.telemetry.CodeTransformApiNames
import software.aws.toolkits.telemetry.CodeTransformCancelSrcComponents
import software.aws.toolkits.telemetry.CodeTransformJavaSourceVersionsAllowed
import software.aws.toolkits.telemetry.CodeTransformJavaTargetVersionsAllowed
import software.aws.toolkits.telemetry.CodeTransformMavenBuildCommand
import software.aws.toolkits.telemetry.CodeTransformPatchViewerCancelSrcComponents
import software.aws.toolkits.telemetry.CodeTransformPreValidationError
import software.aws.toolkits.telemetry.CodeTransformStartSrcComponents
import software.aws.toolkits.telemetry.CodeTransformVCSViewerSrcComponents
import software.aws.toolkits.telemetry.CodetransformTelemetry
import software.aws.toolkits.telemetry.Result
import java.time.Instant
import java.util.Base64

/**
 * CodeModernizerTelemetry contains helper functions for common operations that require telemetry.
 */
@Service(Service.Level.PROJECT)
class CodeTransformTelemetryManager(private val project: Project) {
    private val sessionId get() = CodeTransformTelemetryState.instance.getSessionId()
    private val currentJobStatus get() = CodeModernizerSessionState.getInstance(project).currentJobStatus.toString()
    fun sendUserClickedTelemetry(srcStartComponent: CodeTransformStartSrcComponents) {
        CodeTransformTelemetryState.instance.setStartTime()
        CodeTransformTelemetryState.instance.setSessionId()
        CodetransformTelemetry.isDoubleClickedToTriggerUserModal(
            codeTransformStartSrcComponents = srcStartComponent,
            codeTransformSessionId = sessionId,
        )
    }

    private fun getProjectHash(customerSelection: CustomerSelection) = Base64.getEncoder().encodeToString(
        DigestUtils.sha256(customerSelection.configurationFile.toNioPath().toAbsolutePath().toString())
    )

    fun sendValidationResult(validationResult: ValidationResult, onProjectFirstOpen: Boolean = false) {
        // Old telemetry event to be fired only when users click on transform
        if (!validationResult.valid && !onProjectFirstOpen) {
            CodetransformTelemetry.isDoubleClickedToTriggerInvalidProject(
                codeTransformPreValidationError = validationResult.invalidTelemetryReason.category ?: CodeTransformPreValidationError.Unknown,
                codeTransformSessionId = sessionId,
                result = Result.Failed,
                reason = validationResult.invalidTelemetryReason.additonalInfo
            )
        }

        // New projectDetails metric should always be fired whether the project was valid or invalid
        CodetransformTelemetry.projectDetails(
            codeTransformSessionId = sessionId,
            result = if (validationResult.valid) Result.Succeeded else Result.Failed,
            reason = if (validationResult.valid) null else validationResult.invalidTelemetryReason.additonalInfo,
            codeTransformPreValidationError = validationResult.invalidTelemetryReason.category ?: CodeTransformPreValidationError.Unknown,
            codeTransformLocalJavaVersion = project.tryGetJdk().toString()
        )
    }

    fun jobStartedCompleteFromPopupDialog(customerSelection: CustomerSelection) {
        val projectHash = getProjectHash(customerSelection)
        CodetransformTelemetry.jobStartedCompleteFromPopupDialog(
            codeTransformJavaSourceVersionsAllowed = CodeTransformJavaSourceVersionsAllowed.from(customerSelection.sourceJavaVersion.name),
            codeTransformJavaTargetVersionsAllowed = CodeTransformJavaTargetVersionsAllowed.from(customerSelection.targetJavaVersion.name),
            codeTransformSessionId = sessionId,
            codeTransformProjectId = projectHash,
        )
    }

    fun jobIsCancelledByUser(srcComponent: CodeTransformCancelSrcComponents) = CodetransformTelemetry.jobIsCancelledByUser(
        codeTransformCancelSrcComponents = srcComponent,
        codeTransformSessionId = sessionId
    )

    fun jobIsResumedAfterIdeClose(lastJobId: JobId, status: TransformationStatus) = CodetransformTelemetry.jobIsResumedAfterIdeClose(
        codeTransformSessionId = sessionId,
        codeTransformJobId = lastJobId.id,
        codeTransformStatus = status.toString()
    )

    fun totalRunTime(codeTransformResultStatusMessage: String, jobId: JobId?) = CodetransformTelemetry.totalRunTime(
        codeTransformJobId = jobId?.toString(),
        codeTransformSessionId = sessionId,
        codeTransformResultStatusMessage = codeTransformResultStatusMessage,
        codeTransformRunTimeLatency = calculateTotalLatency(CodeTransformTelemetryState.instance.getStartTime(), Instant.now()),
        codeTransformLocalJavaVersion = getJavaVersionFromProjectSetting(project),
        codeTransformLocalMavenVersion = getMavenVersion(project),
    )

    fun jobCreateZipEndTime(payloadSize: Int, startTime: Instant) = CodetransformTelemetry.jobCreateZipEndTime(
        codeTransformTotalByteSize = payloadSize,
        codeTransformSessionId = sessionId,
        codeTransformRunTimeLatency = calculateTotalLatency(startTime, Instant.now()),
    )

    fun error(errorMessage: String) = CodetransformTelemetry.logGeneralError(
        codeTransformApiErrorMessage = errorMessage,
        codeTransformSessionId = sessionId,
    )

    fun apiError(errorMessage: String, apiName: CodeTransformApiNames, jobId: String?) = CodetransformTelemetry.logApiError(
        codeTransformApiErrorMessage = errorMessage,
        codeTransformApiNames = apiName,
        codeTransformSessionId = sessionId,
        codeTransformJobId = jobId,
    )

    fun logApiLatency(
        apiName: CodeTransformApiNames,
        startTime: Instant,
        codeTransformTotalByteSize: Int? = null,
        codeTransformUploadId: String? = null,
        codeTransformJobId: String? = null,
        codeTransformRequestId: String? = null
    ) = CodetransformTelemetry.logApiLatency(
        codeTransformApiNames = apiName,
        codeTransformSessionId = sessionId,
        codeTransformRunTimeLatency = calculateTotalLatency(startTime, Instant.now()),
        codeTransformUploadId = codeTransformUploadId,
        codeTransformJobId = codeTransformJobId,
        codeTransformTotalByteSize = codeTransformTotalByteSize,
        codeTransformRequestId = codeTransformRequestId
    )

    fun vcsDiffViewerVisible(jobId: JobId) = CodetransformTelemetry.vcsDiffViewerVisible(
        codeTransformSessionId = sessionId,
        codeTransformJobId = jobId.id,
    )

    fun vcsViewerSubmitted(jobId: JobId) = CodetransformTelemetry.vcsViewerSubmitted(
        codeTransformSessionId = sessionId,
        codeTransformJobId = jobId.id,
        codeTransformStatus = currentJobStatus,
    )

    fun vscViewerCancelled(jobId: JobId) = CodetransformTelemetry.vcsViewerCanceled(
        codeTransformPatchViewerCancelSrcComponents = CodeTransformPatchViewerCancelSrcComponents.CancelButton,
        codeTransformSessionId = sessionId,
        codeTransformJobId = jobId.id,
        codeTransformStatus = currentJobStatus,
    )

    fun vcsViewerClicked(jobId: JobId) = CodetransformTelemetry.vcsViewerClicked(
        codeTransformVCSViewerSrcComponents = CodeTransformVCSViewerSrcComponents.ToastNotification,
        codeTransformSessionId = sessionId,
        codeTransformJobId = jobId.id,
    )

    fun jobStatusChanged(jobId: JobId, newStatus: String, previousStatus: String) = CodetransformTelemetry.jobStatusChanged(
        codeTransformPreviousStatus = previousStatus,
        codeTransformSessionId = sessionId,
        codeTransformJobId = jobId.id,
        codeTransformStatus = newStatus
    )

    fun jobArtifactDownloadAndDeserializeTime(downloadStartTime: Instant, jobId: JobId, totalDownloadBytes: Int, telemetryErrorMessage: String?) {
        CodetransformTelemetry.jobArtifactDownloadAndDeserializeTime(
            codeTransformSessionId = sessionId,
            codeTransformRunTimeLatency = calculateTotalLatency(downloadStartTime, Instant.now()),
            codeTransformJobId = jobId.id,
            codeTransformTotalByteSize = totalDownloadBytes,
            codeTransformRuntimeError = telemetryErrorMessage,
        )
    }

    fun mvnBuildFailed(mavenBuildCommand: CodeTransformMavenBuildCommand, error: String) {
        CodetransformTelemetry.mvnBuildFailed(
            codeTransformSessionId = sessionId,
            codeTransformMavenBuildCommand = mavenBuildCommand,
            reason = error
        )
    }

    fun dependenciesCopied() = CodetransformTelemetry.dependenciesCopied(codeTransformSessionId = sessionId)
    fun configurationFileSelectedChanged() = CodetransformTelemetry.configurationFileSelectedChanged(codeTransformSessionId = sessionId)
    fun jobIsStartedFromUserPopupClick() = CodetransformTelemetry.jobIsStartedFromUserPopupClick(codeTransformSessionId = sessionId)
    fun jobIsCanceledFromUserPopupClick() = CodetransformTelemetry.jobIsCanceledFromUserPopupClick(codeTransformSessionId = sessionId)
    fun jobIsStartedFromChatPrompt() = CodetransformTelemetry.jobIsStartedFromChatPrompt(codeTransformSessionId = sessionId)

    companion object {
        fun getInstance(project: Project): CodeTransformTelemetryManager = project.service()
    }
}
