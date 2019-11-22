// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import com.intellij.openapi.application.ApplicationManager
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.ChangeSetStatus
import software.amazon.awssdk.services.cloudformation.model.CloudFormationException
import software.amazon.awssdk.services.cloudformation.model.DescribeStacksRequest
import software.amazon.awssdk.services.cloudformation.model.Stack
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.aws.toolkits.core.utils.wait
import software.aws.toolkits.resources.message
import java.time.Duration

fun CloudFormationClient.executeChangeSetAndWait(stackName: String, changeSet: String) {
    val isCreate = try {
        val describeStack = this.describeStacks { it.stackName(stackName) }
        describeStack.stacks().firstOrNull()?.stackStatus() == StackStatus.REVIEW_IN_PROGRESS
    } catch (e: CloudFormationException) {
        if (e.message?.contains("Stack with id $stackName does not exist") == true) {
            true
        } else {
            throw e
        }
    }

    this.executeChangeSet { it.stackName(stackName).changeSetName(changeSet) }

    if (isCreate) {
        this.waitForStackCreateComplete(stackName)
    } else {
        this.waitForStackUpdateComplete(stackName)
    }
}

fun CloudFormationClient.describeStack(stackName: String, callback: (Stack?) -> Unit) {
    ApplicationManager.getApplication().executeOnPooledThread {
        val stack = this.describeStacks { it.stackName(stackName) }.stacks().firstOrNull()
        callback(stack)
    }
}

private val CFN_CREATE_FAILURE_TERMINAL_STATES = setOf(
    StackStatus.CREATE_FAILED,
    StackStatus.DELETE_COMPLETE,
    StackStatus.DELETE_FAILED,
    StackStatus.ROLLBACK_FAILED,
    StackStatus.ROLLBACK_COMPLETE
)

fun CloudFormationClient.waitForStackCreateComplete(
    stackName: String,
    maxAttempts: Int = 720,
    delay: Duration = Duration.ofSeconds(5)
) {
    wait(
        call = { this.describeStacks(DescribeStacksRequest.builder().stackName(stackName).build()).stacks()[0] },
        success = { stack -> stack.stackStatus() == StackStatus.CREATE_COMPLETE },
        fail = { stack ->
            if (stack.stackStatus() in CFN_CREATE_FAILURE_TERMINAL_STATES) {
                message("cloudformation.create_stack.failed", stack.stackName(), stack.stackStatus())
            } else {
                null
            }
        },
        failByException = { e ->
            if (e is CloudFormationException && e.awsErrorDetails().errorCode() == "ValidationError") {
                message("cloudformation.create_stack.failed_validation", stackName)
            } else {
                null
            }
        },
        timeoutErrorMessage = message("cloudformation.create_stack.timeout", stackName, maxAttempts * delay.seconds),
        attempts = maxAttempts,
        delay = delay
    )
}

private val CFN_UPDATE_FAILURE_TERMINAL_STATES = setOf(
    StackStatus.UPDATE_ROLLBACK_COMPLETE,
    StackStatus.UPDATE_ROLLBACK_FAILED
)

fun CloudFormationClient.waitForStackUpdateComplete(
    stackName: String,
    maxAttempts: Int = 720,
    delay: Duration = Duration.ofSeconds(5)
) {
    wait(
        call = { this.describeStacks(DescribeStacksRequest.builder().stackName(stackName).build()).stacks()[0] },
        success = { stack -> stack.stackStatus() == StackStatus.UPDATE_COMPLETE },
        fail = { stack ->
            if (stack.stackStatus() in CFN_UPDATE_FAILURE_TERMINAL_STATES) {
                message("cloudformation.update_stack.failed", stack.stackName(), stack.stackStatus())
            } else {
                null
            }
        },
        failByException = { e ->
            if (e is CloudFormationException && e.awsErrorDetails().errorCode() == "ValidationError") {
                message("cloudformation.update_stack.failed_validation", stackName)
            } else {
                null
            }
        },
        timeoutErrorMessage = message("cloudformation.update_stack.timeout", stackName, maxAttempts * delay.seconds),
        attempts = maxAttempts,
        delay = delay
    )
}

private val CFN_DELETE_FAILURE_TERMINAL_STATES = setOf(
    StackStatus.CREATE_FAILED,
    StackStatus.DELETE_FAILED,
    StackStatus.ROLLBACK_FAILED,
    StackStatus.UPDATE_ROLLBACK_IN_PROGRESS,
    StackStatus.UPDATE_ROLLBACK_FAILED
)

fun CloudFormationClient.waitForStackDeletionComplete(
    stackName: String,
    maxAttempts: Int = 120,
    delay: Duration = Duration.ofSeconds(20)
) {
    wait(
        call = { this.describeStacks(DescribeStacksRequest.builder().stackName(stackName).build()).stacks()[0] },
        success = { stack -> stack.stackStatus() == StackStatus.DELETE_COMPLETE },
        fail = { stack ->
            if (stack.stackStatus() in CFN_DELETE_FAILURE_TERMINAL_STATES) {
                message("cloudformation.delete_stack.failed", stack.stackName(), stack.stackStatus())
            } else null
        },
        successByException = { e -> e is CloudFormationException && e.awsErrorDetails().errorCode() == "ValidationError" },
        timeoutErrorMessage = message("cloudformation.delete_stack.timeout", stackName, maxAttempts * delay.seconds),
        attempts = maxAttempts,
        delay = delay
    )
}

fun CloudFormationClient.waitForChangeSetCreateComplete(
    stackName: String,
    changeSetName: String,
    maxAttempts: Int = 120,
    delay: Duration = Duration.ofSeconds(2)
) {
    wait(
        call = {
            describeChangeSet {
                it.stackName(stackName)
                it.changeSetName(changeSetName)
            }
        },
        success = { it.status() == ChangeSetStatus.CREATE_COMPLETE },
        fail = {
            if (it.status() == ChangeSetStatus.FAILED) {
                it.statusReason()
            } else {
                null
            }
        },
        attempts = maxAttempts,
        delay = delay
    )
}
