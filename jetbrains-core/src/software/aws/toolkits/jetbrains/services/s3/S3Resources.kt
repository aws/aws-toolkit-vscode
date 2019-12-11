// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.utils.listBucketsByRegion
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

object S3Resources {
    @JvmStatic
    fun listBucketsByActiveRegion(project: Project): Resource<List<String>> {
        val activeRegion = ProjectAccountSettingsManager.getInstance(project).activeRegion
        return ClientBackedCachedResource(S3Client::class, "s3.list_buckets(${activeRegion.id})") {
            listBucketsByRegion(activeRegion.id).map { it.name() }.toList()
        }
    }

    @JvmStatic
    fun formatDate(date: Instant): String {
        val datetime = LocalDateTime.ofInstant(date, ZoneId.systemDefault())
        return datetime.atZone(ZoneId.systemDefault())
            .format(DateTimeFormatter.ofPattern("MMM d YYYY hh:mm:ss a z"))
    }
}
