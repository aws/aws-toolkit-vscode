// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import com.intellij.openapi.project.Project
import com.intellij.testFramework.RuleChain
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.mockito.kotlin.mock
import software.amazon.awssdk.core.waiters.WaiterOverrideConfiguration
import software.amazon.awssdk.http.apache.ApacheHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.ecs.EcsClient
import software.amazon.awssdk.services.ecs.model.AssignPublicIp
import software.amazon.awssdk.services.ecs.model.DescribeServicesRequest
import software.amazon.awssdk.services.ecs.model.LaunchType
import software.amazon.awssdk.services.ecs.model.Service
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.rules.ECSTemporaryServiceRule
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.runUnderRealCredentials
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.services.clouddebug.actions.DeinstrumentResourceFromExplorerAction
import software.aws.toolkits.jetbrains.services.clouddebug.actions.InstrumentResourceAction
import software.aws.toolkits.jetbrains.services.ecs.EcsUtils
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import software.aws.toolkits.jetbrains.utils.rules.CloudFormationLazyInitRule
import java.nio.file.Paths
import java.time.Duration

abstract class CloudDebugTestCase(private val taskDefName: String) {
    protected lateinit var service: Service
    private lateinit var instrumentationRole: String
    private lateinit var instrumentedService: Service

    private val cfnRule = CloudFormationLazyInitRule(
        "CloudDebugTestCluster",
        Paths.get(System.getProperty("testDataPath"), "testFiles", "cloudDebugTestCluster.yaml").toFile().readText(),
        emptyList(),
        cloudFormationClient
    )

    private val ecsRule = ECSTemporaryServiceRule(ecsClient)

    @Rule
    @JvmField
    val chain = RuleChain(cfnRule, ecsRule)

    @Rule
    @JvmField
    val resourceCache = MockResourceCacheRule()

    @Rule
    @JvmField
    val mockRegionProvider = MockRegionProviderRule()

    @Before
    open fun setUp() {
        // does not validate that a SSM session is successfully created
        val region = AwsRegion("us-west-2", "US West 2", "aws")
        mockRegionProvider.addRegion(region)
        AwsConnectionManager.getInstance(getProject()).changeRegion(region)
        instrumentationRole = cfnRule.outputs["TaskRole"] ?: throw RuntimeException("Could not find instrumentation role in CloudFormation outputs")
        service = createService()
        runUnderRealCredentials(getProject()) {
            println("Instrumenting service")
            instrumentService()
            val instrumentedServiceName = instrumentedServiceName()
            println("Waiting for $instrumentedServiceName to stabilize")
            ecsRule.ecsClient.waiter().waitUntilServicesStable {
                it.cluster(service.clusterArn())
                it.services(instrumentedServiceName)
            }
            instrumentedService = ecsRule.ecsClient.describeServices {
                it.cluster(service.clusterArn())
                it.services(instrumentedServiceName)
            }.services().first()
            // TODO: verify that no error toasts were created, or similar mechanism
        }

        println("Done with base service setup")
    }

    @After
    open fun tearDown() {
        try {
            deinstrumentService()
        } finally {
            // If deinstrumenting fails, or initialization doesn't work properly, we still want to try to delete the services, so kick that off
            runCatching { ecsClient.deleteService { it.cluster(service.clusterArn()).service(service.serviceArn()).force(true) } }
            runCatching { ecsClient.deleteService { it.cluster(service.clusterArn()).service(instrumentedServiceName()).force(true) } }
        }
    }

    private fun deinstrumentService() {
        // TODO: this doesn't wait for the revert command to complete but fulfills our need to cleanup
        if (::instrumentedService.isInitialized) {
            runUnderRealCredentials(getProject()) {
                DeinstrumentResourceFromExplorerAction.performAction(
                    getProject(),
                    service.clusterArn(),
                    EcsUtils.originalServiceName(instrumentedService.serviceName()),
                    null
                )
                println("Waiting for ${instrumentedService.serviceArn()} to be deinstrumented")
                ecsClient.waiter().waitUntilServicesInactive(
                    DescribeServicesRequest.builder().cluster(instrumentedService.clusterArn()).services(instrumentedService.serviceArn()).build(),
                    WaiterOverrideConfiguration.builder().waitTimeout(Duration.ofMinutes(5)).build()
                )
            }
            // TODO: verify that no error toasts were created, or similar mechanism
        }
    }

    private fun createService(): Service {
        val cfnOutputs = cfnRule.outputs
        val service = ecsRule.createService {
            it.desiredCount(0)
            it.taskDefinition(taskDefName)
            it.cluster("CloudDebugTestECSCluster")
            it.launchType(LaunchType.FARGATE)
            it.networkConfiguration { networkConfig ->
                networkConfig.awsvpcConfiguration { vpcConfig ->
                    vpcConfig.assignPublicIp(AssignPublicIp.ENABLED)
                    vpcConfig.subnets(cfnOutputs["SubnetA"])
                    vpcConfig.securityGroups(cfnOutputs["SecurityGroup"])
                }
            }
        }
        println("Waiting for ${service.serviceArn()} to be stable")
        ecsRule.ecsClient.waiter().waitUntilServicesStable {
            it.cluster(service.clusterArn())
            it.services(service.serviceArn())
        }

        return service
    }

    // TODO: delete these horrible mocks once we have a sane implementation...
    fun setUpMocks() {
        runUnderRealCredentials(getProject()) {
            val project = getProject()
            val mockInstrumentedResources = mock<Resource.Cached<Map<String, String>>> {
                on { id }.thenReturn("cdb.list_resources")
            }
            resourceCache.addEntry(
                project,
                EcsResources.describeService(instrumentedService.clusterArn(), instrumentedService.serviceArn()),
                instrumentedService
            )
            resourceCache.addEntry(project, mockInstrumentedResources, mapOf(service.serviceArn() to instrumentationRole))
            resourceCache.addEntry(
                project,
                EcsResources.describeTaskDefinition(instrumentedService.taskDefinition()),
                ecsClient.describeTaskDefinition { builder -> builder.taskDefinition(instrumentedService.taskDefinition()) }.taskDefinition()
            )
        }
    }

    private fun instrumentService() {
        InstrumentResourceAction.performAction(getProject(), service.clusterArn(), service.serviceArn(), instrumentationRole, null)
        println("Waiting for ${service.serviceArn()} to be instrumented")
        ecsClient.waiter().waitUntilServicesStable(
            DescribeServicesRequest.builder().cluster(service.clusterArn()).services(instrumentedServiceName()).build(),
            WaiterOverrideConfiguration.builder().waitTimeout(Duration.ofMinutes(5)).build()
        )
    }

    private fun instrumentedServiceName() = "cloud-debug-${EcsUtils.serviceArnToName(service.serviceArn())}"

    abstract fun getProject(): Project

    companion object {
        private val cloudFormationClient = CloudFormationClient.builder()
            .httpClient(ApacheHttpClient.builder().build())
            .region(Region.US_WEST_2)
            .build()

        private val ecsClient = EcsClient.builder()
            .httpClient(ApacheHttpClient.builder().build())
            .region(Region.US_WEST_2)
            .build()
    }
}
