// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.aws.toolkits.jetbrains.utils.runUnderProgressIfNeeded
import software.aws.toolkits.resources.message

/**
 * Offloads fetching credentials to a background task and a modal progress bar if the current thread is EDT
 */
class CorrectThreadCredentialsProvider(private val delegate: AwsCredentialsProvider) : AwsCredentialsProvider {
    override fun resolveCredentials(): AwsCredentials = runUnderProgressIfNeeded(null, message("credentials.retrieving"), cancelable = false) {
        delegate.resolveCredentials()
    }
}
