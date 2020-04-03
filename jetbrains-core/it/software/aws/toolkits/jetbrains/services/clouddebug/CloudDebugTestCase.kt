// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import com.intellij.openapi.project.Project
import com.intellij.testFramework.RuleChain
import com.nhaarman.mockitokotlin2.mock
import org.junit.After
import org.junit.Before
import org.junit.Rule
import software.amazon.awssdk.http.apache.ApacheHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.ecs.EcsClient
import software.amazon.awssdk.services.ecs.model.AssignPublicIp
import software.amazon.awssdk.services.ecs.model.LaunchType
import software.amazon.awssdk.services.ecs.model.Service
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.rules.ECSTemporaryServiceRule
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.credentials.runUnderRealCredentials
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.services.clouddebug.actions.DeinstrumentResourceFromExplorerAction
import software.aws.toolkits.jetbrains.services.clouddebug.actions.InstrumentResourceAction
import software.aws.toolkits.jetbrains.services.ecs.EcsUtils
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import software.aws.toolkits.jetbrains.services.ecs.waitForServicesInactive
import software.aws.toolkits.jetbrains.services.ecs.waitForServicesStable
import software.aws.toolkits.jetbrains.utils.rules.CloudFormationLazyInitRule
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

abstract class CloudDebugTestCase(private val taskDefName: String) {
    protected lateinit var service: Service
    private lateinit var instrumentationRole: String
    private lateinit var instrumentedService: Service

    private val cfnRule = CloudFormationLazyInitRule(
        "CloudDebugTestCluster",
        CloudDebugTestCase::class.java.getResource("/cloudDebugTestCluster.yaml").readText(),
        emptyList(),
        cloudFormationClient
    )

    private val ecsRule = ECSTemporaryServiceRule(ecsClient)

    @Rule
    @JvmField
    val chain = RuleChain(cfnRule, ecsRule)

    @Before
    open fun setUp() {
        // does not validate that a SSM session is successfully created
        val region = AwsRegion("us-west-2", "US West 2", "aws")
        MockRegionProvider.getInstance().addRegion(region)
        ProjectAccountSettingsManager.getInstance(getProject()).changeRegion(region)
        instrumentationRole = cfnRule.outputs["TaskRole"] ?: throw RuntimeException("Could not find instrumentation role in CloudFormation outputs")
        service = createService()
        runUnderRealCredentials(getProject()) {
            println("Instrumenting service")
            instrumentService()
            val instrumentedServiceName = "cloud-debug-${EcsUtils.serviceArnToName(service.serviceArn())}"
            println("Waiting for $instrumentedServiceName to stabilize")
            ecsRule.ecsClient.waitForServicesStable(service.clusterArn(), instrumentedServiceName, waitForMissingServices = true)
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
        // TODO: this doesn't wait for the revert command to complete but fulfills our need to cleanup
        if (::instrumentedService.isInitialized) {
            runUnderRealCredentials(getProject()) {
                deinstrumentService()
                println("Waiting for ${instrumentedService.serviceArn()} to be deinstrumented")
                ecsClient.waitForServicesInactive(instrumentedService.clusterArn(), instrumentedService.serviceArn())
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
        ecsRule.ecsClient.waitForServicesStable(service.clusterArn(), service.serviceArn(), waitForMissingServices = true)

        return service
    }

    // TODO: delete these horrible mocks once we have a sane implementation...
    fun setUpMocks() {
        runUnderRealCredentials(getProject()) {
            MockResourceCache.getInstance(getProject()).let {
                val mockInstrumentedResources = mock<Resource.Cached<Map<String, String>>> {
                    on { id }.thenReturn("cdb.list_resources")
                }
                it.addEntry(EcsResources.describeService(instrumentedService.clusterArn(), instrumentedService.serviceArn()), instrumentedService)
                it.addEntry(mockInstrumentedResources, mapOf(service.serviceArn() to instrumentationRole))
                it.addEntry(
                    EcsResources.describeTaskDefinition(instrumentedService.taskDefinition()),
                    ecsClient.describeTaskDefinition { builder -> builder.taskDefinition(instrumentedService.taskDefinition()) }.taskDefinition()
                )
            }
        }
    }

    private fun awaitCli(latch: CountDownLatch) = { result: Boolean ->
        latch.countDown()
        if (!result) {
            throw RuntimeException("CLI didn't complete successfully!")
        }
    }

    private fun instrumentService() {
        val latch = CountDownLatch(1)
        InstrumentResourceAction.performAction(getProject(), service.clusterArn(), service.serviceArn(), instrumentationRole, null, awaitCli(latch))
        latch.await(5, TimeUnit.MINUTES)
    }

    private fun deinstrumentService() {
        val latch = CountDownLatch(1)
        DeinstrumentResourceFromExplorerAction.performAction(
            getProject(),
            service.clusterArn(),
            EcsUtils.originalServiceName(instrumentedService.serviceName()),
            null,
            awaitCli(latch)
        )
        latch.await(5, TimeUnit.MINUTES)
    }

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
