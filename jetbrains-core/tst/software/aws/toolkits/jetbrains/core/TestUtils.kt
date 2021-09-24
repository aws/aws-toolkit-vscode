// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.project.Project
import org.mockito.kotlin.mock
import software.amazon.awssdk.services.apprunner.model.ServiceStatus
import software.amazon.awssdk.services.apprunner.model.ServiceSummary
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.amazon.awssdk.services.cloudformation.model.StackSummary
import software.amazon.awssdk.services.cloudwatchlogs.model.LogGroup
import software.amazon.awssdk.services.lambda.model.FunctionConfiguration
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.lambda.model.TracingConfigResponse
import software.amazon.awssdk.services.lambda.model.TracingMode
import software.amazon.awssdk.services.s3.model.Bucket
import software.amazon.awssdk.services.schemas.model.RegistrySummary
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.services.apprunner.resources.AppRunnerResources
import software.aws.toolkits.jetbrains.services.cloudformation.resources.CloudFormationResources
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.resources.CloudWatchResources
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResources
import software.aws.toolkits.jetbrains.services.ecr.resources.EcrResources
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import software.aws.toolkits.jetbrains.services.lambda.resources.LambdaResources
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import software.aws.toolkits.jetbrains.services.sqs.resources.SqsResources
import java.io.File
import java.util.concurrent.CompletableFuture

fun MockResourceCacheRule.fillResourceCache(project: Project) {
    this.addEntry(
        project,
        EcsResources.LIST_CLUSTER_ARNS,
        listOf("arn2", "arn3")
    )

    this.addEntry(
        project,
        S3Resources.LIST_REGIONALIZED_BUCKETS,
        listOf(S3Resources.RegionalizedBucket(Bucket.builder().name("abc").build(), AwsRegion.GLOBAL))
    )

    this.addEntry(
        project,
        makeMockList("arn2"),
        listOf("service1", "service2")
    )

    this.addEntry(
        project,
        makeMockList("arn3"),
        listOf("service1", "service2")
    )

    this.addEntry(
        project,
        DynamicResources.listTypes(),
        CompletableFuture.completedFuture(listOf("Aws::Sample::Resource"))
    )

    this.addEntry(
        project,
        AppRunnerResources.LIST_SERVICES,
        listOf(ServiceSummary.builder().serviceName("sample-service").status(ServiceStatus.OPERATION_IN_PROGRESS).build())
    )

    this.addEntry(
        project,
        CloudFormationResources.ACTIVE_STACKS,
        listOf(StackSummary.builder().stackName("sample-stack").stackId("sample-stack-ID").stackStatus(StackStatus.CREATE_COMPLETE).build())
    )

    this.addEntry(
        project,
        CloudWatchResources.LIST_LOG_GROUPS,
        listOf(LogGroup.builder().arn("sample-arn").logGroupName("sample-lg-name").build())
    )

    this.addEntry(
        project,
        EcrResources.LIST_REPOS,
        listOf(Repository("sample-repo-name", "sample-repo-arn", "sample-repo-uri"))
    )

    this.addEntry(
        project,
        LambdaResources.LIST_FUNCTIONS,
        listOf(
            FunctionConfiguration.builder()
                .functionName("sample-function")
                .functionArn("arn:aws:lambda:us-west-2:0123456789:function:sample-function")
                .lastModified("A ways back")
                .handler("blah:blah")
                .runtime(Runtime.JAVA8)
                .role("SomeRoleArn")
                .environment { it.variables(emptyMap()) }
                .timeout(60)
                .memorySize(128)
                .tracingConfig(TracingConfigResponse.builder().mode(TracingMode.PASS_THROUGH).build())
                .build()
        )
    )

    this.addEntry(
        project,
        SchemasResources.LIST_REGISTRIES,
        listOf(RegistrySummary.builder().registryName("sample-registry-name").build())
    )

    this.addEntry(
        project,
        SqsResources.LIST_QUEUE_URLS,
        listOf("https://sqs.us-east-1.amazonaws.com/123456789012/test1")
    )


    this.addEntry(
        project, DynamicResources.getResourceSchema("AWS::Log::LogGroup"),
        CompletableFuture.completedFuture(getDummySchema())
    )
}

fun makeMockList(clusterArn: String): Resource.Cached<List<String>> = mock {
    on { id }.thenReturn("ecs.list_services.$clusterArn")
}

fun getDummySchema() : File {
    val schema = "{\n" +
        "  \"properties\": {\n" +
        "    \"RetentionInDays\": {\n" +
        "      \"description\": \"The number of days to retain the log events " +
        "in the specified log group. Possible values are: 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653.\",\n" +
        "      \"type\": \"integer\",\n" +
        "      \"enum\": [\n" +
        "        1,\n" +
        "        3,\n" +
        "        5,\n" +
        "        7,\n" +
        "        14,\n" +
        "        30,\n" +
        "        60,\n" +
        "        90,\n" +
        "        120,\n" +
        "        150,\n" +
        "        180,\n" +
        "        365,\n" +
        "        400,\n" +
        "        545,\n" +
        "        731,\n" +
        "        1827,\n" +
        "        3653\n" +
        "      ]\n" +
        "    }" +
        "  }\n" +
        "}\n"

    val schemaFile = File.createTempFile("AWSLogLogGroupSchema", ".json")
    schemaFile.writeText(schema)
    return schemaFile
}
