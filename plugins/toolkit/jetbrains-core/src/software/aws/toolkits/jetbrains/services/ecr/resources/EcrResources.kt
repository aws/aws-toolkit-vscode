// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr.resources

import software.amazon.awssdk.services.ecr.EcrClient
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.services.ecr.toToolkitEcrRepository

object EcrResources {
    @JvmStatic
    val LIST_REPOS: Resource.Cached<List<Repository>> = ClientBackedCachedResource(EcrClient::class, "ecr.list_repos") {
        describeRepositoriesPaginator().repositories().toList().mapNotNull {
            it.toToolkitEcrRepository()
        }
    }

    fun listTags(repositoryName: String): Resource.Cached<List<String>> = ClientBackedCachedResource(EcrClient::class, "ecr.list_tags.$repositoryName") {
        describeImagesPaginator { it.repositoryName(repositoryName) }.imageDetails().flatMap { it.imageTags() }.filterNotNull()
    }
}

/**
 * The SDK version of repository has every field nullable, but if a repo has no name, arn,
 * or URI it is not valid. So, add a small data class to fix nullability issues
 */
data class Repository(
    val repositoryName: String,
    val repositoryArn: String,
    val repositoryUri: String
)
