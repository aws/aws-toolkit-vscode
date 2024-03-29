// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import software.amazon.awssdk.services.codewhispererruntime.model.TransformationPlan

class BuildProgressTimelineStepDetailsList<BuildProgressTimelineStepDetailItem> : ArrayList<BuildProgressTimelineStepDetailItem>() {

    // custom add method
    fun addWithIndex(element: BuildProgressTimelineStepDetailItem, index: Int) {
        add(index, element)
    }
}

fun getTransformationProgressStepsByTransformationStepId(
    stepId: Int,
    transformationPlan: TransformationPlan?
): BuildProgressTimelineStepDetailsList<BuildProgressTimelineStepDetailItem> {
    val stepList = BuildProgressTimelineStepDetailsList<BuildProgressTimelineStepDetailItem>()
    val transformationStep = transformationPlan?.transformationSteps()?.get(stepId - 1)
    transformationStep?.progressUpdates()?.let { progressUpdates ->
        for (progressStep in progressUpdates) {
            if (progressStep != null) {
                val itemToAdd = BuildProgressTimelineStepDetailItem(
                    progressStep.name(),
                    progressStep.description(),
                    mapTransformationPlanApiStatus(progressStep.status()),
                    progressStep.startTime()?.toString(),
                    progressStep.endTime()?.toString()
                )
                stepList.add(itemToAdd)
            }
        }
    }

    return stepList
}
