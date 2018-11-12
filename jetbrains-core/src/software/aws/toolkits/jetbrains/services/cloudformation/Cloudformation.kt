// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.CloudFormationException
import software.amazon.awssdk.services.cloudformation.model.DescribeStacksRequest
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.aws.toolkits.core.utils.wait
import software.aws.toolkits.resources.message
import java.time.Duration

fun CloudFormationClient.waitForStackDeletionComplete(stackName: String, maxAttempts: Int = 120, delay: Duration = Duration.ofSeconds(20)) {
    wait(
        call = { this.describeStacks(DescribeStacksRequest.builder().stackName(stackName).build()).stacks()[0] },
        success = { stack -> stack.stackStatus() in setOf(StackStatus.DELETE_COMPLETE) },
        fail = { stack ->
            if (stack.stackStatus() in setOf(StackStatus.DELETE_FAILED, StackStatus.ROLLBACK_FAILED, StackStatus.CREATE_FAILED, StackStatus.UPDATE_ROLLBACK_IN_PROGRESS, StackStatus.UPDATE_ROLLBACK_FAILED)) {
                message("cloudformation.delete_stack.failed", stack.stackName(), stack.stackStatus())
            } else null
        },
        successByException = { e -> e is CloudFormationException && e.awsErrorDetails().errorCode() == "ValidationError" },
        timeoutErrorMessage = message("cloudformation.delete_stack.timeout", stackName, maxAttempts * delay.seconds),
        attempts = maxAttempts,
        delay = delay
    )
}