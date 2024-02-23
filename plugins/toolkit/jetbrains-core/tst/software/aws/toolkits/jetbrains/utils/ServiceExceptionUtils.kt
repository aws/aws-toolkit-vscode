// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import software.amazon.awssdk.awscore.exception.AwsServiceException
import software.amazon.awssdk.core.exception.SdkException

// https://github.com/aws/aws-toolkit-vscode/blob/bf612d8c7477316a5f2e4bd591966b78d449846d/src/test/setupUtil.ts#L139-L150
val ARN_REGEX = "arn:(aws|aws-cn|aws-us-gov):(?:.*?):(.*?):(.*?):.".toRegex()

fun scrubException(e: Exception): Exception {
    if (e is AwsServiceException && e.awsErrorDetails() != null) {
        return e.toBuilder()
            .message(scrubArn(e.message))
            .awsErrorDetails(e.awsErrorDetails().toBuilder().errorMessage(scrubArn(e.awsErrorDetails().errorMessage())).build())
            .build().apply {
                stackTrace = e.stackTrace
            }
    }

    if (e is SdkException) {
        return e.toBuilder()
            .message(scrubArn(e.message))
            .build().apply {
                stackTrace = e.stackTrace
            }
    }

    return e
}

private fun scrubArn(s: String?) = s?.let { message ->
    ARN_REGEX.replace(message) {
        val (_partition, region, account) = it.destructured

        var ret = it.value
        if (region.isNotBlank()) {
            ret = ret.replace(region, "***")
        }
        if (account.isNotBlank()) {
            ret = ret.replace(account, "***")
        }

        ret
    }
}
