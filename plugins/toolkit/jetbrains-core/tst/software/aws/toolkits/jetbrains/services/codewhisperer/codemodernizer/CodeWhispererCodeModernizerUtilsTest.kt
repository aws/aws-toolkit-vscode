// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codemodernizer

import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito
import org.mockito.kotlin.any
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStatus
import software.aws.toolkits.jetbrains.services.codemodernizer.pollTransformationStatusAndPlan
import java.util.concurrent.atomic.AtomicBoolean

class CodeWhispererCodeModernizerUtilsTest : CodeWhispererCodeModernizerTestBase() {
    @Before
    override fun setup() {
        super.setup()
    }

    @Test
    fun `can poll for updates`() {
        Mockito.doReturn(
            exampleGetCodeMigrationResponse,
            exampleGetCodeMigrationResponse.replace(TransformationStatus.TRANSFORMING),
            exampleGetCodeMigrationResponse.replace(TransformationStatus.STARTED),
            exampleGetCodeMigrationResponse.replace(TransformationStatus.COMPLETED), // Should stop before this point
        )
            .whenever(clientAdaptorSpy).getCodeModernizationJob(any())
        Mockito.doReturn(exampleGetCodeMigrationPlanResponse)
            .whenever(clientAdaptorSpy).getCodeModernizationPlan(any())
        val mutableList = mutableListOf<TransformationStatus>()
        runBlocking {
            jobId.pollTransformationStatusAndPlan(
                setOf(TransformationStatus.STARTED),
                setOf(TransformationStatus.FAILED),
                clientAdaptorSpy,
                0,
                0,
                AtomicBoolean(false),
                project
            ) { _, status, _ ->
                mutableList.add(status)
            }
        }
        val expected =
            listOf<TransformationStatus>(
                exampleGetCodeMigrationResponse.transformationJob().status(),
                TransformationStatus.TRANSFORMING,
                TransformationStatus.STARTED,
            )
        assertThat(expected).isEqualTo(mutableList)
    }

    @Test
    fun `stops polling when status transitions to failOn`() {
        Mockito.doReturn(
            exampleGetCodeMigrationResponse,
            exampleGetCodeMigrationResponse.replace(TransformationStatus.FAILED),
            *happyPathMigrationResponses.toTypedArray(), // These should never be passed through the client
        )
            .whenever(clientAdaptorSpy).getCodeModernizationJob(any())
        val mutableList = mutableListOf<TransformationStatus>()

        val result = runBlocking {
            jobId.pollTransformationStatusAndPlan(
                setOf(TransformationStatus.COMPLETED),
                setOf(TransformationStatus.FAILED),
                clientAdaptorSpy,
                0,
                0,
                AtomicBoolean(false),
                project,
            ) { _, status, _ ->
                mutableList.add(status)
            }
        }
        assertThat(result.succeeded).isFalse()
        val expected = listOf<TransformationStatus>(
            exampleGetCodeMigrationResponse.transformationJob().status(),
            TransformationStatus.FAILED,
        )
        assertThat(expected).isEqualTo(mutableList)
        verify(clientAdaptorSpy, times(2)).getCodeModernizationJob(any())
    }
}
