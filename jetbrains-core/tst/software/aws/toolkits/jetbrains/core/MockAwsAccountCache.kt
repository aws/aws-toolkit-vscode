// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.utils.delegateMock

class MockAwsAccountCache : AwsAccountCache {
    override fun awsAccount(credentialProvider: ToolkitCredentialsProvider): String? =
        tryOrNull {
            credentialProvider.getAwsAccount(delegateMock())
        }
}