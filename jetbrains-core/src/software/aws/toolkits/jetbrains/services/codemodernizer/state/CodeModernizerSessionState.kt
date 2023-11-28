// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.state

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationPlan
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStatus
import software.aws.toolkits.jetbrains.services.codemodernizer.TransformationSummary
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerException
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerSessionContext
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobHistoryItem
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobId
import java.time.Duration
import java.time.Instant
import kotlin.io.path.Path

class CodeModernizerSessionState {
    fun setDefaults() {
        currentJobStatus = TransformationStatus.UNKNOWN_TO_SDK_VERSION
    }

    var currentJobStatus: TransformationStatus = TransformationStatus.UNKNOWN_TO_SDK_VERSION
    private val previousJobHistory = mutableMapOf<String, JobHistoryItem>()
    var currentJobCreationTime: Instant = Instant.MIN
    var currentJobStopTime: Instant = Instant.MIN
    var transformationPlan: TransformationPlan? = null
    var transformationSummary: TransformationSummary? = null
    var currentJobId: JobId? = null

    private fun getJobItemId(sessionContext: CodeModernizerSessionContext) = Path(sessionContext.configurationFile.path).toAbsolutePath().toString()
    fun putJobHistory(sessionContext: CodeModernizerSessionContext, status: String, startedAt: Instant = Instant.now()) {
        val id = getJobItemId(sessionContext)
        val jobHistoryItem = JobHistoryItem(
            id,
            status,
            startedAt,
            Duration.ZERO,
        )
        previousJobHistory[id] = jobHistoryItem
    }

    fun updateJobHistory(sessionContext: CodeModernizerSessionContext, newStatus: String, endTime: Instant) {
        val id = getJobItemId(sessionContext)
        val jobStatus = previousJobHistory.get(id) ?: throw CodeModernizerException("Unable to update the job history for $id")
        val timeTaken = Duration.between(jobStatus.startTime, endTime)
        previousJobHistory[id] = jobStatus.copy(status = newStatus, runTime = timeTaken)
    }

    fun getJobHistory(): Array<JobHistoryItem> = previousJobHistory.values.toTypedArray()

    companion object {
        fun getInstance(project: Project): CodeModernizerSessionState = project.service()
    }
}
