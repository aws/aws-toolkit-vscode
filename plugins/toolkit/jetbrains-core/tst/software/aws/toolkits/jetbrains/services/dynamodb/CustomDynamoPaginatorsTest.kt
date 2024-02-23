// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.ExecuteStatementRequest
import software.amazon.awssdk.services.dynamodb.model.ExecuteStatementResponse
import software.aws.toolkits.core.utils.delegateMock
import software.aws.toolkits.jetbrains.services.dynamodb.DynamoDbUtils.executeStatementPaginator

class CustomDynamoPaginatorsTest {
    @Test
    fun `execute statement paginator works`() {
        val statement = "statement"

        val mockClient = delegateMock<DynamoDbClient> {
            on { executeStatement(any<ExecuteStatementRequest>()) }
                .thenReturn(ExecuteStatementResponse.builder().nextToken("token").build())
                .thenReturn(ExecuteStatementResponse.builder().nextToken("token2").build())
                .thenReturn(ExecuteStatementResponse.builder().build())
        }

        assertThat(mockClient.executeStatementPaginator(ExecuteStatementRequest.builder().statement(statement).build()).toList()).hasSize(3)

        argumentCaptor<ExecuteStatementRequest> {
            verify(mockClient, times(3)).executeStatement(capture())

            assertThat(firstValue.nextToken()).isNull()
            assertThat(firstValue.statement()).isEqualTo(statement)

            assertThat(secondValue.nextToken()).isEqualTo("token")
            assertThat(secondValue.statement()).isEqualTo(statement)

            assertThat(thirdValue.nextToken()).isEqualTo("token2")
            assertThat(thirdValue.statement()).isEqualTo(statement)
        }
    }

    @Test
    fun `execute statement paginator bubbles errors`() {
        val error = IllegalStateException("Dummy error")
        val mockClient = delegateMock<DynamoDbClient> {
            on { executeStatement(any<ExecuteStatementRequest>()) }
                .thenThrow(error)
        }

        assertThatThrownBy {
            mockClient.executeStatementPaginator(ExecuteStatementRequest.builder().statement("statement").build()).toList()
        }.isEqualTo(error)

        verify(mockClient, times(1)).executeStatement(any<ExecuteStatementRequest>())
    }

    @Test
    fun `execute statement paginator bubbles errors on subsequent pages`() {
        val error = IllegalStateException("Dummy error")
        val mockClient = delegateMock<DynamoDbClient> {
            on { executeStatement(any<ExecuteStatementRequest>()) }
                .thenReturn(ExecuteStatementResponse.builder().nextToken("token").build())
                .thenReturn(ExecuteStatementResponse.builder().nextToken("token2").build())
                .thenThrow(error)
        }

        assertThatThrownBy {
            mockClient.executeStatementPaginator(ExecuteStatementRequest.builder().statement("statement").build()).toList()
        }.isEqualTo(error)

        verify(mockClient, times(3)).executeStatement(any<ExecuteStatementRequest>())
    }
}
