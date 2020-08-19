// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.resources

import software.amazon.awssdk.services.sns.SnsClient
import software.amazon.awssdk.services.sns.model.Topic
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource

object SnsResources {
    val LIST_TOPICS: Resource.Cached<List<Topic>> = ClientBackedCachedResource(SnsClient::class, "sns.list_topics") {
        listTopicsPaginator().topics().toList()
    }
}

fun Topic.getName(): String = topicArn().substringAfterLast(':')
